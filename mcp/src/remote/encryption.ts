import type { Buffer } from "node:buffer";

import type { ToolRisk } from "../tool-risk.js";

import type { AesGcmKeyring } from "./crypto.js";
import {
    confirmationAssociatedData,
    credentialAssociatedData,
    type SealedValue,
} from "./crypto.js";
import { withTransaction } from "./sql.js";
import type {
    LoadedClockifyCredential,
    QueryResult,
    SqlConnection,
    SqlPool,
    SqlQueryable,
} from "./types.js";

interface KeyCountRow extends Record<string, unknown> {
    key_id: string;
    row_count: string;
}

interface MissingKeyCoverageRow extends Record<string, unknown> {
    missing_key: boolean;
}

interface CredentialRotationRow extends Record<string, unknown> {
    id: string;
    principal_id: string;
    workspace_id: string;
    region: LoadedClockifyCredential["region"];
    subdomain: string | null;
    revision: string;
    api_key_ciphertext: Buffer;
    api_key_iv: Buffer;
    api_key_tag: Buffer;
    key_id: string;
}

interface ConfirmationRotationRow extends Record<string, unknown> {
    token_hash: string;
    principal_id: string;
    oauth_client_id: string;
    credential_id: string;
    credential_revision: string;
    workspace_id: string;
    tool_name: string;
    risk: ToolRisk;
    business_args_hash: string;
    preview_hash: string;
    preview_bytes: number;
    preview_ciphertext: Buffer;
    preview_iv: Buffer;
    preview_tag: Buffer;
    key_id: string;
    expires_at: Date;
}

const MAX_CONFIRMATION_BATCH_ROWS = 2;
const KEY_COVERAGE_SQL = `WITH configured AS MATERIALIZED (
        SELECT key_id FROM unnest($1::text[]) AS configured_key(key_id)
    ),
    observed_boundaries AS (
        (SELECT key_id
           FROM mcp_credentials
          ORDER BY mcp_credentials.key_id
          LIMIT 1)
        UNION ALL
        SELECT next_key.key_id
          FROM configured
          CROSS JOIN LATERAL (
                SELECT key_id
                  FROM mcp_credentials
                 WHERE mcp_credentials.key_id > configured.key_id
                 ORDER BY mcp_credentials.key_id
                 LIMIT 1
          ) AS next_key
        UNION ALL
        (SELECT key_id
           FROM mcp_confirmations
          ORDER BY mcp_confirmations.key_id
          LIMIT 1)
        UNION ALL
        SELECT next_key.key_id
          FROM configured
          CROSS JOIN LATERAL (
                SELECT key_id
                  FROM mcp_confirmations
                 WHERE mcp_confirmations.key_id > configured.key_id
                 ORDER BY mcp_confirmations.key_id
                 LIMIT 1
          ) AS next_key
    )
SELECT EXISTS (
        SELECT 1
          FROM observed_boundaries
         WHERE key_id <> ALL($1::text[])
         LIMIT 1
    ) AS missing_key`;

interface EncryptionStatus {
    activeKeyId: string;
    configuredKeyIds: readonly string[];
    rowsByKeyId: Readonly<Record<string, number>>;
    retireableKeyIds: readonly string[];
}

/** Coordinates dual-read/single-write re-encryption across every sealed row. */
export class PostgresEncryptionService {
    constructor(
        private readonly pool: SqlPool,
        private readonly keyring: AesGcmKeyring,
    ) {}

    async status(): Promise<EncryptionStatus> {
        const rows = await this.pool.query<KeyCountRow>(
            `SELECT key_id, sum(row_count)::text AS row_count
               FROM (
                    SELECT key_id, count(*) AS row_count FROM mcp_credentials GROUP BY key_id
                    UNION ALL
                    SELECT key_id, count(*) AS row_count FROM mcp_confirmations GROUP BY key_id
               ) encrypted_rows
              GROUP BY key_id
              ORDER BY key_id`,
        );
        const rowsByKeyId: Record<string, number> = Object.create(null) as Record<
            string,
            number
        >;
        for (const row of rows.rows) {
            rowsByKeyId[row.key_id] = Number.parseInt(row.row_count, 10);
        }
        return {
            activeKeyId: this.keyring.activeId,
            configuredKeyIds: this.keyring.keyIds,
            rowsByKeyId,
            retireableKeyIds: this.keyring.keyIds.filter(
                (keyId) => keyId !== this.keyring.activeId && !rowsByKeyId[keyId],
            ),
        };
    }

