import { describe, expect, it } from "vitest";

import { PrincipalNotProvisionedError } from "../src/http-context.js";
import { PostgresCredentialStore } from "../src/remote/credentials.js";
import { AesGcmKeyring } from "../src/remote/crypto.js";
import type {
    QueryResult,
    RemotePrincipal,
    ScopeGrant,
    SqlConnection,
    SqlPool,
} from "../src/remote/types.js";

const ISSUER = "https://issuer.example";
const WORKSPACE = "65b382b606de527a7ee2b60e";

describe("PostgreSQL credential store", () => {
    it("grants, encrypts, loads, relinks, revokes, disables, and deletes", async () => {
        const pool = new CredentialPool();
        const store = new PostgresCredentialStore(pool, keyring(), ISSUER);

        const grant = await store.grantPrincipal("alice", "write");
        expect(grant).toMatchObject({ maxGrant: "write" });

        const first = await store.setCredential("alice", {
            workspaceId: WORKSPACE.toUpperCase(),
            apiKey: "first-secret",
        });
        expect(first).toMatchObject({
            principalId: grant.principalId,
            credentialRevision: 1n,
            workspaceId: WORKSPACE,
        });
        expect(pool.persistedPlaintext()).not.toContain("first-secret");

        await expect(store.load(principal("alice"))).resolves.toEqual({
            principalId: grant.principalId,
            credentialId: first.credentialId,
            credentialRevision: 1n,
            workspaceId: WORKSPACE,
            apiKey: "first-secret",
            region: "global",
            maxGrant: "write",
        });

        const second = await store.setCredential("alice", {
            workspaceId: WORKSPACE,
            apiKey: "second-secret",
            region: "eu",
            subdomain: "Team-One",
        });
        expect(second).toEqual({
            principalId: grant.principalId,
            credentialId: first.credentialId,
            credentialRevision: 2n,
            workspaceId: WORKSPACE,
        });
        expect(pool.confirmationDeletes).toBe(1);
        await expect(store.load(principal("alice"))).resolves.toMatchObject({
            credentialId: first.credentialId,
            credentialRevision: 2n,
            apiKey: "second-secret",
            region: "eu",
            subdomain: "team-one",
        });

        await expect(store.revokeCredential("alice")).resolves.toBe(true);
        expect(pool.confirmationDeletes).toBe(2);
        await expect(store.revokeCredential("alice")).resolves.toBe(false);
        await expect(store.load(principal("alice"))).rejects.toBeInstanceOf(
            PrincipalNotProvisionedError,
        );

        const restored = await store.setCredential("alice", {
            workspaceId: WORKSPACE,
            apiKey: "restored-secret",
            region: "developer",
        });
        expect(restored.credentialRevision).toBe(3n);
        await expect(store.disablePrincipal("alice")).resolves.toBe(true);
        await expect(store.disablePrincipal("alice")).resolves.toBe(false);
        await expect(store.load(principal("alice"))).rejects.toBeInstanceOf(
            PrincipalNotProvisionedError,
        );

        const reenabled = await store.grantPrincipal("alice", "admin");
        expect(reenabled).toEqual({ principalId: grant.principalId, maxGrant: "admin" });
        await expect(store.deletePrincipal("alice")).resolves.toBe(true);
        await expect(store.deletePrincipal("alice")).resolves.toBe(false);
        await expect(store.setCredential("alice", {
            workspaceId: WORKSPACE,
            apiKey: "unused-secret",
        })).rejects.toBeInstanceOf(PrincipalNotProvisionedError);

        expect(pool.beginCount).toBe(pool.releaseCount);
        expect(pool.rollbackCount).toBeGreaterThan(0);
    });

    it("fails closed for the wrong issuer, absent or malformed rows, and tampering", async () => {
        const pool = new CredentialPool();
        const store = new PostgresCredentialStore(pool, keyring(), ISSUER);

        await expect(store.load(principal("alice", "https://other.example"))).rejects.toBeInstanceOf(
            PrincipalNotProvisionedError,
        );
        await expect(store.load(principal("alice"))).rejects.toBeInstanceOf(
            PrincipalNotProvisionedError,
        );

        await store.grantPrincipal("alice", "read");
        await store.setCredential("alice", {
            workspaceId: WORKSPACE,
            apiKey: "protected-secret",
        });

        pool.duplicateLoadRow = true;
        await expect(store.load(principal("alice"))).rejects.toBeInstanceOf(
            PrincipalNotProvisionedError,
        );
        pool.duplicateLoadRow = false;

        pool.credential!.revision = 0n;
        await expect(store.load(principal("alice"))).rejects.toThrow(
            /credential revision is invalid/u,
        );
        pool.credential!.revision = 1n;
        pool.credential!.ciphertext[0] = (pool.credential!.ciphertext[0] ?? 0) ^ 1;
        await expect(store.load(principal("alice"))).rejects.toThrow();
    });

    it("validates subjects and Clockify routing credentials before persistence", async () => {
        const pool = new CredentialPool();
        const store = new PostgresCredentialStore(pool, keyring(), ISSUER);

        for (const subject of ["", " alice", "alice ", "x".repeat(1_025)]) {
            await expect(store.grantPrincipal(subject, "read")).rejects.toThrow(
                /stable identifier/u,
            );
            await expect(store.disablePrincipal(subject)).rejects.toThrow(
                /stable identifier/u,
            );
            await expect(store.deletePrincipal(subject)).rejects.toThrow(
                /stable identifier/u,
            );
            await expect(store.revokeCredential(subject)).rejects.toThrow(
                /stable identifier/u,
            );
        }

        await store.grantPrincipal("alice", "read");
        const invalidInputs = [
            { workspaceId: "not-a-workspace", apiKey: "key" },
            { workspaceId: WORKSPACE, apiKey: "key", region: "moon" as never },
            { workspaceId: WORKSPACE, apiKey: "key", subdomain: "team" },
            { workspaceId: WORKSPACE, apiKey: "key", region: "developer" as const, subdomain: "team" },
            { workspaceId: WORKSPACE, apiKey: "key", region: "eu" as const, subdomain: "bad_name" },
            { workspaceId: WORKSPACE, apiKey: "" },
            { workspaceId: WORKSPACE, apiKey: " key" },
            { workspaceId: WORKSPACE, apiKey: "x".repeat(8 * 1_024 + 1) },
        ];
        for (const input of invalidInputs) {
            await expect(store.setCredential("alice", input)).rejects.toThrow();
        }
        await expect(store.setCredential(" bad-subject", {
            workspaceId: WORKSPACE,
            apiKey: "key",
        })).rejects.toThrow(/stable identifier/u);
        expect(pool.credential).toBeUndefined();
    });
});

