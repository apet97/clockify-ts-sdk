import { EventEmitter } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CapturedPool extends EventEmitter {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    options: { max: number };
    query(): Promise<{ rows: never[]; rowCount: number }>;
    connect(): Promise<{
        query(): Promise<{ rows: never[]; rowCount: number }>;
        release(): void;
    }>;
}

const capturedConfigs = vi.hoisted(() => [] as unknown[]);
const capturedPools = vi.hoisted(() => [] as CapturedPool[]);

vi.mock("pg", () => ({
    Pool: class extends EventEmitter {
        totalCount = 0;
        idleCount = 0;
        waitingCount = 0;
        options = { max: 10 };

        constructor(config: unknown) {
            super();
            capturedConfigs.push(config);
            capturedPools.push(this);
        }

        async query(): Promise<{ rows: never[]; rowCount: number }> {
            return { rows: [], rowCount: 0 };
        }

        async connect() {
            return {
                async query(): Promise<{ rows: never[]; rowCount: number }> {
                    return { rows: [], rowCount: 0 };
                },
                release(): void {},
            };
        }

        async end(): Promise<void> {}
    },
}));

import { PostgresPool } from "../src/remote/postgres.js";

describe("PostgreSQL environment boundary", () => {
    let directory: string;
    let passFile: string;

    beforeEach(async () => {
        capturedConfigs.length = 0;
        capturedPools.length = 0;
        directory = await mkdtemp(join(tmpdir(), "clockify-mcp-postgres-"));
        passFile = join(directory, "pgpass");
    });

    afterEach(async () => {
        vi.useRealTimers();
        await rm(directory, { recursive: true, force: true });
    });

    it.each([
        ["DATABASE_URL", ""],
        ["DATABASE_URL", "postgresql://ignored.invalid/database"],
        ["PGPASSWORD", ""],
        ["PGPASSWORD", "not-accepted"],
        ["PGOPTIONS", "-c search_path=attacker -c statement_timeout=0"],
        ["PGREPLICATION", "database"],
        ["CLOCKIFY_MCP_DATABASE_URL_FILE", "  "],
    ])("rejects a present %s setting", async (name, value) => {
        await expect(PostgresPool.fromEnvironment({ [name]: value })).rejects.toThrow();
        expect(capturedConfigs).toHaveLength(0);
    });

    it("owns exact PGPASSFILE parsing, matching, and escaping", async () => {
        await writeFile(
            passFile,
            [
                "# first matching record wins",
                "other:5432:*:alice:wrong",
                "127.0.0.1:5432:clock\\:db:alice:secret\\:slash\\\\tail",
                "*:*:*:*:fallback",
                "",
            ].join("\n"),
            { mode: 0o600 },
        );

        const pool = await PostgresPool.fromEnvironment({
            PGHOST: "127.0.0.1",
            PGPORT: "5432",
            PGDATABASE: "clock:db",
            PGUSER: "alice",
            PGPASSFILE: passFile,
            PGSSLMODE: "disable",
        });

        expect(capturedConfigs.at(-1)).toMatchObject({
            host: "127.0.0.1",
            port: 5432,
            database: "clock:db",
            user: "alice",
            password: "secret:slash\\tail",
            ssl: false,
            client_encoding: "UTF8",
            options: "-c search_path=public",
            replication: "false",
            sslnegotiation: "postgres",
            query_timeout: 10_000,
            statement_timeout: 8_000,
            lock_timeout: 3_000,
            idle_in_transaction_session_timeout: 10_000,
        });
        await pool.end();
    });

    it("rejects unmatched, malformed, and non-0600 passfiles", async () => {
        const env = {
            PGHOST: "db.internal",
            PGDATABASE: "clockify",
            PGUSER: "alice",
            PGPASSFILE: passFile,
        };
        await writeFile(passFile, "other:5432:clockify:alice:secret\n", {
            mode: 0o600,
        });
        await expect(PostgresPool.fromEnvironment(env)).rejects.toThrow(/no entry/u);

        await writeFile(passFile, "malformed\n", { mode: 0o600 });
        await expect(PostgresPool.fromEnvironment(env)).rejects.toThrow(/malformed/u);

        await chmod(passFile, 0o644);
        await expect(PostgresPool.fromEnvironment(env)).rejects.toThrow(/0600/u);
    });

    it("rejects PGPASSFILE alongside the database URL file", async () => {
        const urlFile = join(directory, "database-url");
        await writeFile(urlFile, "postgresql://db.invalid/clockify\n", { mode: 0o600 });
        await writeFile(passFile, "*:*:*:*:secret\n", { mode: 0o600 });

        await expect(
            PostgresPool.fromEnvironment({
                CLOCKIFY_MCP_DATABASE_URL_FILE: urlFile,
                PGPASSFILE: passFile,
            }),
        ).rejects.toThrow(/cannot be combined/u);
    });

    it.each([
        ["disable", false],
        ["require", { rejectUnauthorized: false }],
        ["verify-full", { rejectUnauthorized: true }],
    ])("maps the supported PGSSLMODE %s exactly", async (mode, ssl) => {
        const pool = await PostgresPool.fromEnvironment({ PGSSLMODE: mode });
        expect(capturedConfigs.at(-1)).toMatchObject({ ssl });
        await pool.end();
    });

    it.each(["allow", "prefer", "verify-ca", "bogus"])(
        "rejects unsupported PGSSLMODE %s",
        async (mode) => {
            await expect(
                PostgresPool.fromEnvironment({ PGSSLMODE: mode }),
            ).rejects.toThrow(/disable, require, or verify-full/u);
        },
    );

    it.each(["", "   "])("rejects a present blank PGSSLMODE", async (mode) => {
        await expect(PostgresPool.fromEnvironment({ PGSSLMODE: mode })).rejects.toThrow(
            /disable, require, or verify-full/u,
        );
        expect(capturedConfigs).toHaveLength(0);
    });

    it.each(["allow", "prefer", "verify-ca", "no-verify"])(
        "rejects unsupported connection-URL sslmode %s",
        (mode) => {
            expect(() =>
                PostgresPool.fromConnectionString(
                    `postgresql://db.invalid/clockify?sslmode=${mode}`,
                ),
            ).toThrow(/disable, require, or verify-full/u);
            expect(capturedConfigs).toHaveLength(0);
        },
    );

    it.each(["", "%20"])(
        "rejects a present blank connection-URL sslmode",
        (mode) => {
            expect(() =>
                PostgresPool.fromConnectionString(
                    `postgresql://db.invalid/clockify?sslmode=${mode}`,
                ),
            ).toThrow(/disable, require, or verify-full/u);
            expect(capturedConfigs).toHaveLength(0);
        },
    );

    it.each([
        "uselibpqcompat=true",
        "useLibpqCompat=true",
        "sslcert=%2Ftmp%2Fclient.crt",
        "sslrootcert=%2Ftmp%2Froot.crt",
        "sslnegotiation=direct",
        "application_name=operator",
        "statement_timeout=0",
        "lock_timeout=0",
        "query_timeout=999999999",
    ])("rejects connection-URL policy override %s", (query) => {
        expect(() =>
            PostgresPool.fromConnectionString(
                `postgresql://db.invalid/clockify?${query}`,
            ),
        ).toThrow(/must not set/u);
        expect(capturedConfigs).toHaveLength(0);
    });

    it.each([
        ["disable", false],
        ["require", { rejectUnauthorized: false }],
        ["verify-full", { rejectUnauthorized: true }],
    ])("normalizes connection-URL sslmode %s into explicit TLS config", (mode, ssl) => {
        const pool = PostgresPool.fromConnectionString(
            `postgresql://db.invalid/clockify?sslmode=${mode}`,
        );
        expect(capturedConfigs.at(-1)).toMatchObject({
            connectionString: "postgresql://db.invalid/clockify",
            ssl,
        });
        return pool.end();
    });

    it("loads a private CA only for verify-full TLS", async () => {
        const caFile = join(directory, "database-ca.pem");
        await writeFile(caFile, "fixture private CA\n", { mode: 0o600 });

        const pool = await PostgresPool.fromEnvironment({
            PGSSLMODE: "verify-full",
            CLOCKIFY_MCP_DATABASE_CA_FILE: caFile,
        });
        expect(capturedConfigs.at(-1)).toMatchObject({
            ssl: { rejectUnauthorized: true, ca: "fixture private CA\n" },
        });
        await pool.end();

        await expect(
            PostgresPool.fromEnvironment({
                PGSSLMODE: "require",
                CLOCKIFY_MCP_DATABASE_CA_FILE: caFile,
            }),
        ).rejects.toThrow(/requires PGSSLMODE=verify-full/u);
    });

    it("contains idle-client errors and emits only a sanitized notification", async () => {
        const onIdleClientError = vi.fn();
        const pool = await PostgresPool.fromEnvironment({}, { onIdleClientError });

        expect(() =>
            capturedPools.at(-1)?.emit("error", new Error("secret database detail")),
        ).not.toThrow();
        expect(onIdleClientError).toHaveBeenCalledOnce();
        expect(onIdleClientError).toHaveBeenCalledWith();
        await pool.end();
    });

    it("emits bounded pool counts only when PostgreSQL pool pressure exists", async () => {
        const onPoolPressure = vi.fn();
        const pool = await PostgresPool.fromEnvironment({}, { onPoolPressure });
        const driver = latestPool();

        driver.totalCount = 9;
        driver.idleCount = 0;
        driver.waitingCount = 0;
        await pool.query("SELECT private_query_text");
        expect(onPoolPressure).not.toHaveBeenCalled();

        driver.totalCount = 10;
        await pool.query("SELECT private_query_text");
        expect(onPoolPressure).toHaveBeenCalledOnce();
        expect(onPoolPressure).toHaveBeenCalledWith({
            totalConnections: 10,
            idleConnections: 0,
            waitingRequests: 0,
            maxConnections: 10,
        });
        expect(Object.keys(onPoolPressure.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
            "idleConnections",
            "maxConnections",
            "totalConnections",
            "waitingRequests",
        ]);
        expect(JSON.stringify(onPoolPressure.mock.calls)).not.toContain(
            "private_query_text",
        );
        await pool.end();
    });

    it("deduplicates pool pressure, bounds counts, and contains observer failure", async () => {
        vi.useFakeTimers();
        const onPoolPressure = vi.fn();
        const pool = await PostgresPool.fromEnvironment({}, { onPoolPressure });
        const driver = latestPool();
        driver.totalCount = 10;
        driver.idleCount = 0;
        driver.waitingCount = 1;

        await pool.query("SELECT 1");
        driver.waitingCount = 2;
        await pool.query("SELECT 2");
        expect(onPoolPressure).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(30_000);
        driver.totalCount = Number.MAX_SAFE_INTEGER;
        driver.waitingCount = Number.MAX_SAFE_INTEGER;
        driver.options.max = Number.MAX_SAFE_INTEGER;
        await pool.query("SELECT 3");
        expect(onPoolPressure).toHaveBeenCalledTimes(2);
        expect(onPoolPressure).toHaveBeenLastCalledWith({
            totalConnections: 10_000,
            idleConnections: 0,
            waitingRequests: 10_000,
            maxConnections: 10_000,
        });
        await pool.end();

        const failing = await PostgresPool.fromEnvironment({}, {
            onPoolPressure: async () => {
                throw new Error("sink contains private database detail");
            },
        });
        const failingDriver = latestPool();
        failingDriver.totalCount = 10;
        failingDriver.idleCount = 0;
        failingDriver.waitingCount = 1;
        await expect(failing.query("SELECT 4")).resolves.toEqual({
            rows: [],
            rowCount: 0,
        });
        await failing.end();
    });
});

function latestPool(): CapturedPool {
    const pool = capturedPools.at(-1);
    if (pool === undefined) throw new Error("PostgreSQL pool was not constructed");
    return pool;
}
