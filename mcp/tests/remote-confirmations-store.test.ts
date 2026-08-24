import { describe, expect, it } from "vitest";

import type { ConfirmationScope } from "../src/orchestration/confirmation.js";
import { PostgresConfirmationStore, pruneExpiredConfirmations } from "../src/remote/confirmations.js";
import {
    AesGcmKeyring,
    confirmationAssociatedData,
    sha256,
} from "../src/remote/crypto.js";
import type {
    QueryResult,
    SqlConnection,
    SqlPool,
} from "../src/remote/types.js";

const WORKSPACE = "65b382b606de527a7ee2b60e";
const CREATED_AT = new Date("2030-01-02T03:04:05.000Z");
const EXPIRES_AT = new Date("2030-01-02T03:09:05.000Z");
const BINDING = {
    principalId: "principal-one",
    oauthClientId: "client-one",
    credentialId: "credential-one",
    credentialRevision: 3n,
    workspaceId: WORKSPACE,
};

describe("PostgreSQL confirmation store", () => {
    it("encrypts an exact preview, consumes it once, and stores only its token hash", async () => {
        const encryption = keyring();
        const pool = new ConfirmationPool();
        const store = new PostgresConfirmationStore(pool, encryption, BINDING);
        const preview = { nested: { z: 2, a: 1 }, action: "update" };

        const issued = await store.issue(scope(), preview);

        expect(issued.confirmToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(issued.expiresAt).toBe(EXPIRES_AT.toISOString());
        expect(pool.confirmations).toHaveLength(1);
        expect(pool.confirmations[0]?.tokenHash).toBe(sha256(issued.confirmToken));
        expect(pool.persistedText()).not.toContain(issued.confirmToken);
        expect(pool.persistedText()).not.toContain("update");

        await expect(store.consume(issued.confirmToken, scope())).resolves.toEqual(preview);
        expect(pool.confirmations).toHaveLength(0);
        await expect(store.consume(issued.confirmToken, scope())).rejects.toThrow(
            /already used/u,
        );
        await expect(store.consume("not-a-token", scope())).rejects.toThrow(
            /was not issued/u,
        );
    });

    it("prevents another principal or OAuth client from observing or burning a token", async () => {
        const pool = new ConfirmationPool();
        const encryption = keyring();
        const owner = new PostgresConfirmationStore(pool, encryption, BINDING);
        const issued = await owner.issue(scope(), { action: "delete" });

        const otherClient = new PostgresConfirmationStore(pool, encryption, {
            ...BINDING,
            oauthClientId: "client-two",
        });
        await expect(otherClient.consume(issued.confirmToken, scope())).rejects.toThrow(
            /was not issued/u,
        );
        expect(pool.confirmations).toHaveLength(1);

        const otherPrincipal = new PostgresConfirmationStore(pool, encryption, {
            ...BINDING,
            principalId: "principal-two",
        });
        await expect(otherPrincipal.consume(issued.confirmToken, scope())).rejects.toThrow(
            /was not issued/u,
        );
        expect(pool.confirmations).toHaveLength(1);
        await expect(owner.consume(issued.confirmToken, scope())).resolves.toEqual({
            action: "delete",
        });
    });

    it("burns an owner's token when the arguments or credential binding are wrong", async () => {
        const pool = new ConfirmationPool();
        const encryption = keyring();
        const owner = new PostgresConfirmationStore(pool, encryption, BINDING);

        const wrongArguments = await owner.issue(scope(), { action: "archive" });
        await expect(
            owner.consume(wrongArguments.confirmToken, scope({ businessArgs: { id: "other" } })),
        ).rejects.toThrow(/does not match/u);
        await expect(owner.consume(wrongArguments.confirmToken, scope())).rejects.toThrow(
            /already used/u,
        );

        const wrongRevision = await owner.issue(scope(), { action: "archive" });
        const staleRequest = new PostgresConfirmationStore(pool, encryption, {
            ...BINDING,
            credentialRevision: 4n,
        });
        await expect(staleRequest.consume(wrongRevision.confirmToken, scope())).rejects.toThrow(
            /does not match/u,
        );
        expect(pool.confirmations).toHaveLength(0);
    });

    it("rejects invalid previews, workspaces, disabled owners, stale credentials, and quotas", async () => {
        const pool = new ConfirmationPool();
        const store = new PostgresConfirmationStore(pool, keyring(), BINDING);

        await expect(
            store.issue(scope({ workspaceId: "aaaaaaaaaaaaaaaaaaaaaaaa" }), { ok: true }),
        ).rejects.toThrow(/outside the pinned workspace/u);
        await expect(store.issue(scope(), undefined)).rejects.toThrow(/JSON serializable/u);
        await expect(
            store.issue(scope(), { text: "x".repeat(4 * 1_024 * 1_024) }),
        ).rejects.toThrow(/exceeds the storage limit/u);

        pool.principalEnabled = false;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(
            /principal is disabled or absent/u,
        );
        pool.principalEnabled = true;
        pool.credentialEnabled = false;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(
            /credential binding is no longer active/u,
        );
        pool.credentialEnabled = true;

        pool.quotaCount = 256;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(/at capacity/u);
        pool.quotaCount = 0;
        pool.quotaBytes = 4 * 1_024 * 1_024;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(/at capacity/u);
        expect(pool.confirmations).toHaveLength(0);
        expect(pool.rollbackCount).toBeGreaterThanOrEqual(4);
    });

    it("fails closed for invalid database clocks, expiry, revision, and preview integrity", async () => {
        const encryption = keyring();
        const pool = new ConfirmationPool();
        const store = new PostgresConfirmationStore(pool, encryption, BINDING);

        pool.invalidCreatedAt = true;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(
            /confirmation expiry is invalid/u,
        );
        pool.invalidCreatedAt = false;
        pool.invalidExpiresAt = true;
        await expect(store.issue(scope(), { ok: true })).rejects.toThrow(
            /confirmation expiry is invalid/u,
        );
        pool.invalidExpiresAt = false;

        const expired = await store.issue(scope(), { ok: true });
        pool.confirmations[0]!.forceExpired = true;
        await expect(store.consume(expired.confirmToken, scope())).rejects.toThrow(
            /does not match/u,
        );

        const malformedRevision = await store.issue(scope(), { ok: true });
        pool.confirmations[0]!.credentialRevision = "not-an-integer";
        await expect(store.consume(malformedRevision.confirmToken, scope())).rejects.toThrow();

        const malformedExpiry = await store.issue(scope(), { ok: true });
        pool.confirmations[0]!.expiresAt = new Date(Number.NaN);
        await expect(store.consume(malformedExpiry.confirmToken, scope())).rejects.toThrow(
            /confirmation expiry is invalid/u,
        );

        const tampered = await store.issue(scope(), { amount: 1 });
        pool.replacePreview(encryption, "{\"amount\":2}");
        await expect(store.consume(tampered.confirmToken, scope())).rejects.toThrow(
            /preview integrity check failed/u,
        );
    });

    it("prunes bounded expired rows and treats a driver null row count as zero", async () => {
        const pool = new ConfirmationPool();
        pool.cleanupRowCount = null;
        await expect(pruneExpiredConfirmations(pool)).resolves.toBe(0);
        expect(pool.cleanupLimits).toEqual([1_000]);

        pool.cleanupRowCount = 7;
        await expect(pruneExpiredConfirmations(pool, 25)).resolves.toBe(7);
        expect(pool.cleanupLimits).toEqual([1_000, 25]);
    });
});

function scope(overrides: Partial<ConfirmationScope> = {}): ConfirmationScope {
    return {
        toolName: "clockify_entries_delete",
        workspaceId: WORKSPACE,
        risk: "destructive",
        businessArgs: { id: "entry-one" },
        ...overrides,
    };
}

function keyring(): AesGcmKeyring {
    return AesGcmKeyring.fromDocument({
        version: 1,
        activeKeyId: "fixture",
        keys: { fixture: Buffer.alloc(32, 23).toString("base64") },
    });
}

interface StoredConfirmation {
    tokenHash: string;
    principalId: string;
    oauthClientId: string;
    credentialId: string;
    credentialRevision: string;
    workspaceId: string;
    toolName: string;
    risk: "destructive";
    businessArgsHash: string;
    previewHash: string;
    previewBytes: number;
    ciphertext: Buffer;
    iv: Buffer;
    tag: Buffer;
    keyId: string;
    expiresAt: Date;
    forceExpired: boolean;
}

class ConfirmationPool implements SqlPool, SqlConnection {
    readonly confirmations: StoredConfirmation[] = [];
    readonly cleanupLimits: number[] = [];
    principalEnabled = true;
    credentialEnabled = true;
    quotaCount: number | undefined;
    quotaBytes: number | undefined;
    invalidCreatedAt = false;
    invalidExpiresAt = false;
    cleanupRowCount: number | null = 0;
    rollbackCount = 0;
    releaseCount = 0;

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
        if (text === "BEGIN" || text === "COMMIT") return rows([]);
        if (text === "ROLLBACK") {
            this.rollbackCount += 1;
            return rows([]);
        }
        if (text.startsWith("WITH expired AS")) {
            this.cleanupLimits.push(Number(values[0]));
            return result([], this.cleanupRowCount);
        }
        if (text.includes("SELECT id FROM mcp_principals")) {
            return this.principalEnabled ? rows([{ id: BINDING.principalId }]) : rows([]);
        }
        if (text.includes("FROM mcp_credentials")) {
            const matches =
                this.credentialEnabled &&
                values[0] === BINDING.credentialId &&
                values[1] === BINDING.principalId &&
                values[2] === BINDING.credentialRevision.toString() &&
                values[3] === BINDING.workspaceId;
            return matches ? rows([{ id: BINDING.credentialId }]) : rows([]);
        }
        if (text.includes("count(*)::text AS preview_count")) {
            return rows([{
                preview_count: String(this.quotaCount ?? this.confirmations.length),
                preview_bytes: String(
                    this.quotaBytes ?? this.confirmations.reduce((sum, row) => sum + row.previewBytes, 0),
                ),
            }]);
        }
        if (text.includes("SELECT now() AS created_at")) {
            return rows([{
                created_at: this.invalidCreatedAt ? "invalid" : CREATED_AT,
                expires_at: this.invalidExpiresAt ? "invalid" : EXPIRES_AT,
            }]);
        }
        if (text.includes("INSERT INTO mcp_confirmations")) {
            this.confirmations.push(confirmationFromInsert(values));
            return result([], 1);
        }
        if (text.startsWith("DELETE FROM mcp_confirmations") && text.includes("RETURNING")) {
            return this.consume(values);
        }
        throw new Error(`unexpected confirmation-store SQL: ${text}`);
    }

    async connect(): Promise<SqlConnection> {
        return this;
    }

    release(): void {
        this.releaseCount += 1;
    }

    async end(): Promise<void> {}

    persistedText(): string {
        return this.confirmations
            .map((row) => `${row.tokenHash}:${row.ciphertext.toString("base64")}`)
            .join("\n");
    }

    replacePreview(encryption: AesGcmKeyring, previewJson: string): void {
        const row = this.confirmations[0];
        if (!row) throw new Error("fixture confirmation is absent");
        const sealed = encryption.seal(
            previewJson,
            confirmationAssociatedData({
                tokenHash: row.tokenHash,
                principalId: row.principalId,
                oauthClientId: row.oauthClientId,
                credentialId: row.credentialId,
                credentialRevision: BigInt(row.credentialRevision),
                toolName: row.toolName,
                risk: row.risk,
                businessArgsHash: row.businessArgsHash,
                workspaceId: row.workspaceId,
                previewHash: row.previewHash,
                previewBytes: row.previewBytes,
                expiresAt: row.expiresAt.toISOString(),
            }),
        );
        row.ciphertext = sealed.ciphertext;
        row.iv = sealed.iv;
        row.tag = sealed.tag;
        row.keyId = sealed.keyId;
    }

    private consume<Row extends Record<string, unknown>>(
        values: readonly unknown[],
    ): QueryResult<Row> {
        const index = this.confirmations.findIndex(
            (row) =>
                row.tokenHash === values[0] &&
                row.principalId === values[1] &&
                row.oauthClientId === values[2],
        );
        if (index < 0) return rows([]);
        const row = this.confirmations.splice(index, 1)[0]!;
        return rows([{
            token_hash: row.tokenHash,
            principal_id: row.principalId,
            oauth_client_id: row.oauthClientId,
            credential_id: row.credentialId,
            credential_revision: row.credentialRevision,
            workspace_id: row.workspaceId,
            tool_name: row.toolName,
            risk: row.risk,
            business_args_hash: row.businessArgsHash,
            preview_hash: row.previewHash,
            preview_bytes: row.previewBytes,
            preview_ciphertext: row.ciphertext,
            preview_iv: row.iv,
            preview_tag: row.tag,
            key_id: row.keyId,
            expires_at: row.expiresAt,
            unexpired: !row.forceExpired,
        }]);
    }
}

