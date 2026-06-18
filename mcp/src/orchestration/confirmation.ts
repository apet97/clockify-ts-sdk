import { createHash, randomBytes } from "node:crypto";

export interface ConfirmationPayload {
    toolName: string;
    workspaceId: string;
    riskClass: string;
    argsHash: string;
    previewHash: string;
}

export interface IssuedConfirmation {
    confirmToken: string;
    previewHash: string;
    expiresAt: string;
}

interface StoredConfirmation {
    payload: ConfirmationPayload;
    expiresAt: number;
}

type JsonRecord = Record<string, unknown>;

export class ConfirmationTokenStore {
    private readonly ttlMs: number;
    private readonly now: () => number;
    private readonly tokens = new Map<string, StoredConfirmation>();

    constructor(options: { ttlMs?: number; now?: () => number } = {}) {
        this.ttlMs = options.ttlMs && options.ttlMs > 0 ? options.ttlMs : 5 * 60 * 1000;
        this.now = options.now ?? (() => Date.now());
    }

    issue(payload: ConfirmationPayload): IssuedConfirmation {
        this.pruneExpired();
        const confirmToken = randomBytes(32).toString("base64url");
        const expiresAtMs = this.now() + this.ttlMs;
        this.tokens.set(confirmToken, { payload, expiresAt: expiresAtMs });
        return {
            confirmToken,
            previewHash: hashCanonical(payload),
            expiresAt: new Date(expiresAtMs).toISOString(),
        };
    }

    validate(confirmToken: string, payload: ConfirmationPayload): void {
        this.pruneExpired();
        const stored = this.tokens.get(confirmToken);
        if (!stored) {
            throw new Error("confirmation token was not issued, expired, or was already used");
        }
        this.tokens.delete(confirmToken);
        if (this.now() >= stored.expiresAt) {
            throw new Error("confirmation token expired");
        }
        if (hashCanonical(stored.payload) !== hashCanonical(payload)) {
            throw new Error("confirmation token does not match this tool call");
        }
    }

    private pruneExpired(): void {
        const now = this.now();
        for (const [token, stored] of this.tokens) {
            if (now >= stored.expiresAt) this.tokens.delete(token);
        }
    }
}

export function confirmationPayload(
    toolName: string,
    workspaceId: string,
    riskClass: string,
    args: JsonRecord,
    preview: unknown,
): ConfirmationPayload {
    return {
        toolName,
        workspaceId,
        riskClass,
        argsHash: hashCanonical(args),
        previewHash: hashCanonical(preview),
    };
}

export function hashCanonical(value: unknown): string {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function canonicalJson(value: unknown): string {
    return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => sortValue(item));
    if (!value || typeof value !== "object") return value;
    const sorted: JsonRecord = {};
    for (const key of Object.keys(value).sort()) {
        const next = (value as JsonRecord)[key];
        if (next !== undefined) sorted[key] = sortValue(next);
    }
    return sorted;
}
