import { readdir, readFile } from "node:fs/promises";

import { validateApplicationSchema } from "./application-schema-verification.js";
import { sha256 } from "./crypto.js";
import type { SqlConnection, SqlPool } from "./types.js";

const MIGRATION_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_WAIT_MS = 5_000;
const MIGRATION_LOCK_POLL_MS = 50;

export async function migrateDatabase(
    pool: SqlPool,
    directory = new URL("../../migrations/", import.meta.url),
): Promise<readonly string[]> {
    const migrations = await readMigrations(directory);
    const connection = await pool.connect();
    let locked = false;
    let failed = false;
    try {
        await acquireMigrationLock(connection);
        locked = true;
        return await migrateLocked(connection, migrations);
    } catch (error) {
        failed = true;
        throw error;
    } finally {
        try {
            if (locked) {
                await connection.query(
                    "SELECT pg_advisory_unlock(hashtext('clockify115-mcp-migrations'))",
                );
            }
        } catch (error) {
            if (!failed) throw error;
        } finally {
            connection.release();
        }
    }
}

async function acquireMigrationLock(connection: SqlConnection): Promise<void> {
    const deadline = Date.now() + MIGRATION_LOCK_WAIT_MS;
    for (;;) {
        const result = await connection.query<{ locked: boolean }>(
            "SELECT pg_try_advisory_lock(hashtext('clockify115-mcp-migrations')) AS locked",
        );
        if (result.rows[0]?.locked === true) return;
        if (Date.now() >= deadline) {
            throw new Error("database migration lock is unavailable");
        }
        await delay(MIGRATION_LOCK_POLL_MS);
    }
}