    /**
     * Fail closed when this process cannot read a key ID referenced by live data.
     *
     * This is the cheap ongoing readiness check. It returns one database boolean
     * and does not load or decrypt ciphertext rows. Startup uses `assertReadable`
     * as the stronger key-material check.
     */
    async assertKeyCoverage(): Promise<void> {
        const result = await this.pool.query<MissingKeyCoverageRow>(
            KEY_COVERAGE_SQL,
            [this.keyring.keyIds],
        );
        if (result.rows[0]?.missing_key !== false) {
            throw new Error(
                "configured keyring cannot decrypt every persisted credential or confirmation",
            );
        }
    }

    /** Fail closed before serving when persisted ciphertext needs an absent key. */
    async assertReadable(): Promise<void> {
        const status = await this.status();
        const missingRows = Object.entries(status.rowsByKeyId).filter(
            ([keyId, rows]) => rows > 0 && !this.keyring.has(keyId),
        );
        if (missingRows.length > 0) {
            throw new Error(
                "configured keyring cannot decrypt every persisted credential or confirmation",
            );
        }
        try {
            await this.assertCiphertextSamplesReadable(
                Object.keys(status.rowsByKeyId),
            );
        } catch {
            throw new Error(
                "configured keyring cannot decrypt every persisted credential or confirmation",
            );
        }
    }

    private async assertCiphertextSamplesReadable(keyIds: readonly string[]): Promise<void> {
        const credentials = await this.pool.query<CredentialRotationRow>(
            `SELECT sample.*
               FROM unnest($1::text[]) AS requested(key_id)
               CROSS JOIN LATERAL (
                    SELECT id, principal_id, workspace_id, region, subdomain,
                           revision::text AS revision, api_key_ciphertext,
                           api_key_iv, api_key_tag, key_id
                      FROM mcp_credentials
                     WHERE key_id = requested.key_id
                     ORDER BY id
                     LIMIT 1
               ) AS sample`,
            [keyIds],
        );
        for (const row of credentials.rows) {
            openCredential(this.keyring, row);
        }

        const confirmations = await this.pool.query<ConfirmationRotationRow>(
            `SELECT sample.*
               FROM unnest($1::text[]) AS requested(key_id)
               CROSS JOIN LATERAL (
                    SELECT token_hash, principal_id, oauth_client_id, credential_id,
                           credential_revision::text AS credential_revision,
                           workspace_id, tool_name, risk, business_args_hash,
                           preview_hash, preview_bytes, preview_ciphertext,
                           preview_iv, preview_tag, key_id, expires_at
                      FROM mcp_confirmations
                     WHERE key_id = requested.key_id
                     ORDER BY token_hash
                     LIMIT 1
               ) AS sample`,
            [keyIds],
        );
        for (const row of confirmations.rows) {
            openConfirmation(this.keyring, row);
        }
    }

    async rotateBatch(batchSize = 100): Promise<number> {
        requireBatchSize(batchSize);
        return await withTransaction(this.pool, async (connection) => {
            let changed = await rotateCredentials(
                connection,
                this.keyring,
                batchSize,
            );
            if (changed < batchSize) {
                changed += await rotateConfirmations(
                    connection,
                    this.keyring,
                    batchSize - changed,
                );
            }
            return changed;
        });
    }

    async rotateAll(batchSize = 100): Promise<EncryptionStatus> {
        requireBatchSize(batchSize);
        const coordinator = await this.pool.connect();
        let locked = false;
        try {
            const result = await coordinator.query<{ locked: boolean }>(
                "SELECT pg_try_advisory_lock(hashtext('clockify115-mcp-encryption-rotation')) AS locked",
            );
            locked = result.rows[0]?.locked === true;
            if (!locked) throw new Error("another encryption rotation is already running");
            await this.assertReadable();
            await assertAllActiveCiphertextReadable(
                coordinator,
                this.keyring,
                batchSize,
            );
            while ((await this.rotateBatch(batchSize)) > 0) {
                // Each bounded transaction releases row locks between batches.
            }
            const status = await this.status();
            for (const [keyId, rows] of Object.entries(status.rowsByKeyId)) {
                if (keyId !== status.activeKeyId && rows > 0) {
                    throw new Error(
                        `encryption rotation left ${rows} rows on key ${keyId}`,
                    );
                }
            }
            return status;
        } finally {
            try {
                if (locked) {
                    await coordinator.query(
                        "SELECT pg_advisory_unlock(hashtext('clockify115-mcp-encryption-rotation'))",
                    );
                }
            } finally {
                coordinator.release();
            }
        }
    }
}

