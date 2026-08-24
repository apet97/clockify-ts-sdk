import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    migrateDatabase,
    verifyDatabaseMigrations,
} from "../src/remote/migrations.js";
import type {
    QueryResult,
    SqlConnection,
    SqlPool,
} from "../src/remote/types.js";

describe("checksum-verified database migrations", () => {
    let directory: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "clockify-mcp-migrations-"));
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("records exact SQL checksums and is idempotent", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();

        await expect(migrateDatabase(pool, directoryUrl(directory))).resolves.toEqual([
            "001_fixture.sql",
        ]);
        await expect(migrateDatabase(pool, directoryUrl(directory))).resolves.toEqual([]);
        expect(pool.applied.get("001_fixture.sql")).toMatch(/^[0-9a-f]{64}$/u);
        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).resolves.toBeUndefined();
    });

    it("validates without applying missing or changed migrations", async () => {
        const file = join(directory, "001_fixture.sql");
        await writeFile(file, "SELECT 1;\n");
        const pool = new MigrationPool();

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/has not been applied/u);
        expect(pool.applied.size).toBe(0);

        await migrateDatabase(pool, directoryUrl(directory));
        await writeFile(file, "SELECT 2;\n");
        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/checksum differs/u);
    });

    it("fails when an applied migration file changes", async () => {
        const file = join(directory, "001_fixture.sql");
        await writeFile(file, "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        await writeFile(file, "SELECT 2;\n");

        await expect(migrateDatabase(pool, directoryUrl(directory))).rejects.toThrow(
            /checksum differs/u,
        );
    });

    it("fails closed on unverifiable prerelease history", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        pool.unverifiableVersion = "000_legacy.sql";

        await expect(migrateDatabase(pool, directoryUrl(directory))).rejects.toThrow(
            /has no checksum/u,
        );
    });

    it("fails when database history contains a migration absent from the package", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        pool.applied.set("002_future.sql", "0".repeat(64));

        await expect(migrateDatabase(pool, directoryUrl(directory))).rejects.toThrow(
            /absent from this package/u,
        );
    });

    it("fails closed when the migration history table has no version primary key", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        pool.primaryKeyCount = "0";

        await expect(migrateDatabase(pool, directoryUrl(directory))).rejects.toThrow(
            /history schema is malformed/u,
        );
    });

    it("fails closed when an application column is missing", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.missingApplicationColumn = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*column/u);
    });

    it("fails closed when an application column type is malformed", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.malformedApplicationColumn = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*column/u);
    });

    it("fails closed when a tenant-binding constraint is missing", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.missingApplicationConstraint = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*constraint/u);
    });

    it("fails closed when an unexpected data constraint is present", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.unexpectedApplicationConstraint = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*constraint/u);
    });

    it("preserves case-sensitive SQL literals when validating constraints", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.malformedConstraintLiteral = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*constraint/u);
    });

    it("fails closed when a critical cleanup index is missing", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.missingCriticalIndex = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*index/u);
    });

    it("fails closed when a critical index has the wrong columns", async () => {
        await writeFile(join(directory, "001_fixture.sql"), "SELECT 1;\n");
        const pool = new MigrationPool();
        await migrateDatabase(pool, directoryUrl(directory));
        pool.malformedCriticalIndex = true;

        await expect(
            verifyDatabaseMigrations(pool, directoryUrl(directory)),
        ).rejects.toThrow(/application schema.*index/u);
    });
});

class MigrationPool implements SqlPool, SqlConnection {
    readonly applied = new Map<string, string>();
    unverifiableVersion: string | undefined;
    primaryKeyCount = "1";
    missingApplicationColumn = false;
    malformedApplicationColumn = false;
    missingApplicationConstraint = false;
    unexpectedApplicationConstraint = false;
    malformedConstraintLiteral = false;
    missingCriticalIndex = false;
    malformedCriticalIndex = false;

