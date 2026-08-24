import { describe, expect, it } from "vitest";

import {
    AesGcmKeyring,
    credentialAssociatedData,
} from "../src/remote/crypto.js";
import { PostgresEncryptionService } from "../src/remote/encryption.js";
import type {
    QueryResult,
    SqlConnection,
    SqlPool,
} from "../src/remote/types.js";

describe("remote encryption rotation bounds", () => {
    it("caps confirmation rows independently of a large credential batch", async () => {
        const pool = new RotationPool();
        const keyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "current",
            keys: { current: Buffer.alloc(32, 7).toString("base64") },
        });

        await expect(
            new PostgresEncryptionService(pool, keyring).rotateBatch(1_000),
        ).resolves.toBe(0);
        expect(pool.confirmationLimit).toBe(2);
    });

    it("rejects a database row encrypted with an unavailable key", async () => {
        const pool = new RotationPool();
        pool.statusRows = [{ key_id: "retired", row_count: "1" }];
        const keyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "current",
            keys: { current: Buffer.alloc(32, 8).toString("base64") },
        });

        await expect(
            new PostgresEncryptionService(pool, keyring).assertReadable(),
        ).rejects.toThrow(/cannot decrypt every persisted/u);
    });

    it.each(["credential", "confirmation"] as const)(
        "fails ongoing readiness when a new-key %s reaches a stale replica",
        async (kind) => {
            const pool = new RotationPool();
            const keyring = AesGcmKeyring.fromDocument({
                version: 1,
                activeKeyId: "old",
                keys: { old: Buffer.alloc(32, 13).toString("base64") },
            });
            const service = new PostgresEncryptionService(pool, keyring);

            pool.credentialKeyIds = ["old"];
            pool.confirmationKeyIds = ["old"];
            await expect(service.assertKeyCoverage()).resolves.toBeUndefined();

            if (kind === "credential") pool.credentialKeyIds.push("new");
            else pool.confirmationKeyIds.push("new");
            await expect(service.assertKeyCoverage()).rejects.toThrow(
                /cannot decrypt every persisted/u,
            );
            expect(pool.coverageKeyIds).toEqual([["old"], ["old"]]);
        },
    );

    it("uses indexed boundary seeks for ongoing key coverage", async () => {
        const pool = new RotationPool();
        const keyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "old",
            keys: { old: Buffer.alloc(32, 14).toString("base64") },
        });

        await new PostgresEncryptionService(pool, keyring).assertKeyCoverage();

        const sql = pool.coverageSql.at(0)?.replaceAll(/\s+/gu, " ");
        expect(sql).toContain(
            "SELECT key_id FROM mcp_credentials ORDER BY mcp_credentials.key_id LIMIT 1",
        );
        expect(sql).toContain(
            "WHERE mcp_credentials.key_id > configured.key_id ORDER BY mcp_credentials.key_id LIMIT 1",
        );
        expect(sql).toContain(
            "SELECT key_id FROM mcp_confirmations ORDER BY mcp_confirmations.key_id LIMIT 1",
        );
        expect(sql).toContain(
            "WHERE mcp_confirmations.key_id > configured.key_id ORDER BY mcp_confirmations.key_id LIMIT 1",
        );
        expect(sql).not.toContain(
            "FROM mcp_credentials WHERE key_id <> ALL($1::text[])",
        );
        expect(sql).not.toContain(
            "FROM mcp_confirmations WHERE key_id <> ALL($1::text[])",
        );
    });

    it("rejects reused key ids from readiness and rotation", async () => {
        const pool = new RotationPool();
        const sealingKeyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "shared",
            keys: { shared: Buffer.alloc(32, 9).toString("base64") },
        });
        const associatedData = credentialAssociatedData({
            credentialId: "credential-id",
            principalId: "principal-id",
            workspaceId: "65b382b606de527a7ee2b60e",
            revision: 1n,
            region: "global",
        });
        const sealed = sealingKeyring.seal("synthetic-api-key", associatedData);
        pool.statusRows = [{ key_id: "shared", row_count: "1" }];
        pool.credentialSamples = [
            {
                id: "credential-id",
                principal_id: "principal-id",
                workspace_id: "65b382b606de527a7ee2b60e",
                region: "global",
                subdomain: null,
                revision: "1",
                api_key_ciphertext: sealed.ciphertext,
                api_key_iv: sealed.iv,
                api_key_tag: sealed.tag,
                key_id: sealed.keyId,
            },
        ];
        const wrongKeyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "shared",
            keys: { shared: Buffer.alloc(32, 10).toString("base64") },
        });

        const service = new PostgresEncryptionService(pool, wrongKeyring);

        await expect(service.assertReadable()).rejects.toThrow(
            /cannot decrypt every persisted/u,
        );
        await expect(service.rotateAll()).rejects.toThrow(
            /cannot decrypt every persisted/u,
        );
    });

    it("rejects mixed key material hidden behind a readable active-key sample", async () => {
        const pool = new RotationPool();
        const currentKeyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "shared",
            keys: { shared: Buffer.alloc(32, 11).toString("base64") },
        });
        const replacedKeyring = AesGcmKeyring.fromDocument({
            version: 1,
            activeKeyId: "shared",
            keys: { shared: Buffer.alloc(32, 12).toString("base64") },
        });
        const firstId = "00000000-0000-4000-8000-000000000001";
        const secondId = "00000000-0000-4000-8000-000000000002";
        const firstAssociatedData = credentialAssociatedData({
            credentialId: firstId,
            principalId: "principal-one",
            workspaceId: "65b382b606de527a7ee2b60e",
            revision: 1n,
            region: "global",
        });
        const secondAssociatedData = credentialAssociatedData({
            credentialId: secondId,
            principalId: "principal-two",
            workspaceId: "65b382b606de527a7ee2b60e",
            revision: 1n,
            region: "global",
        });
        const firstSealed = currentKeyring.seal(
            "current-material-api-key",
            firstAssociatedData,
        );
        const secondSealed = replacedKeyring.seal(
            "replaced-material-api-key",
            secondAssociatedData,
        );
        const firstRow = {
            id: firstId,
            principal_id: "principal-one",
            workspace_id: "65b382b606de527a7ee2b60e",
            region: "global",
            subdomain: null,
            revision: "1",
            api_key_ciphertext: firstSealed.ciphertext,
            api_key_iv: firstSealed.iv,
            api_key_tag: firstSealed.tag,
            key_id: firstSealed.keyId,
        };
        const secondRow = {
            id: secondId,
            principal_id: "principal-two",
            workspace_id: "65b382b606de527a7ee2b60e",
            region: "global",
            subdomain: null,
            revision: "1",
            api_key_ciphertext: secondSealed.ciphertext,
            api_key_iv: secondSealed.iv,
            api_key_tag: secondSealed.tag,
            key_id: secondSealed.keyId,
        };
        pool.statusRows = [{ key_id: "shared", row_count: "2" }];
        pool.credentialSamples = [firstRow];
        pool.activeCredentialRows = [firstRow, secondRow];

        const service = new PostgresEncryptionService(pool, currentKeyring);

        await expect(service.assertReadable()).resolves.toBeUndefined();
        await expect(service.rotateAll(1)).rejects.toThrow(
            /cannot decrypt every persisted/u,
        );
        expect(pool.readOnlyTransactions).toBe(1);
        expect(pool.activeCredentialLimits).toEqual([1, 1]);
    });
});

