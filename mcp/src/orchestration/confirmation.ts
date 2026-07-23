import { createHash, randomBytes } from "node:crypto";

import type { ToolRisk } from "../tool-risk.js";

export interface IssuedConfirmation {
    confirmToken: string;
    previewHash: string;
    expiresAt: string;
}

interface StoredConfirmation {
    toolName: string;
    workspaceId: string;
    risk: ToolRisk;
    businessArgsHash: string;
    previewHash: string;
    preview: unknown;
    expiresAt: number;
    used: boolean;
}

type JsonRecord = Record<string, unknown>;

/** The scope a guarded execution must match before its stored preview is released. */
export interface ConfirmationScope {
    toolName: string;
    workspaceId: string;
    risk: ToolRisk;
    businessArgs: JsonRecord;
}

export class ConfirmationTokenStore {
    private readonly ttlMs: number;
    private readonly now: () => number;
    private readonly tokens = new Map<string, StoredConfirmation>();

    constructor(options: { ttlMs?: number; now?: () => number } = {}) {
        const suppliedTtl = options.ttlMs;
        this.ttlMs =
            typeof suppliedTtl === "number" && Number.isFinite(suppliedTtl) && suppliedTtl > 0
                ? suppliedTtl
                : 5 * 60 * 1000;
        this.now = options.now ?? (() => Date.now());
    }

    issue(scope: ConfirmationScope, preview: unknown): IssuedConfirmation {
        this.pruneExpired();
        const confirmToken = randomBytes(32).toString("base64url");
        const expiresAtMs = this.now() + this.ttlMs;
        const storedPreview = canonicalClone(preview);
        const stored: StoredConfirmation = {
            toolName: scope.toolName,
            workspaceId: scope.workspaceId,
            risk: scope.risk,
            businessArgsHash: hashCanonical(scope.businessArgs),
            previewHash: hashCanonical(storedPreview),
            preview: storedPreview,
            expiresAt: expiresAtMs,
            used: false,
        };
        this.tokens.set(confirmToken, stored);
        return {
            confirmToken,
            previewHash: stored.previewHash,
            expiresAt: new Date(expiresAtMs).toISOString(),
        };
    }

    /**
     * Consume a one-use guarded token and return the canonical preview clone
     * captured during dry-run. The token is deleted before validation and can
     * never be restored by a mismatched call or a later execution failure.
     */
    consume(confirmToken: string, scope: ConfirmationScope): unknown {
        const stored = this.take(confirmToken);
        if (
            stored.toolName !== scope.toolName ||
            stored.workspaceId !== scope.workspaceId ||
            stored.risk !== scope.risk ||
            stored.businessArgsHash !== hashCanonical(scope.businessArgs)
        ) {
            throw new Error("confirmation token does not match this tool call");
        }
        if (stored.previewHash !== hashCanonical(stored.preview)) {
            throw new Error("confirmation token preview integrity check failed");
        }
        return stored.preview;
    }

    private take(confirmToken: string): StoredConfirmation {
        const stored = this.tokens.get(confirmToken);
        if (!stored) {
            throw new Error("confirmation token was not issued, expired, or was already used");
        }
        if (stored.used) {
            throw new Error("confirmation token was already used");
        }
        stored.used = true;
        this.tokens.delete(confirmToken);
        if (this.now() >= stored.expiresAt) {
            throw new Error("confirmation token expired");
        }
        return stored;
    }

    private pruneExpired(): void {
        const now = this.now();
        for (const [token, stored] of this.tokens) {
            if (now >= stored.expiresAt) this.tokens.delete(token);
        }
    }
}

export function hashCanonical(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function canonicalClone(value: unknown): unknown {
    const json = canonicalJson(value);
    if (json === undefined) {
        throw new Error("confirmation preview must be JSON serializable");
    }
    return JSON.parse(json) as unknown;
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => sortValue(item));
    if (!value || typeof value !== "object") return value;
    const sorted = Object.create(null) as JsonRecord;
    for (const key of Object.keys(value).sort()) {
        const next = (value as JsonRecord)[key];
        if (next !== undefined) sorted[key] = sortValue(next);
    }
    return sorted;
}
