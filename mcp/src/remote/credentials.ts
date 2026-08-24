import { randomUUID } from "node:crypto";

import { PrincipalNotProvisionedError } from "../http-context.js";

import type { AesGcmKeyring } from "./crypto.js";
import {
    credentialAssociatedData,
    sha256,
    type SealedValue,
} from "./crypto.js";
import { isValidPrincipalSubject } from "./principal-subject.js";
import { withTransaction } from "./sql.js";
import type {
    ClockifyCredentialInput,
    LoadedClockifyCredential,
    RemotePrincipal,
    ScopeGrant,
    SqlPool,
    SqlQueryable,
} from "./types.js";

const WORKSPACE_ID = /^[0-9a-f]{24}$/;
const SUBDOMAIN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const REGIONS = new Set(["global", "eu", "us", "uk", "au", "developer"]);
const SUBDOMAIN_REGIONS = new Set(["eu", "us", "uk", "au"]);
const MAX_API_KEY_BYTES = 8 * 1024;

interface PrincipalRow extends Record<string, unknown> {
    id: string;
    max_grant: ScopeGrant;
}

interface CredentialRow extends PrincipalRow {
    credential_id: string;
    workspace_id: string;
    region: LoadedClockifyCredential["region"];
    subdomain: string | null;
    revision: string;
    api_key_ciphertext: Buffer;
    api_key_iv: Buffer;
    api_key_tag: Buffer;
    key_id: string;
}

interface ExistingCredentialRow extends Record<string, unknown> {
    id: string;
    revision: string;
}

interface PrincipalReceipt {
    principalId: string;
    maxGrant: ScopeGrant;
}

interface CredentialReceipt {
    principalId: string;
    credentialId: string;
    credentialRevision: bigint;
    workspaceId: string;
}

export class PostgresCredentialStore {
    constructor(
        private readonly pool: SqlPool,
        private readonly keyring: AesGcmKeyring,
        private readonly issuer: string,
    ) {}

    async load(principal: RemotePrincipal): Promise<LoadedClockifyCredential> {
        if (principal.issuer !== this.issuer) throw new PrincipalNotProvisionedError();
        const result = await this.pool.query<CredentialRow>(
            `SELECT p.id,
                    p.max_grant,
                    c.id AS credential_id,
                    c.workspace_id,
                    c.region,
                    c.subdomain,
                    c.revision::text AS revision,
                    c.api_key_ciphertext,
                    c.api_key_iv,
                    c.api_key_tag,
                    c.key_id
               FROM mcp_principals p
               JOIN mcp_credentials c ON c.principal_id = p.id
              WHERE p.issuer = $1
                AND p.subject_hash = $2
                AND p.disabled_at IS NULL
                AND c.disabled_at IS NULL`,
            [this.issuer, subjectHash(this.issuer, principal.subject)],
        );
        const row = requireSingleRow(result.rows);
        const revision = parseRevision(row.revision);
        const apiKey = this.keyring.open(
            sealedFromCredentialRow(row),
            credentialAssociatedData({
                credentialId: row.credential_id,
                principalId: row.id,
                workspaceId: row.workspace_id,
                revision,
                region: row.region,
                ...(row.subdomain === null ? {} : { subdomain: row.subdomain }),
            }),
        );
        return {
            principalId: row.id,
            credentialId: row.credential_id,
            credentialRevision: revision,
            workspaceId: row.workspace_id,
            apiKey,
            region: row.region,
            ...(row.subdomain === null ? {} : { subdomain: row.subdomain }),
            maxGrant: row.max_grant,
        };
    }

    async grantPrincipal(subject: string, maxGrant: ScopeGrant): Promise<PrincipalReceipt> {
        requireSubject(subject);
        const id = randomUUID();
        const result = await this.pool.query<PrincipalRow>(
            `INSERT INTO mcp_principals (id, issuer, subject_hash, max_grant)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (issuer, subject_hash) DO UPDATE
                 SET max_grant = EXCLUDED.max_grant,
                     disabled_at = NULL,
                     updated_at = now()
             RETURNING id, max_grant`,
            [id, this.issuer, subjectHash(this.issuer, subject), maxGrant],
        );
        const row = requireSingleRow(result.rows);
        return { principalId: row.id, maxGrant: row.max_grant };
    }

