import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";

import {
    canonicalJson,
    hashCanonical,
    type ConfirmationScope,
    type ConfirmationStore,
    type IssuedConfirmation,
} from "../orchestration/confirmation.js";
import type { ToolRisk } from "../tool-risk.js";

import type { AesGcmKeyring } from "./crypto.js";
import {
    confirmationAssociatedData,
    sha256,
    type SealedValue,
} from "./crypto.js";
import { withTransaction } from "./sql.js";
import type { SqlPool, SqlQueryable } from "./types.js";

const CONFIRMATION_TTL_MS = 5 * 60 * 1000;
const MAX_ACTIVE_PREVIEWS = 256;
const MAX_ACTIVE_PREVIEW_BYTES = 4 * 1024 * 1024;
const REQUEST_CLEANUP_BATCH = 256;

interface ConfirmationBinding {
    principalId: string;
    oauthClientId: string;
    credentialId: string;
    credentialRevision: bigint;
    workspaceId: string;
}

interface ConfirmationRow extends Record<string, unknown> {
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
    unexpired: boolean;
}

interface QuotaRow extends Record<string, unknown> {
    preview_count: string;
    preview_bytes: string;
}

/** Durable exact-preview store scoped to one authenticated request identity. */
export class PostgresConfirmationStore implements ConfirmationStore {
    constructor(
        private readonly pool: SqlPool,
        private readonly keyring: AesGcmKeyring,
        private readonly binding: ConfirmationBinding,
    ) {}

    async issue(
        scope: ConfirmationScope,
        preview: unknown,
    ): Promise<IssuedConfirmation> {
        this.requireWorkspace(scope.workspaceId);
        const previewJson = canonicalJson(preview);
        if (previewJson === undefined) {
            throw new Error("confirmation preview must be JSON serializable");
        }
        const previewBytes = Buffer.byteLength(previewJson, "utf8");
        if (previewBytes > MAX_ACTIVE_PREVIEW_BYTES) {
            throw new Error("confirmation preview exceeds the storage limit");
        }

        await pruneExpiredConfirmations(this.pool, REQUEST_CLEANUP_BATCH);
        const confirmToken = randomBytes(32).toString("base64url");
        const tokenHash = sha256(confirmToken);
        const previewHash = sha256(previewJson);
        const businessArgsHash = hashCanonical(scope.businessArgs);
        return await withTransaction(this.pool, async (connection) => {
            // Principal-row locking serializes quota checks for this identity.
            const owner = await connection.query(
                "SELECT id FROM mcp_principals WHERE id = $1 AND disabled_at IS NULL FOR UPDATE",
                [this.binding.principalId],
            );
            if (owner.rowCount !== 1) {
                throw new Error("authenticated principal is disabled or absent");
            }
            const credential = await connection.query(
                `SELECT id
                   FROM mcp_credentials
                  WHERE id = $1
                    AND principal_id = $2
                    AND revision = $3
                    AND workspace_id = $4
                    AND disabled_at IS NULL`,
                [
                    this.binding.credentialId,
                    this.binding.principalId,
                    this.binding.credentialRevision.toString(),
                    this.binding.workspaceId,
                ],
            );
            if (credential.rowCount !== 1) {
                throw new Error("confirmation credential binding is no longer active");
            }
            const quota = await connection.query<QuotaRow>(
                `SELECT count(*)::text AS preview_count,
                        coalesce(sum(preview_bytes), 0)::text AS preview_bytes
                   FROM mcp_confirmations
                  WHERE principal_id = $1
                    AND expires_at > now()`,
                [this.binding.principalId],
            );
            const current = quota.rows[0];
            const count = Number.parseInt(current?.preview_count ?? "0", 10);
            const bytes = Number.parseInt(current?.preview_bytes ?? "0", 10);
            if (
                count >= MAX_ACTIVE_PREVIEWS ||
                bytes + previewBytes > MAX_ACTIVE_PREVIEW_BYTES
            ) {
                throw new Error(
                    "confirmation preview storage is at capacity; consume or wait for an existing token to expire",
                );
            }
            const databaseClock = await connection.query<{
                created_at: Date;
                expires_at: Date;
            }>(
                `SELECT now() AS created_at,
                        now() + ($1::double precision * interval '1 millisecond') AS expires_at`,
                [CONFIRMATION_TTL_MS],
            );
            const createdAt = requireDate(
                databaseClock.rows[0]?.created_at,
            ).toISOString();
            const expiresAt = requireDate(
                databaseClock.rows[0]?.expires_at,
            ).toISOString();
            const sealed = this.keyring.seal(
                previewJson,
                confirmationAssociatedData({
                    tokenHash,
                    principalId: this.binding.principalId,
                    oauthClientId: this.binding.oauthClientId,
                    credentialId: this.binding.credentialId,
                    credentialRevision: this.binding.credentialRevision,
                    toolName: scope.toolName,
                    risk: scope.risk,
                    businessArgsHash,
                    workspaceId: scope.workspaceId,
                    previewHash,
                    previewBytes,
                    expiresAt,
                }),
            );
            await insertConfirmation(connection, {
                tokenHash,
                binding: this.binding,
                scope,
                businessArgsHash,
                previewHash,
                previewBytes,
                createdAt,
                expiresAt,
                sealed,
            });
            return { confirmToken, previewHash, expiresAt };
        });
    }