async function assertAllActiveCiphertextReadable(
    connection: SqlConnection,
    keyring: AesGcmKeyring,
    batchSize: number,
): Promise<void> {
    await connection.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    try {
        await assertActiveCredentialsReadable(connection, keyring, batchSize);
        await assertActiveConfirmationsReadable(
            connection,
            keyring,
            Math.min(batchSize, MAX_CONFIRMATION_BATCH_ROWS),
        );
        await connection.query("COMMIT");
    } catch {
        try {
            await connection.query("ROLLBACK");
        } catch {
            // Preserve the unreadable-ciphertext or owning database failure.
        }
        throw new Error(
            "configured keyring cannot decrypt every persisted credential or confirmation",
        );
    }
}

async function assertActiveCredentialsReadable(
    connection: SqlQueryable,
    keyring: AesGcmKeyring,
    limit: number,
): Promise<void> {
    let cursor: string | null = null;
    for (;;) {
        const result: QueryResult<CredentialRotationRow> =
            await connection.query<CredentialRotationRow>(
                `SELECT id, principal_id, workspace_id, region, subdomain,
                    revision::text AS revision, api_key_ciphertext, api_key_iv,
                    api_key_tag, key_id
               FROM mcp_credentials
              WHERE key_id = $1
                AND ($2::uuid IS NULL OR id > $2::uuid)
              ORDER BY id
              LIMIT $3`,
                [keyring.activeId, cursor, limit],
            );
        for (const row of result.rows) {
            openCredential(keyring, row);
        }
        if (result.rows.length < limit) return;
        const nextCursor: string | undefined = result.rows.at(-1)?.id;
        if (nextCursor === undefined || nextCursor === cursor) {
            throw new Error("credential ciphertext audit did not advance");
        }
        cursor = nextCursor;
    }
}

async function assertActiveConfirmationsReadable(
    connection: SqlQueryable,
    keyring: AesGcmKeyring,
    limit: number,
): Promise<void> {
    let cursor: string | null = null;
    for (;;) {
        const result: QueryResult<ConfirmationRotationRow> =
            await connection.query<ConfirmationRotationRow>(
                `SELECT token_hash, principal_id, oauth_client_id, credential_id,
                    credential_revision::text AS credential_revision, workspace_id,
                    tool_name, risk, business_args_hash, preview_hash, preview_bytes,
                    preview_ciphertext, preview_iv, preview_tag, key_id, expires_at
               FROM mcp_confirmations
              WHERE key_id = $1
                AND ($2::char(64) IS NULL OR token_hash > $2::char(64))
              ORDER BY token_hash
              LIMIT $3`,
                [keyring.activeId, cursor, limit],
            );
        for (const row of result.rows) {
            openConfirmation(keyring, row);
        }
        if (result.rows.length < limit) return;
        const nextCursor: string | undefined = result.rows.at(-1)?.token_hash;
        if (nextCursor === undefined || nextCursor === cursor) {
            throw new Error("confirmation ciphertext audit did not advance");
        }
        cursor = nextCursor;
    }
}