    async disablePrincipal(subject: string): Promise<boolean> {
        requireSubject(subject);
        return await withTransaction(this.pool, async (connection) => {
            const principal = await findPrincipalForUpdate(
                connection,
                this.issuer,
                subject,
                false,
            );
            if (!principal) return false;
            await connection.query(
                "DELETE FROM mcp_confirmations WHERE principal_id = $1",
                [principal.id],
            );
            const result = await connection.query(
                `UPDATE mcp_principals
                    SET disabled_at = now(), updated_at = now()
                  WHERE id = $1 AND disabled_at IS NULL`,
                [principal.id],
            );
            return result.rowCount === 1;
        });
    }

    async deletePrincipal(subject: string): Promise<boolean> {
        requireSubject(subject);
        const result = await this.pool.query(
            "DELETE FROM mcp_principals WHERE issuer = $1 AND subject_hash = $2",
            [this.issuer, subjectHash(this.issuer, subject)],
        );
        return result.rowCount === 1;
    }

    async setCredential(
        subject: string,
        input: ClockifyCredentialInput,
    ): Promise<CredentialReceipt> {
        requireSubject(subject);
        const credential = normalizeCredential(input);
        return await withTransaction(this.pool, async (connection) => {
            const principal = await findPrincipalForUpdate(
                connection,
                this.issuer,
                subject,
                true,
            );
            if (!principal) throw new PrincipalNotProvisionedError();
            const existing = await connection.query<ExistingCredentialRow>(
                `SELECT id, revision::text AS revision
                   FROM mcp_credentials
                  WHERE principal_id = $1
                  FOR UPDATE`,
                [principal.id],
            );
            const current = existing.rows[0];
            const credentialId = current?.id ?? randomUUID();
            const revision = current ? parseRevision(current.revision) + 1n : 1n;
            const sealed = this.keyring.seal(
                credential.apiKey,
                credentialAssociatedData({
                    credentialId,
                    principalId: principal.id,
                    workspaceId: credential.workspaceId,
                    revision,
                    region: credential.region,
                    ...(credential.subdomain === undefined
                        ? {}
                        : { subdomain: credential.subdomain }),
                }),
            );

            if (current) {
                await updateCredential(
                    connection,
                    credentialId,
                    credential,
                    revision,
                    sealed,
                );
                await connection.query(
                    "DELETE FROM mcp_confirmations WHERE credential_id = $1",
                    [credentialId],
                );
            } else {
                await insertCredential(
                    connection,
                    principal.id,
                    credentialId,
                    credential,
                    revision,
                    sealed,
                );
            }
            return {
                principalId: principal.id,
                credentialId,
                credentialRevision: revision,
                workspaceId: credential.workspaceId,
            };
        });
    }

    async revokeCredential(subject: string): Promise<boolean> {
        requireSubject(subject);
        return await withTransaction(this.pool, async (connection) => {
            const principal = await findPrincipalForUpdate(
                connection,
                this.issuer,
                subject,
                false,
            );
            if (!principal) return false;
            const result = await connection.query<{ id: string }>(
                `UPDATE mcp_credentials
                    SET disabled_at = now(),
                        updated_at = now()
                  WHERE principal_id = $1 AND disabled_at IS NULL
                  RETURNING id`,
                [principal.id],
            );
            const credential = result.rows[0];
            if (!credential) return false;
            await connection.query(
                "DELETE FROM mcp_confirmations WHERE credential_id = $1",
                [credential.id],
            );
            return true;
        });
    }
}

function subjectHash(issuer: string, subject: string): string {
    return sha256(`${issuer}\0${subject}`);
}

