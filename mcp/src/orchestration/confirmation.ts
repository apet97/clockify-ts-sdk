import { Buffer } from "node:buffer";
import { createHash, randomBytes } from "node:crypto";

import type { ToolRisk } from "../tool-risk.js";

export interface IssuedConfirmation {
    confirmToken: string;
    previewHash: string;
    expiresAt: string;
}

/** Async storage boundary for local memory and durable remote confirmations. */
export interface ConfirmationStore {
    issue(scope: ConfirmationScope, preview: unknown): Promise<IssuedConfirmation>;
    consume(confirmToken: string, scope: ConfirmationScope): Promise<unknown>;
}

interface StoredConfirmation {
    toolName: string;
    workspaceId: string;
    risk: ToolRisk;
    businessArgsHash: string;
    previewHash: string;
    preview: unknown;
    previewBytes: number;
    expiresAt: number;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

/** The scope a guarded execution must match before its stored preview is released. */
export interface ConfirmationScope {
    toolName: string;
    workspaceId: string;
    risk: ToolRisk;
    businessArgs: JsonRecord;
}

export class ConfirmationTokenStore implements ConfirmationStore {
    private readonly ttlMs: number;
    private readonly maxEntries: number;
    private readonly maxTotalBytes: number;
    private readonly now: () => number;
    private readonly tokens = new Map<string, StoredConfirmation>();
    private totalBytes = 0;

    constructor(
        options: {
            ttlMs?: number;
            maxEntries?: number;
            maxTotalBytes?: number;
            now?: () => number;
        } = {},
    ) {
        const suppliedTtl = options.ttlMs;
        this.ttlMs =
            typeof suppliedTtl === "number" && Number.isFinite(suppliedTtl) && suppliedTtl > 0
                ? suppliedTtl
                : 5 * 60 * 1000;
        this.maxEntries = positiveIntegerOr(options.maxEntries, DEFAULT_MAX_ENTRIES);
        this.maxTotalBytes = positiveIntegerOr(
            options.maxTotalBytes,
            DEFAULT_MAX_TOTAL_BYTES,
        );
        this.now = options.now ?? (() => Date.now());
    }

    async issue(scope: ConfirmationScope, preview: unknown): Promise<IssuedConfirmation> {
        this.pruneExpired();
        const previewJson = requireCanonicalJson(preview);
        const previewBytes = Buffer.byteLength(previewJson);
        if (previewBytes > this.maxTotalBytes) {
            throw new Error("confirmation preview exceeds the storage limit");
        }
        this.assertCapacity(previewBytes);
        const confirmToken = randomBytes(32).toString("base64url");
        const expiresAtMs = this.now() + this.ttlMs;
        const storedPreview = canonicalClone(previewJson);
        const stored: StoredConfirmation = {
            toolName: scope.toolName,
            workspaceId: scope.workspaceId,
            risk: scope.risk,
            businessArgsHash: hashCanonical(scope.businessArgs),
            previewHash: hashCanonical(storedPreview),
            preview: storedPreview,
            previewBytes,
            expiresAt: expiresAtMs,
        };
        this.tokens.set(confirmToken, stored);
        this.totalBytes += previewBytes;
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
    async consume(confirmToken: string, scope: ConfirmationScope): Promise<unknown> {
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
        this.deleteStored(confirmToken, stored);
        if (this.now() >= stored.expiresAt) {
            throw new Error("confirmation token expired");
        }
        return stored;
    }

    private pruneExpired(): void {
        const now = this.now();
        for (const [token, stored] of this.tokens) {
            if (now >= stored.expiresAt) this.deleteStored(token, stored);
        }
    }

    private assertCapacity(previewBytes: number): void {
        if (
            this.tokens.size >= this.maxEntries ||
            this.totalBytes + previewBytes > this.maxTotalBytes
        ) {
            throw new Error(
                "confirmation preview storage is at capacity; consume or wait for an existing token to expire",
            );
        }
    }

    private deleteStored(token: string, stored: StoredConfirmation): void {
        if (!this.tokens.delete(token)) return;
        this.totalBytes = Math.max(0, this.totalBytes - stored.previewBytes);
    }
}

export function hashCanonical(value: unknown): string {
    return createHash("sha256").update(requireCanonicalJson(value)).digest("hex");
}

// `JSON.stringify` is declared to return `string`, but it returns `undefined`
// for `undefined`, a function or a symbol. The return type states that.
export function canonicalJson(value: unknown): string | undefined {
    return JSON.stringify(sortValue(value));
}

/** Canonical JSON, or a clear error when the value cannot be serialized. */
function requireCanonicalJson(value: unknown): string {
    const json = canonicalJson(value);
    if (json === undefined) {
        throw new Error("confirmation preview must be JSON serializable");
    }
    return json;
}

function canonicalClone(json: string): unknown {
    return JSON.parse(json) as unknown;
}

function positiveIntegerOr(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
        ? value
        : fallback;
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