async function delay(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

interface MigrationFile {
    version: string;
    sql: string;
    checksum: string;
}

interface AppliedMigration extends Record<string, unknown> {
    version: string;
    checksum: string;
}

interface MigrationHistoryColumn extends Record<string, unknown> {
    column_name: string;
    data_type: string;
    character_maximum_length: number | null;
    is_nullable: "YES" | "NO";
    column_default: string | null;
}

interface MigrationHistoryKey extends Record<string, unknown> {
    primary_key_count: string;
}

async function readMigrations(directory: URL): Promise<readonly MigrationFile[]> {
    const entries = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && MIGRATION_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    if (entries.length === 0) throw new Error("no MCP database migrations were found");
    return await Promise.all(
        entries.map(async (version) => {
            const sql = await readFile(new URL(version, directory), "utf8");
            return { version, sql, checksum: sha256(sql) };
        }),
    );
}

/** Verify the packaged migration inventory without requiring schema-write privileges. */
export async function verifyDatabaseMigrations(
    pool: SqlPool,
    directory = new URL("../../migrations/", import.meta.url),
): Promise<void> {
    const migrations = await readMigrations(directory);
    const connection = await pool.connect();
    try {
        await validateMigrationHistorySchema(connection);
        const history = await connection.query<AppliedMigration>(
            "SELECT version, checksum FROM mcp_schema_migrations ORDER BY version",
        );
        const packaged = new Map(
            migrations.map((migration) => [migration.version, migration.checksum]),
        );
        for (const applied of history.rows) {
            const checksum = packaged.get(applied.version);
            if (checksum === undefined) {
                throw new Error(
                    `database migration ${applied.version} is absent from this package`,
                );
            }
            if (checksum !== applied.checksum) {
                throw new Error(
                    `database migration ${applied.version} checksum differs from the applied migration`,
                );
            }
            packaged.delete(applied.version);
        }
        const missing = packaged.keys().next().value;
        if (missing !== undefined) {
            throw new Error(`database migration ${missing} has not been applied`);
        }
        await validateApplicationSchema(connection);
    } finally {
        connection.release();
    }
}

async function migrateLocked(
    connection: SqlConnection,
    migrations: readonly MigrationFile[],
): Promise<readonly string[]> {
    await connection.query(
        `CREATE TABLE IF NOT EXISTS mcp_schema_migrations (
            version text PRIMARY KEY,
            checksum char(64) NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now()
        )`,
    );
    // A prerelease build briefly created this table without checksums. Add the
    // column without inventing trust for those rows, then fail closed below.
    await connection.query(
        "ALTER TABLE mcp_schema_migrations ADD COLUMN IF NOT EXISTS checksum char(64)",
    );
    const unverifiable = await connection.query<{ version: string }>(
        "SELECT version FROM mcp_schema_migrations WHERE checksum IS NULL ORDER BY version LIMIT 1",
    );
    if (unverifiable.rows[0]) {
        throw new Error(
            `database migration ${unverifiable.rows[0].version} has no checksum; restore from a trusted migration history before startup`,
        );
    }
    await connection.query("ALTER TABLE mcp_schema_migrations ALTER COLUMN checksum SET NOT NULL");
    await validateMigrationHistorySchema(connection);
    const packaged = new Set(migrations.map(({ version }) => version));
    const history = await connection.query<{ version: string }>(
        "SELECT version FROM mcp_schema_migrations ORDER BY version",
    );
    const absent = history.rows.find((row) => !packaged.has(row.version));
    if (absent) {
        throw new Error(`database migration ${absent.version} is absent from this package`);
    }

    const applied: string[] = [];
    for (const migration of migrations) {
        const changed = await inTransaction(connection, async () => {
            const existing = await connection.query<{
                version: string;
                checksum: string;
            }>("SELECT version, checksum FROM mcp_schema_migrations WHERE version = $1", [
                migration.version,
            ]);
            const appliedMigration = existing.rows[0];
            if (appliedMigration) {
                if (appliedMigration.checksum !== migration.checksum) {
                    throw new Error(
                        `database migration ${migration.version} checksum differs from the applied migration`,
                    );
                }
                return false;
            }
            await connection.query(migration.sql);
            await connection.query(
                "INSERT INTO mcp_schema_migrations (version, checksum) VALUES ($1, $2)",
                [migration.version, migration.checksum],
            );
            return true;
        });
        if (changed) applied.push(migration.version);
    }
    await validateApplicationSchema(connection);
    return applied;
}

async function validateMigrationHistorySchema(connection: SqlConnection): Promise<void> {
    const result = await connection.query<MigrationHistoryColumn>(
        `SELECT column_name, data_type, character_maximum_length,
                is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'mcp_schema_migrations'
            AND column_name IN ('version', 'checksum', 'applied_at')`,
    );
    const columns = new Map(result.rows.map((column) => [column.column_name, column]));
    const version = columns.get("version");
    const checksum = columns.get("checksum");
    const appliedAt = columns.get("applied_at");
    const validColumns =
        version?.data_type === "text" &&
        version.is_nullable === "NO" &&
        version.column_default === null &&
        checksum?.data_type === "character" &&
        checksum.character_maximum_length === 64 &&
        checksum.is_nullable === "NO" &&
        checksum.column_default === null &&
        appliedAt?.data_type === "timestamp with time zone" &&
        appliedAt.is_nullable === "NO" &&
        appliedAt.column_default === "now()";
    const key = await connection.query<MigrationHistoryKey>(
        `SELECT count(*)::text AS primary_key_count
           FROM pg_constraint
          WHERE conrelid = 'mcp_schema_migrations'::regclass
            AND contype = 'p'
            AND conkey = ARRAY[(
                SELECT attnum
                  FROM pg_attribute
                 WHERE attrelid = 'mcp_schema_migrations'::regclass
                   AND attname = 'version'
                   AND NOT attisdropped
            )]::smallint[]`,
    );
    if (!validColumns || key.rows[0]?.primary_key_count !== "1") {
        throw new Error(
            "database migration history schema is malformed; restore it from a trusted backup",
        );
    }
}

async function inTransaction<T>(
    connection: SqlConnection,
    operation: () => Promise<T>,
): Promise<T> {
    await connection.query("BEGIN");
    try {
        const result = await operation();
        await connection.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await connection.query("ROLLBACK");
        } catch {
            // Preserve the owning migration failure.
        }
        throw error;
    }
}