async function findPrincipalForUpdate(
    connection: SqlQueryable,
    issuer: string,
    subject: string,
    enabledOnly: boolean,
): Promise<PrincipalRow | undefined> {
    const result = await connection.query<PrincipalRow>(
        `SELECT id, max_grant
           FROM mcp_principals
          WHERE issuer = $1
            AND subject_hash = $2
            ${enabledOnly ? "AND disabled_at IS NULL" : ""}
          FOR UPDATE`,
        [issuer, subjectHash(issuer, subject)],
    );
    return result.rows[0];
}

async function insertCredential(
    connection: SqlQueryable,
    principalId: string,
    credentialId: string,
    input: Required<Pick<ClockifyCredentialInput, "workspaceId" | "apiKey" | "region">> &
        Pick<ClockifyCredentialInput, "subdomain">,
    revision: bigint,
    sealed: SealedValue,
): Promise<void> {
    await connection.query(
        `INSERT INTO mcp_credentials (
             id, principal_id, workspace_id, region, subdomain,
             api_key_ciphertext, api_key_iv, api_key_tag, key_id, revision
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
            credentialId,
            principalId,
            input.workspaceId,
            input.region,
            input.subdomain ?? null,
            sealed.ciphertext,
            sealed.iv,
            sealed.tag,
            sealed.keyId,
            revision.toString(),
        ],
    );
}

async function updateCredential(
    connection: SqlQueryable,
    credentialId: string,
    input: Required<Pick<ClockifyCredentialInput, "workspaceId" | "apiKey" | "region">> &
        Pick<ClockifyCredentialInput, "subdomain">,
    revision: bigint,
    sealed: SealedValue,
): Promise<void> {
    await connection.query(
        `UPDATE mcp_credentials
            SET workspace_id = $2,
                region = $3,
                subdomain = $4,
                api_key_ciphertext = $5,
                api_key_iv = $6,
                api_key_tag = $7,
                key_id = $8,
                revision = $9,
                disabled_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [
            credentialId,
            input.workspaceId,
            input.region,
            input.subdomain ?? null,
            sealed.ciphertext,
            sealed.iv,
            sealed.tag,
            sealed.keyId,
            revision.toString(),
        ],
    );
}

function normalizeCredential(
    input: ClockifyCredentialInput,
): Required<Pick<ClockifyCredentialInput, "workspaceId" | "apiKey" | "region">> &
    Pick<ClockifyCredentialInput, "subdomain"> {
    const workspaceId = input.workspaceId.toLowerCase();
    const region = input.region ?? "global";
    const subdomain = input.subdomain?.toLowerCase();
    if (!WORKSPACE_ID.test(workspaceId)) throw new Error("workspace id must be 24 hex characters");
    if (!REGIONS.has(region)) throw new Error("unsupported Clockify region");
    if (subdomain !== undefined && (!SUBDOMAIN.test(subdomain) || !SUBDOMAIN_REGIONS.has(region))) {
        throw new Error("subdomain requires a supported regional routing profile");
    }
    if (
        !input.apiKey ||
        input.apiKey.trim() !== input.apiKey ||
        Buffer.byteLength(input.apiKey, "utf8") > MAX_API_KEY_BYTES
    ) {
        throw new Error("API key must be non-empty, trimmed, and no larger than 8 KiB");
    }
    return {
        workspaceId,
        apiKey: input.apiKey,
        region,
        ...(subdomain === undefined ? {} : { subdomain }),
    };
}

function requireSubject(subject: string): void {
    if (!isValidPrincipalSubject(subject)) {
        throw new Error("subject must be a non-empty stable identifier");
    }
}

function requireSingleRow<Row>(rows: readonly Row[]): Row {
    const row = rows[0];
    if (!row || rows.length !== 1) throw new PrincipalNotProvisionedError();
    return row;
}

function parseRevision(value: string): bigint {
    const revision = BigInt(value);
    if (revision < 1n) throw new Error("credential revision is invalid");
    return revision;
}

function sealedFromCredentialRow(row: CredentialRow): SealedValue {
    return {
        keyId: row.key_id,
        iv: row.api_key_iv,
        ciphertext: row.api_key_ciphertext,
        tag: row.api_key_tag,
    };
}