function confirmationFromInsert(values: readonly unknown[]): StoredConfirmation {
    return {
        tokenHash: String(values[0]),
        principalId: String(values[1]),
        oauthClientId: String(values[2]),
        credentialId: String(values[3]),
        credentialRevision: String(values[4]),
        workspaceId: String(values[5]),
        toolName: String(values[6]),
        risk: "destructive",
        businessArgsHash: String(values[8]),
        previewHash: String(values[9]),
        previewBytes: Number(values[10]),
        ciphertext: requireBuffer(values[11]),
        iv: requireBuffer(values[12]),
        tag: requireBuffer(values[13]),
        keyId: String(values[14]),
        expiresAt: new Date(String(values[15])),
        forceExpired: false,
    };
}

function requireBuffer(value: unknown): Buffer {
    if (!Buffer.isBuffer(value)) throw new Error("fixture expected a buffer");
    return value;
}

function rows<Row extends Record<string, unknown>>(
    values: Record<string, unknown>[],
): QueryResult<Row> {
    return { rows: values as unknown as Row[], rowCount: values.length };
}

function result<Row extends Record<string, unknown>>(
    values: Record<string, unknown>[],
    rowCount: number | null,
): QueryResult<Row> {
    return { rows: values as unknown as Row[], rowCount };
}