    async query<Row extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values: readonly unknown[] = [],
    ): Promise<QueryResult<Row>> {
        if (text.startsWith("SELECT pg_try_advisory_lock")) {
            return rows([{ locked: true }]);
        }
        if (text.includes("WHERE checksum IS NULL")) {
            return this.unverifiableVersion
                ? rows([{ version: this.unverifiableVersion }])
                : rows([]);
        }
        if (
            text.startsWith("SELECT version, checksum") &&
            text.includes("WHERE version = $1")
        ) {
            const version = String(values[0]);
            const checksum = this.applied.get(version);
            return checksum === undefined ? rows([]) : rows([{ version, checksum }]);
        }
        if (text === "SELECT version, checksum FROM mcp_schema_migrations ORDER BY version") {
            return rows(
                [...this.applied.entries()]
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([version, checksum]) => ({ version, checksum })),
            );
        }
        if (
            text.includes("FROM information_schema.columns") &&
            text.includes("column_name IN ('version', 'checksum', 'applied_at')")
        ) {
            return rows([
                {
                    column_name: "version",
                    data_type: "text",
                    character_maximum_length: null,
                    is_nullable: "NO",
                    column_default: null,
                },
                {
                    column_name: "checksum",
                    data_type: "character",
                    character_maximum_length: 64,
                    is_nullable: "NO",
                    column_default: null,
                },
                {
                    column_name: "applied_at",
                    data_type: "timestamp with time zone",
                    character_maximum_length: null,
                    is_nullable: "NO",
                    column_default: "now()",
                },
            ]);
        }
        if (
            text.includes("FROM information_schema.columns") &&
            text.includes("table_name = ANY($1::text[])")
        ) {
            const columns = applicationColumns().map((column) =>
                this.malformedApplicationColumn &&
                column.table_name === "mcp_credentials" &&
                column.column_name === "workspace_id"
                    ? { ...column, data_type: "uuid" }
                    : column,
            );
            return rows(
                this.missingApplicationColumn
                    ? columns.filter(
                          (column) =>
                              !(
                                  column.table_name === "mcp_credentials" &&
                                  column.column_name === "workspace_id"
                              ),
                      )
                    : columns,
            );
        }
        if (text.includes("FROM pg_constraint AS constraint_record")) {
            const constraints = applicationConstraints().map((constraint) =>
                this.malformedConstraintLiteral &&
                constraint.table_name === "mcp_credentials" &&
                constraint.definition ===
                    "CHECK (workspace_id ~ '^[0-9a-f]{24}$')"
                    ? {
                          ...constraint,
                          definition: "CHECK (workspace_id ~ '^[0-9A-F]{24}$')",
                      }
                    : constraint,
            );
            if (this.unexpectedApplicationConstraint) {
                constraints.push(check("mcp_principals", "CHECK (issuer <> '')"));
            }
            return rows(
                this.missingApplicationConstraint
                    ? constraints.filter(
                          (constraint) =>
                              !(
                                  constraint.table_name === "mcp_credentials" &&
                                  constraint.constraint_type === "f"
                              ),
                      )
                    : constraints,
            );
        }
        if (text.includes("FROM pg_index AS index_record")) {
            const indexes = applicationIndexes().map((index) =>
                this.malformedCriticalIndex &&
                index.index_name === "mcp_confirmations_expires_at_idx"
                    ? { ...index, columns: ["created_at"] }
                    : index,
            );
            return rows(
                this.missingCriticalIndex
                    ? indexes.filter(
                          (index) =>
                              index.index_name !== "mcp_confirmations_expires_at_idx",
                      )
                    : indexes,
            );
        }
        if (text.includes("FROM pg_constraint")) {
            return rows([{ primary_key_count: this.primaryKeyCount }]);
        }
        if (text.startsWith("SELECT version FROM mcp_schema_migrations")) {
            return rows([...this.applied.keys()].sort().map((version) => ({ version })));
        }
        if (text.startsWith("INSERT INTO mcp_schema_migrations")) {
            this.applied.set(String(values[0]), String(values[1]));
            return rows([]);
        }
        return rows([]);
    }

    async connect(): Promise<SqlConnection> {
        return this;
    }

    release(): void {}

    async end(): Promise<void> {}
}

function rows<ResultRow extends Record<string, unknown>>(
    values: Record<string, unknown>[],
): QueryResult<ResultRow> {
    return { rows: values as unknown as ResultRow[], rowCount: values.length };
}

function directoryUrl(path: string): URL {
    return new URL("./", pathToFileURL(`${path}/`));
}

type FixtureColumnSpec = readonly [
    type: string,
    nullable: "YES" | "NO",
    defaultValue?: string,
];

const FIXTURE_COLUMNS = {
    mcp_principals: {
        id: ["uuid", "NO"],
        issuer: ["text", "NO"],
        subject_hash: ["character(64)", "NO"],
        max_grant: ["text", "NO"],
        disabled_at: ["timestamp with time zone", "YES"],
        created_at: ["timestamp with time zone", "NO", "now()"],
        updated_at: ["timestamp with time zone", "NO", "now()"],
    },
    mcp_credentials: {
        id: ["uuid", "NO"],
        principal_id: ["uuid", "NO"],
        workspace_id: ["text", "NO"],
        region: ["text", "NO"],
        subdomain: ["text", "YES"],
        api_key_ciphertext: ["bytea", "NO"],
        api_key_iv: ["bytea", "NO"],
        api_key_tag: ["bytea", "NO"],
        key_id: ["text", "NO"],
        revision: ["bigint", "NO"],
        disabled_at: ["timestamp with time zone", "YES"],
        created_at: ["timestamp with time zone", "NO", "now()"],
        updated_at: ["timestamp with time zone", "NO", "now()"],
    },
    mcp_confirmations: {
        token_hash: ["character(64)", "NO"],
        principal_id: ["uuid", "NO"],
        oauth_client_id: ["text", "NO"],
        credential_id: ["uuid", "NO"],
        credential_revision: ["bigint", "NO"],
        workspace_id: ["text", "NO"],
        tool_name: ["text", "NO"],
        risk: ["text", "NO"],
        business_args_hash: ["character(64)", "NO"],
        preview_hash: ["character(64)", "NO"],
        preview_bytes: ["integer", "NO"],
        preview_ciphertext: ["bytea", "NO"],
        preview_iv: ["bytea", "NO"],
        preview_tag: ["bytea", "NO"],
        key_id: ["text", "NO"],
        expires_at: ["timestamp with time zone", "NO"],
        created_at: ["timestamp with time zone", "NO", "now()"],
    },
} as const satisfies Record<string, Record<string, FixtureColumnSpec>>;