function keyring(): AesGcmKeyring {
    return AesGcmKeyring.fromDocument({
        version: 1,
        activeKeyId: "fixture",
        keys: { fixture: Buffer.alloc(32, 17).toString("base64") },
    });
}

function principal(subject: string, issuer = ISSUER): RemotePrincipal {
    return {
        issuer,
        subject,
        oauthClientId: "fixture-client",
        tokenScopes: new Set(["clockify:read"]),
    };
}

interface StoredPrincipal {
    id: string;
    issuer: string;
    subjectHash: string;
    maxGrant: ScopeGrant;
    disabled: boolean;
}

interface StoredCredential {
    id: string;
    principalId: string;
    workspaceId: string;
    region: string;
    subdomain: string | null;
    revision: bigint;
    ciphertext: Buffer;
    iv: Buffer;
    tag: Buffer;
    keyId: string;
    disabled: boolean;
}

class CredentialPool implements SqlPool, SqlConnection {
    readonly principals: StoredPrincipal[] = [];
    credential: StoredCredential | undefined;
    confirmationDeletes = 0;
    beginCount = 0;
    rollbackCount = 0;
    releaseCount = 0;
    duplicateLoadRow = false;

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
        if (text === "BEGIN") {
            this.beginCount += 1;
            return rows([]);
        }
        if (text === "COMMIT") return rows([]);
        if (text === "ROLLBACK") {
            this.rollbackCount += 1;
            return rows([]);
        }
        if (text.includes("SELECT p.id,")) return this.loadRows(values);
        if (text.includes("INSERT INTO mcp_principals")) return this.grant(values);
        if (text.startsWith("DELETE FROM mcp_principals")) return this.deletePrincipalRow(values);
        if (text.includes("UPDATE mcp_principals") && text.includes("disabled_at = now()")) {
            return this.disablePrincipalRow(values);
        }
        if (text.includes("FROM mcp_principals") && text.includes("FOR UPDATE")) {
            return this.findPrincipal(text, values);
        }
        if (text.includes("FROM mcp_credentials") && text.includes("FOR UPDATE")) {
            const credential = this.credential;
            const found = credential && credential.principalId === values[0]
                ? [{ id: credential.id, revision: credential.revision.toString() }]
                : [];
            return rows(found);
        }
        if (text.includes("INSERT INTO mcp_credentials")) {
            this.credential = credentialFromInsert(values);
            return result([], 1);
        }
        if (text.includes("UPDATE mcp_credentials") && text.includes("workspace_id = $2")) {
            this.credential = credentialFromUpdate(this.credential, values);
            return result([], 1);
        }
        if (text.includes("UPDATE mcp_credentials") && text.includes("RETURNING id")) {
            const credential = this.credential;
            if (!credential || credential.principalId !== values[0] || credential.disabled) {
                return rows([]);
            }
            credential.disabled = true;
            return rows([{ id: credential.id }]);
        }
        if (text.startsWith("DELETE FROM mcp_confirmations")) {
            this.confirmationDeletes += 1;
            return result([], 1);
        }
        throw new Error(`unexpected credential-store SQL: ${text}`);
    }

    async connect(): Promise<SqlConnection> {
        return this;
    }

    release(): void {
        this.releaseCount += 1;
    }

    async end(): Promise<void> {}

    persistedPlaintext(): string {
        return this.credential?.ciphertext.toString("utf8") ?? "";
    }

    private loadRows<Row extends Record<string, unknown>>(
        values: readonly unknown[],
    ): QueryResult<Row> {
        const principal = this.principals.find(
            (candidate) =>
                candidate.issuer === values[0] &&
                candidate.subjectHash === values[1] &&
                !candidate.disabled,
        );
        const credential = this.credential;
        if (!principal || !credential || credential.principalId !== principal.id || credential.disabled) {
            return rows([]);
        }
        const row = {
            id: principal.id,
            max_grant: principal.maxGrant,
            credential_id: credential.id,
            workspace_id: credential.workspaceId,
            region: credential.region,
            subdomain: credential.subdomain,
            revision: credential.revision.toString(),
            api_key_ciphertext: credential.ciphertext,
            api_key_iv: credential.iv,
            api_key_tag: credential.tag,
            key_id: credential.keyId,
        };
        return rows(this.duplicateLoadRow ? [row, row] : [row]);
    }

    private grant<Row extends Record<string, unknown>>(
        values: readonly unknown[],
    ): QueryResult<Row> {
        const [newId, issuer, subjectHash, maxGrant] = values.map(String);
        let principal = this.principals.find(
            (candidate) => candidate.issuer === issuer && candidate.subjectHash === subjectHash,
        );
        if (!principal) {
            principal = {
                id: newId!,
                issuer: issuer!,
                subjectHash: subjectHash!,
                maxGrant: maxGrant as ScopeGrant,
                disabled: false,
            };
            this.principals.push(principal);
        } else {
            principal.maxGrant = maxGrant as ScopeGrant;
            principal.disabled = false;
        }
        return rows([{ id: principal.id, max_grant: principal.maxGrant }]);
    }

    private deletePrincipalRow<Row extends Record<string, unknown>>(
        values: readonly unknown[],
    ): QueryResult<Row> {
        const index = this.principals.findIndex(
            (candidate) => candidate.issuer === values[0] && candidate.subjectHash === values[1],
        );
        if (index < 0) return rows([]);
        const deleted = this.principals.splice(index, 1)[0];
        if (this.credential?.principalId === deleted?.id) this.credential = undefined;
        return result([], 1);
    }

    private disablePrincipalRow<Row extends Record<string, unknown>>(
        values: readonly unknown[],
    ): QueryResult<Row> {
        const principal = this.principals.find((candidate) => candidate.id === values[0]);
        if (!principal || principal.disabled) return rows([]);
        principal.disabled = true;
        return result([], 1);
    }

    private findPrincipal<Row extends Record<string, unknown>>(
        text: string,
        values: readonly unknown[],
    ): QueryResult<Row> {
        const principal = this.principals.find(
            (candidate) =>
                candidate.issuer === values[0] &&
                candidate.subjectHash === values[1] &&
                (!text.includes("AND disabled_at IS NULL") || !candidate.disabled),
        );
        return rows(principal ? [{ id: principal.id, max_grant: principal.maxGrant }] : []);
    }
}

function credentialFromInsert(values: readonly unknown[]): StoredCredential {
    return {
        id: String(values[0]),
        principalId: String(values[1]),
        workspaceId: String(values[2]),
        region: String(values[3]),
        subdomain: values[4] === null ? null : String(values[4]),
        ciphertext: requireBuffer(values[5]),
        iv: requireBuffer(values[6]),
        tag: requireBuffer(values[7]),
        keyId: String(values[8]),
        revision: BigInt(String(values[9])),
        disabled: false,
    };
}

function credentialFromUpdate(
    current: StoredCredential | undefined,
    values: readonly unknown[],
): StoredCredential {
    if (!current || current.id !== values[0]) throw new Error("fixture credential is absent");
    return {
        id: current.id,
        principalId: current.principalId,
        workspaceId: String(values[1]),
        region: String(values[2]),
        subdomain: values[3] === null ? null : String(values[3]),
        ciphertext: requireBuffer(values[4]),
        iv: requireBuffer(values[5]),
        tag: requireBuffer(values[6]),
        keyId: String(values[7]),
        revision: BigInt(String(values[8])),
        disabled: false,
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