async function rotateCredentials(
    connection: SqlQueryable,
    keyring: AesGcmKeyring,
    limit: number,
): Promise<number> {
    const result = await connection.query<CredentialRotationRow>(
        `SELECT id, principal_id, workspace_id, region, subdomain,
                revision::text AS revision, api_key_ciphertext, api_key_iv,
                api_key_tag, key_id
           FROM mcp_credentials
          WHERE key_id <> $1
          ORDER BY id
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [keyring.activeId, limit],
    );
    for (const row of result.rows) {
        const revision = BigInt(row.revision);
        const aad = credentialAssociatedData({
            credentialId: row.id,
            principalId: row.principal_id,
            workspaceId: row.workspace_id,
            revision,
            region: row.region,
            ...(row.subdomain === null ? {} : { subdomain: row.subdomain }),
        });
        const sealed = keyring.reseal(credentialSealed(row), aad);
        await connection.query(
            `UPDATE mcp_credentials
                SET api_key_ciphertext = $2, api_key_iv = $3,
                    api_key_tag = $4, key_id = $5, updated_at = now()
              WHERE id = $1`,
            [row.id, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId],
        );
    }
    return result.rows.length;
}

async function rotateConfirmations(
    connection: SqlQueryable,
    keyring: AesGcmKeyring,
    limit: number,
): Promise<number> {
    if (limit === 0) return 0;
    const boundedLimit = Math.min(limit, MAX_CONFIRMATION_BATCH_ROWS);
    const result = await connection.query<ConfirmationRotationRow>(
        `SELECT token_hash, principal_id, oauth_client_id, credential_id,
                credential_revision::text AS credential_revision, workspace_id,
                tool_name, risk, business_args_hash, preview_hash, preview_bytes,
                preview_ciphertext, preview_iv, preview_tag, key_id, expires_at
           FROM mcp_confirmations
          WHERE key_id <> $1
          ORDER BY token_hash
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [keyring.activeId, boundedLimit],
    );
    for (const row of result.rows) {
        const aad = confirmationAssociatedData({
            tokenHash: row.token_hash,
            principalId: row.principal_id,
            oauthClientId: row.oauth_client_id,
            credentialId: row.credential_id,
            credentialRevision: BigInt(row.credential_revision),
            toolName: row.tool_name,
            risk: row.risk,
            businessArgsHash: row.business_args_hash,
            workspaceId: row.workspace_id,
            previewHash: row.preview_hash,
            previewBytes: row.preview_bytes,
            expiresAt: requireDate(row.expires_at).toISOString(),
        });
        const sealed = keyring.reseal(confirmationSealed(row), aad);
        await connection.query(
            `UPDATE mcp_confirmations
                SET preview_ciphertext = $2, preview_iv = $3,
                    preview_tag = $4, key_id = $5
              WHERE token_hash = $1`,
            [
                row.token_hash,
                sealed.ciphertext,
                sealed.iv,
                sealed.tag,
                sealed.keyId,
            ],
        );
    }
    return result.rows.length;
}

function credentialSealed(row: CredentialRotationRow): SealedValue {
    return {
        keyId: row.key_id,
        iv: row.api_key_iv,
        ciphertext: row.api_key_ciphertext,
        tag: row.api_key_tag,
    };
}

function confirmationSealed(row: ConfirmationRotationRow): SealedValue {
    return {
        keyId: row.key_id,
        iv: row.preview_iv,
        ciphertext: row.preview_ciphertext,
        tag: row.preview_tag,
    };
}

function openCredential(keyring: AesGcmKeyring, row: CredentialRotationRow): void {
    keyring.open(
        credentialSealed(row),
        credentialAssociatedData({
            credentialId: row.id,
            principalId: row.principal_id,
            workspaceId: row.workspace_id,
            revision: BigInt(row.revision),
            region: row.region,
            ...(row.subdomain === null ? {} : { subdomain: row.subdomain }),
        }),
    );
}

function openConfirmation(
    keyring: AesGcmKeyring,
    row: ConfirmationRotationRow,
): void {
    keyring.open(
        confirmationSealed(row),
        confirmationAssociatedData({
            tokenHash: row.token_hash,
            principalId: row.principal_id,
            oauthClientId: row.oauth_client_id,
            credentialId: row.credential_id,
            credentialRevision: BigInt(row.credential_revision),
            toolName: row.tool_name,
            risk: row.risk,
            businessArgsHash: row.business_args_hash,
            workspaceId: row.workspace_id,
            previewHash: row.preview_hash,
            previewBytes: row.preview_bytes,
            expiresAt: requireDate(row.expires_at).toISOString(),
        }),
    );
}

function requireDate(value: Date): Date {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new Error("encrypted confirmation expiry is invalid");
    }
    return value;
}

function requireBatchSize(value: number): void {
    if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
        throw new Error("rotation batch size must be between 1 and 1000");
    }
}
