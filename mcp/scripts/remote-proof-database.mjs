import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function proveMigrations({
    database,
    directory,
    modules,
    setPhase,
    assertNotInterrupted,
}) {
    const { migrateDatabase, verifyDatabaseMigrations } = modules;

    setPhase("migrations-preexisting-schema");
    await database.query("CREATE TABLE mcp_principals (id text PRIMARY KEY)");
    await assertRejects(
        () => migrateDatabase(database),
        "preexisting partial schema was accepted",
    );
    const premature = await database.query(
        "SELECT count(*)::text AS count FROM mcp_schema_migrations",
    );
    assert(premature.rows[0]?.count === "0", "failed DDL recorded a migration");
    await database.query("DROP TABLE mcp_principals");

    setPhase("migrations-apply");
    const applied = await migrateDatabase(database);
    assert(applied.includes("001_remote.sql"), "initial migration was not applied");
    assert((await migrateDatabase(database)).length === 0, "migration is not idempotent");

    setPhase("migrations-tables");
    const tables = await database.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name LIKE 'mcp_%'
          ORDER BY table_name`,
    );
    assert(
        tables.rows.map((row) => row.table_name).join(",") ===
            "mcp_confirmations,mcp_credentials,mcp_principals,mcp_schema_migrations",
        "remote schema does not contain the exact four tables",
    );

    setPhase("migrations-checksum");
    const history = await database.query(
        "SELECT version, checksum FROM mcp_schema_migrations WHERE version = '001_remote.sql'",
    );
    const migration = history.rows[0];
    assert(/^[0-9a-f]{64}$/.test(migration?.checksum), "migration checksum is absent");

    setPhase("migrations-history-schema");
    await database.query(
        "ALTER TABLE mcp_schema_migrations DROP CONSTRAINT mcp_schema_migrations_pkey",
    );
    try {
        await assertRejects(
            () => migrateDatabase(database),
            "malformed migration history schema was accepted",
        );
    } finally {
        await database.query(
            "ALTER TABLE mcp_schema_migrations ADD PRIMARY KEY (version)",
        );
    }

    setPhase("migrations-application-constraint");
    await database.query(
        "ALTER TABLE mcp_credentials DROP CONSTRAINT mcp_credentials_principal_id_fkey",
    );
    try {
        await assertRejects(
            () => verifyDatabaseMigrations(database),
            "missing credential-principal foreign key was accepted",
        );
    } finally {
        await database.query(
            "ALTER TABLE mcp_credentials ADD CONSTRAINT mcp_credentials_principal_id_fkey FOREIGN KEY (principal_id) REFERENCES mcp_principals(id) ON DELETE CASCADE",
        );
    }

    setPhase("migrations-critical-index");
    await database.query("DROP INDEX mcp_confirmations_expires_at_idx");
    try {
        await assertRejects(
            () => verifyDatabaseMigrations(database),
            "missing confirmation-expiry index was accepted",
        );
    } finally {
        await database.query(
            "CREATE INDEX mcp_confirmations_expires_at_idx ON mcp_confirmations (expires_at)",
        );
    }

    setPhase("migrations-tamper");
    await database.query(
        "UPDATE mcp_schema_migrations SET checksum = repeat('0', 64) WHERE version = '001_remote.sql'",
    );
    await assertRejects(() => migrateDatabase(database), "migration tamper was accepted");
    await database.query(
        "UPDATE mcp_schema_migrations SET checksum = $1 WHERE version = '001_remote.sql'",
        [migration.checksum],
    );

    setPhase("migrations-orphan-history");
    await database.query(
        "INSERT INTO mcp_schema_migrations (version, checksum) VALUES ('999_future.sql', repeat('f', 64))",
    );
    await assertRejects(
        () => migrateDatabase(database),
        "migration history absent from the package was accepted",
    );
    await database.query(
        "DELETE FROM mcp_schema_migrations WHERE version = '999_future.sql'",
    );

    setPhase("migrations-version-skew");
    const oldDirectory = join(directory, "migrations-old");
    const newDirectory = join(directory, "migrations-new");
    await mkdir(oldDirectory);
    await mkdir(newDirectory);
    const officialSql = await readFile(
        new URL("../migrations/001_remote.sql", import.meta.url),
        "utf8",
    );
    const indexSql = await readFile(
        new URL("../migrations/002_encryption_key_lookup.sql", import.meta.url),
        "utf8",
    );
    await Promise.all([
        writeFile(join(oldDirectory, "001_remote.sql"), officialSql),
        writeFile(join(newDirectory, "001_remote.sql"), officialSql),
        writeFile(join(oldDirectory, "002_encryption_key_lookup.sql"), indexSql),
        writeFile(join(newDirectory, "002_encryption_key_lookup.sql"), indexSql),
        writeFile(join(newDirectory, "003_slow.sql"), "SELECT pg_sleep(0.5);\n"),
    ]);
    const newer = migrateDatabase(database, directoryUrl(newDirectory));
    await waitForMigrationSleep(database, assertNotInterrupted);
    const older = migrateDatabase(database, directoryUrl(oldDirectory));
    await newer;
    await assertRejects(
        () => older,
        "older migration inventory started after a newer migration",
    );
    await database.query(
        "DELETE FROM mcp_schema_migrations WHERE version = '003_slow.sql'",
    );

    setPhase("migrations-lock-contention");
    const blocker = await database.connect();
    let blocked = false;
    try {
        await blocker.query(
            "SELECT pg_advisory_lock(hashtext('clockify115-mcp-migrations'))",
        );
        blocked = true;
        const started = Date.now();
        await assertRejects(
            () => migrateDatabase(database),
            "migration lock contention was not bounded",
        );
        const elapsed = Date.now() - started;
        await blocker.query(
            "SELECT pg_advisory_unlock(hashtext('clockify115-mcp-migrations'))",
        );
        blocked = false;
        assert(elapsed >= 4_500 && elapsed < 8_000, "migration lock wait bound drifted");
        assert((await migrateDatabase(database)).length === 0, "migration lock leaked");
    } finally {
        if (blocked) {
            await blocker
                .query("SELECT pg_advisory_unlock(hashtext('clockify115-mcp-migrations'))")
                .catch(() => {});
        }
        blocker.release();
    }
}

export async function proveBackupRestore({
    port,
    storage,
    proofId,
    containerName,
    databaseName,
    databaseUser,
    databasePassword,
    issuer,
    modules,
    run,
    withDeadline,
}) {
    const {
        PostgresPool,
        verifyDatabaseMigrations,
        PostgresEncryptionService,
        PostgresCredentialStore,
    } = modules;
    const restoredDatabase = `${databaseName}_restore`;
    const dumpPath = `/tmp/${proofId}.dump`;
    const startedAt = Date.now();
    let restoredPool;
    try {
        await run("docker", [
            "exec",
            containerName,
            "pg_dump",
            "--format=custom",
            "--no-password",
            "--username",
            databaseUser,
            "--file",
            dumpPath,
            databaseName,
        ]);
        await run("docker", [
            "exec",
            containerName,
            "createdb",
            "--no-password",
            "--username",
            databaseUser,
            restoredDatabase,
        ]);
        await run("docker", [
            "exec",
            containerName,
            "pg_restore",
            "--exit-on-error",
            "--no-owner",
            "--no-password",
            "--username",
            databaseUser,
            "--dbname",
            restoredDatabase,
            dumpPath,
        ]);
        restoredPool = PostgresPool.fromConnectionString(
            `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${restoredDatabase}?sslmode=disable`,
        );
        await verifyDatabaseMigrations(restoredPool);
        await new PostgresEncryptionService(restoredPool, storage.keyring).assertReadable();
        const credentials = new PostgresCredentialStore(
            restoredPool,
            storage.keyring,
            issuer,
        );
        const restored = await credentials.load({
            issuer,
            subject: storage.subject,
            oauthClientId: "recovery-proof",
            tokenScopes: new Set(["clockify:read"]),
        });
        assert(restored.apiKey === storage.expectedApiKey, "restored credential decrypt failed");
        return {
            method: "pg_dump-custom-and-pg_restore",
            credential: "decrypted",
            elapsedMs: Date.now() - startedAt,
        };
    } finally {
        let cleanupFailure;
        try {
            if (restoredPool) {
                await withDeadline(
                    restoredPool.end(),
                    10_000,
                    "restored PostgreSQL pool did not close",
                );
            }
        } catch (error) {
            cleanupFailure = error;
        }
        try {
            await run(
                "docker",
                [
                    "exec",
                    containerName,
                    "dropdb",
                    "--if-exists",
                    "--force",
                    "--no-password",
                    "--username",
                    databaseUser,
                    restoredDatabase,
                ],
                true,
            );
        } catch (error) {
            cleanupFailure ??= error;
        }
        if (cleanupFailure !== undefined) throw cleanupFailure;
    }
}

async function waitForMigrationSleep(database, assertNotInterrupted) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        assertNotInterrupted();
        const active = await database.query(
            `SELECT count(*)::text AS count
               FROM pg_stat_activity
              WHERE pid <> pg_backend_pid()
                AND state = 'active'
                AND query LIKE '%pg_sleep(0.5)%'`,
        );
        if (active.rows[0]?.count !== "0") return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("newer migration did not acquire the advisory lock");
}

function directoryUrl(path) {
    return new URL("./", pathToFileURL(`${path}/`));
}

async function assertRejects(operation, message) {
    try {
        await operation();
    } catch {
        return;
    }
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