function applicationColumns(): Record<string, unknown>[] {
    return Object.entries(FIXTURE_COLUMNS).flatMap(([tableName, columns]) =>
        Object.entries(columns).map(([columnName, [type, nullable, defaultValue]]) => {
            const character = /^character\((\d+)\)$/u.exec(type);
            return {
                table_name: tableName,
                column_name: columnName,
                data_type: character ? "character" : type,
                character_maximum_length: character ? Number(character[1]) : null,
                is_nullable: nullable,
                column_default: defaultValue ?? null,
            };
        }),
    );
}

function applicationConstraints(): Record<string, unknown>[] {
    return [
        primary("mcp_principals", ["id"]),
        unique("mcp_principals", ["issuer", "subject_hash"]),
        check("mcp_principals", "CHECK (max_grant IN ('read', 'write', 'admin'))"),
        primary("mcp_credentials", ["id"]),
        unique("mcp_credentials", ["principal_id"]),
        foreign("mcp_credentials", ["principal_id"], "mcp_principals", ["id"]),
        check("mcp_credentials", "CHECK (workspace_id ~ '^[0-9a-f]{24}$')"),
        check(
            "mcp_credentials",
            "CHECK (region IN ('global', 'eu', 'us', 'uk', 'au', 'developer'))",
        ),
        check("mcp_credentials", "CHECK (subdomain ~ '^[a-z0-9][a-z0-9-]{0,62}$')"),
        check("mcp_credentials", "CHECK (revision > 0)"),
        check(
            "mcp_credentials",
            "CHECK (subdomain IS NULL OR region IN ('eu', 'us', 'uk', 'au'))",
        ),
        primary("mcp_confirmations", ["token_hash"]),
        foreign("mcp_confirmations", ["principal_id"], "mcp_principals", ["id"]),
        foreign(
            "mcp_confirmations",
            ["credential_id"],
            "mcp_credentials",
            ["id"],
        ),
        check("mcp_confirmations", "CHECK (credential_revision > 0)"),
        check("mcp_confirmations", "CHECK (workspace_id ~ '^[0-9a-f]{24}$')"),
        check(
            "mcp_confirmations",
            "CHECK (risk IN ('read', 'routine_write', 'business_write', 'external_side_effect', 'privileged', 'destructive'))",
        ),
        check(
            "mcp_confirmations",
            "CHECK (preview_bytes >= 0 AND preview_bytes <= 4194304)",
        ),
    ];
}

function primary(table: string, columns: string[]): Record<string, unknown> {
    return constraint(table, "p", columns);
}

function unique(table: string, columns: string[]): Record<string, unknown> {
    return constraint(table, "u", columns);
}

function foreign(
    table: string,
    columns: string[],
    referencedTable: string,
    referencedColumns: string[],
): Record<string, unknown> {
    return {
        ...constraint(table, "f", columns),
        referenced_table: referencedTable,
        referenced_columns: referencedColumns,
        delete_action: "c",
    };
}

function check(table: string, definition: string): Record<string, unknown> {
    return { ...constraint(table, "c", []), definition };
}

function constraint(
    table: string,
    type: "p" | "u" | "f" | "c",
    columns: string[],
): Record<string, unknown> {
    return {
        table_name: table,
        constraint_type: type,
        columns,
        referenced_table: null,
        referenced_in_current_schema: true,
        referenced_columns: [],
        delete_action: " ",
        definition: "",
        is_validated: true,
        is_deferrable: false,
        is_deferred: false,
        backing_index_valid: true,
    };
}

function applicationIndexes(): Record<string, unknown>[] {
    return [
        index("mcp_confirmations_expires_at_idx", "mcp_confirmations", ["expires_at"]),
        index("mcp_confirmations_principal_idx", "mcp_confirmations", [
            "principal_id",
            "created_at",
        ]),
        index("mcp_credentials_key_lookup_idx", "mcp_credentials", ["key_id", "id"]),
        index("mcp_confirmations_key_lookup_idx", "mcp_confirmations", [
            "key_id",
            "token_hash",
        ]),
    ];
}

function index(name: string, table: string, columns: string[]): Record<string, unknown> {
    return {
        table_name: table,
        index_name: name,
        method: "btree",
        is_unique: false,
        is_valid: true,
        is_ready: true,
        key_attribute_count: columns.length,
        attribute_count: columns.length,
        columns,
        predicate: null,
        expressions: null,
    };
}