class RotationPool implements SqlPool, SqlConnection {
    confirmationLimit: number | undefined;
    statusRows: Record<string, unknown>[] = [];
    credentialSamples: Record<string, unknown>[] = [];
    activeCredentialRows: Record<string, unknown>[] = [];
    activeCredentialLimits: number[] = [];
    credentialKeyIds: string[] = [];
    confirmationKeyIds: string[] = [];
    coverageKeyIds: string[][] = [];
    coverageSql: string[] = [];
    readOnlyTransactions = 0;

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
        if (text.includes("pg_try_advisory_lock")) {
            return {
                rows: [{ locked: true }] as unknown as Row[],
                rowCount: 1,
            };
        }
        if (text.includes("sum(row_count)")) {
            return {
                rows: this.statusRows as Row[],
                rowCount: this.statusRows.length,
            };
        }
        if (text.includes("AS missing_key")) {
            const configured = Array.isArray(values[0])
                ? values[0].filter(
                      (value): value is string => typeof value === "string",
                  )
                : [];
            this.coverageKeyIds.push(configured);
            this.coverageSql.push(text);
            return {
                rows: [
                    {
                        missing_key: [
                            ...this.credentialKeyIds,
                            ...this.confirmationKeyIds,
                        ].some(
                            (keyId) => !configured.includes(keyId),
                        ),
                    },
                ] as unknown as Row[],
                rowCount: 1,
            };
        }
        if (text.includes("FROM unnest") && text.includes("mcp_credentials")) {
            return {
                rows: this.credentialSamples as Row[],
                rowCount: this.credentialSamples.length,
            };
        }
        if (text.includes("FROM unnest")) {
            return { rows: [], rowCount: 0 };
        }
        if (text.includes("REPEATABLE READ READ ONLY")) {
            this.readOnlyTransactions += 1;
            return { rows: [], rowCount: 0 };
        }
        if (text.includes("id > $2::uuid")) {
            const cursor = typeof values[1] === "string" ? values[1] : undefined;
            const limit = Number(values[2]);
            this.activeCredentialLimits.push(limit);
            const rows = this.activeCredentialRows
                .filter(
                    (row) =>
                        typeof row.id === "string" &&
                        (cursor === undefined || row.id > cursor),
                )
                .slice(0, limit);
            return { rows: rows as Row[], rowCount: rows.length };
        }
        if (text.includes("FROM mcp_confirmations")) {
            this.confirmationLimit = Number(values[1]);
        }
        return { rows: [], rowCount: 0 };
    }

    async connect(): Promise<SqlConnection> {
        return this;
    }

    release(): void {}

    async end(): Promise<void> {}
}