    async consume(confirmToken: string, scope: ConfirmationScope): Promise<unknown> {
        if (!/^[A-Za-z0-9_-]{43}$/u.test(confirmToken)) {
            throw unavailableToken();
        }
        // Deliberately autocommit this DELETE. A later mismatch must burn an
        // owner/client token, while the predicates prevent other identities
        // from observing or deleting it.
        const consumed = await this.pool.query<ConfirmationRow>(
            `DELETE FROM mcp_confirmations
                  WHERE token_hash = $1
                    AND principal_id = $2
                    AND oauth_client_id = $3
              RETURNING token_hash,
                        principal_id,
                        oauth_client_id,
                        credential_id,
                        credential_revision::text AS credential_revision,
                        workspace_id,
                        tool_name,
                        risk,
                        business_args_hash,
                        preview_hash,
                        preview_bytes,
                        preview_ciphertext,
                        preview_iv,
                        preview_tag,
                        key_id,
                        expires_at,
                        (expires_at > now()) AS unexpired`,
            [sha256(confirmToken), this.binding.principalId, this.binding.oauthClientId],
        );
        const row = consumed.rows[0];
        if (!row) throw unavailableToken();

        const expiresAt = requireDate(row.expires_at).toISOString();
        const revision = BigInt(row.credential_revision);
        if (
            row.unexpired !== true ||
            row.credential_id !== this.binding.credentialId ||
            revision !== this.binding.credentialRevision ||
            row.workspace_id !== scope.workspaceId ||
            row.tool_name !== scope.toolName ||
            row.risk !== scope.risk ||
            row.business_args_hash !== hashCanonical(scope.businessArgs)
        ) {
            throw new Error("confirmation token does not match this tool call");
        }
        const previewJson = this.keyring.open(
            sealedFromRow(row),
            confirmationAssociatedData({
                tokenHash: row.token_hash,
                principalId: row.principal_id,
                oauthClientId: row.oauth_client_id,
                credentialId: row.credential_id,
                credentialRevision: revision,
                toolName: row.tool_name,
                risk: row.risk,
                businessArgsHash: row.business_args_hash,
                workspaceId: row.workspace_id,
                previewHash: row.preview_hash,
                previewBytes: row.preview_bytes,
                expiresAt,
            }),
        );
        if (
            Buffer.byteLength(previewJson, "utf8") !== row.preview_bytes ||
            sha256(previewJson) !== row.preview_hash
        ) {
            throw new Error("confirmation token preview integrity check failed");
        }
        return JSON.parse(previewJson) as unknown;
    }

    private requireWorkspace(workspaceId: string): void {
        if (workspaceId !== this.binding.workspaceId) {
            throw new Error("confirmation scope is outside the pinned workspace");
        }
    }
}

/** Delete a bounded expiry batch; safe for concurrent replicas and request fallback. */
export async function pruneExpiredConfirmations(
    database: SqlQueryable,
    batchSize = 1_000,
): Promise<number> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
        throw new Error("confirmation cleanup batch size must be between 1 and 10000");
    }
    const result = await database.query(
        `WITH expired AS (
             SELECT token_hash
               FROM mcp_confirmations
              WHERE expires_at <= now()
              ORDER BY expires_at, token_hash
              LIMIT $1
              FOR UPDATE SKIP LOCKED
         )
         DELETE FROM mcp_confirmations AS confirmation
          USING expired
          WHERE confirmation.token_hash = expired.token_hash`,
        [batchSize],
    );
    return result.rowCount ?? 0;
}

interface InsertConfirmation {
    tokenHash: string;
    binding: ConfirmationBinding;
    scope: ConfirmationScope;
    businessArgsHash: string;
    previewHash: string;
    previewBytes: number;
    createdAt: string;
    expiresAt: string;
    sealed: SealedValue;
}

async function insertConfirmation(
    connection: SqlQueryable,
    value: InsertConfirmation,
): Promise<void> {
    await connection.query(
        `INSERT INTO mcp_confirmations (
             token_hash, principal_id, oauth_client_id, credential_id,
             credential_revision, workspace_id, tool_name, risk,
             business_args_hash, preview_hash, preview_bytes,
             preview_ciphertext, preview_iv, preview_tag, key_id, expires_at,
             created_at
         ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16, $17
         )`,
        [
            value.tokenHash,
            value.binding.principalId,
            value.binding.oauthClientId,
            value.binding.credentialId,
            value.binding.credentialRevision.toString(),
            value.scope.workspaceId,
            value.scope.toolName,
            value.scope.risk,
            value.businessArgsHash,
            value.previewHash,
            value.previewBytes,
            value.sealed.ciphertext,
            value.sealed.iv,
            value.sealed.tag,
            value.sealed.keyId,
            value.expiresAt,
            value.createdAt,
        ],
    );
}

function sealedFromRow(row: ConfirmationRow): SealedValue {
    return {
        keyId: row.key_id,
        iv: row.preview_iv,
        ciphertext: row.preview_ciphertext,
        tag: row.preview_tag,
    };
}

function requireDate(value: unknown): Date {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
        throw new Error("confirmation expiry is invalid");
    }
    return value;
}

function unavailableToken(): Error {
    return new Error("confirmation token was not issued, expired, or was already used");
}
