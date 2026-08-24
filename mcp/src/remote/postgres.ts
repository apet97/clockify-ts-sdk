import {
    Pool,
    type PoolClient,
    type PoolConfig,
    type QueryResultRow,
} from "pg";

import { readMode600File, readMode600Secret } from "./crypto.js";
import type {
    QueryResult,
    SqlConnection,
    SqlPool,
    SqlQueryable,
} from "./types.js";

const ALLOWED_PG_ENVIRONMENT = new Set([
    "PGHOST",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSFILE",
    "PGSSLMODE",
]);
const SERVICE_OWNED_PG_ENVIRONMENT = ["PGOPTIONS", "PGREPLICATION"] as const;
const POOL_PRESSURE_DEDUPE_MS = 30_000;
const MAX_REPORTED_POOL_COUNT = 10_000;

type ServiceOwnedPoolConfig = PoolConfig & { replication: string };

interface PostgresPoolOptions {
    /** Sanitized notification only; raw driver errors never cross this boundary. */
    onIdleClientError?: () => void;
    /** Bounded pool counts only; queries, connection data, and errors are excluded. */
    onPoolPressure?: (pressure: PostgresPoolPressure) => void | Promise<void>;
}

export interface PostgresPoolPressure {
    totalConnections: number;
    idleConnections: number;
    waitingRequests: number;
    maxConnections: number;
}

class PostgresQueryable implements SqlQueryable {
    constructor(protected readonly target: Pool | PoolClient) {}

    async query<Row extends QueryResultRow & Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
    ): Promise<QueryResult<Row>> {
        const result = await this.target.query<Row>(text, values ? [...values] : undefined);
        return { rows: result.rows, rowCount: result.rowCount };
    }
}

class PostgresConnection extends PostgresQueryable implements SqlConnection {
    private released = false;

    constructor(private readonly client: PoolClient) {
        super(client);
    }

    override async query<Row extends QueryResultRow & Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
    ): Promise<QueryResult<Row>> {
        if (this.released) throw new Error("PostgreSQL connection is no longer usable");
        try {
            return await super.query<Row>(text, values);
        } catch (error) {
            if (isClientQueryTimeout(error)) {
                this.released = true;
                this.client.release(error);
            }
            throw error;
        }
    }

    release(): void {
        if (this.released) return;
        this.released = true;
        this.client.release();
    }
}

export class PostgresPool extends PostgresQueryable implements SqlPool {
    private readonly onPoolPressure: PostgresPoolOptions["onPoolPressure"];
    private lastPoolPressureAt = Number.NEGATIVE_INFINITY;

    constructor(
        private readonly pool: Pool,
        options: PostgresPoolOptions = {},
    ) {
        super(pool);
        this.onPoolPressure = options.onPoolPressure;
        this.pool.on("error", () => {
            try {
                options.onIdleClientError?.();
            } catch {
                // An observability callback never owns database availability.
            }
        });
    }

    override async query<Row extends QueryResultRow & Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
    ): Promise<QueryResult<Row>> {
        const pending = super.query<Row>(text, values);
        this.reportPoolPressure();
        return await pending;
    }

    static fromConnectionString(
        connectionString: string,
        options: PostgresPoolOptions = {},
    ): PostgresPool {
        return PostgresPool.fromConfig(postgresUrlConfig(connectionString), options);
    }

    private static fromConfig(
        config: PoolConfig,
        options: PostgresPoolOptions = {},
    ): PostgresPool {
        return new PostgresPool(new Pool(poolConfig(config)), options);
    }

    static async fromEnvironment(
        env: NodeJS.ProcessEnv = process.env,
        options: PostgresPoolOptions = {},
    ): Promise<PostgresPool> {
        if (Object.prototype.hasOwnProperty.call(env, "DATABASE_URL")) {
            throw new Error(
                "DATABASE_URL is not accepted; use CLOCKIFY_MCP_DATABASE_URL_FILE",
            );
        }
        if (Object.prototype.hasOwnProperty.call(env, "PGPASSWORD")) {
            throw new Error("PGPASSWORD is not accepted; use a mode-0600 PGPASSFILE");
        }
        const serviceOverride = SERVICE_OWNED_PG_ENVIRONMENT.find((name) =>
            Object.prototype.hasOwnProperty.call(env, name),
        );
        if (serviceOverride) {
            throw new Error(
                `${serviceOverride} is not accepted; PostgreSQL session controls are service-owned`,
            );
        }
        const unownedSettings = Object.keys(env)
            .filter(
                (name) =>
                    name.startsWith("PG") && !ALLOWED_PG_ENVIRONMENT.has(name),
            )
            .sort();
        if (unownedSettings.length > 0) {
            throw new Error(
                `unsupported PostgreSQL environment settings: ${unownedSettings.join(", ")}`,
            );
        }
        const passFile = env.PGPASSFILE?.trim();
        if (Object.prototype.hasOwnProperty.call(env, "PGPASSFILE") && !passFile) {
            throw new Error("PGPASSFILE must name a mode-0600 password file");
        }
        const caFile = env.CLOCKIFY_MCP_DATABASE_CA_FILE?.trim();
        if (
            Object.prototype.hasOwnProperty.call(env, "CLOCKIFY_MCP_DATABASE_CA_FILE") &&
            !caFile
        ) {
            throw new Error("CLOCKIFY_MCP_DATABASE_CA_FILE must name a mode-0600 CA file");
        }
        const ca = caFile
            ? (await readMode600File(caFile, "PostgreSQL CA", 256 * 1024)).toString(
                  "utf8",
              )
            : undefined;
        const urlFile = env.CLOCKIFY_MCP_DATABASE_URL_FILE?.trim();
        if (
            Object.prototype.hasOwnProperty.call(
                env,
                "CLOCKIFY_MCP_DATABASE_URL_FILE",
            ) &&
            !urlFile
        ) {
            throw new Error(
                "CLOCKIFY_MCP_DATABASE_URL_FILE must name a mode-0600 URL file",
            );
        }
        if (urlFile) {
            const conflicting = [
                "PGHOST",
                "PGPORT",
                "PGDATABASE",
                "PGUSER",
                "PGPASSFILE",
                "PGSSLMODE",
            ].filter((name) => Object.prototype.hasOwnProperty.call(env, name));
            if (conflicting.length > 0) {
                throw new Error(
                    "CLOCKIFY_MCP_DATABASE_URL_FILE cannot be combined with PG* connection settings",
                );
            }
            const connectionString = await readMode600Secret(
                urlFile,
                "PostgreSQL connection URL",
                16 * 1024,
            );
            return PostgresPool.fromConfig(
                postgresUrlConfig(connectionString, ca),
                options,
            );
        }

        const host = env.PGHOST?.trim() || "127.0.0.1";
        const port = parsePort(env.PGPORT) ?? 5432;
        const user = env.PGUSER?.trim() || env.USER?.trim();
        const database = env.PGDATABASE?.trim() || user;
        const password = passFile
            ? await passwordFromPgPass(passFile, { host, port, user, database })
            : undefined;
        const ssl = parseSslMode(env.PGSSLMODE, ca);
        return PostgresPool.fromConfig({
            host,
            port,
            ...(database === undefined ? {} : { database }),
            ...(user === undefined ? {} : { user }),
            ...(password === undefined ? {} : { password }),
            ...(ssl === undefined ? {} : { ssl }),
        }, options);
    }

    async connect(): Promise<SqlConnection> {
        const pending = this.pool.connect();
        this.reportPoolPressure();
        return new PostgresConnection(await pending);
    }

    async end(): Promise<void> {
        await this.pool.end();
    }

    private reportPoolPressure(): void {
        if (this.onPoolPressure === undefined) return;
        const pressure = poolPressure(this.pool);
        if (pressure === undefined) return;
        const now = performance.now();
        if (now - this.lastPoolPressureAt < POOL_PRESSURE_DEDUPE_MS) return;
        this.lastPoolPressureAt = now;
        try {
            const pending = this.onPoolPressure(pressure);
            if (pending !== undefined) void pending.catch(() => {});
        } catch {
            // An observability callback never owns database availability.
        }
    }
}

function poolPressure(pool: Pool): PostgresPoolPressure | undefined {
    const saturated = pool.totalCount >= pool.options.max && pool.idleCount === 0;
    if (!saturated && pool.waitingCount <= 0) return undefined;
    const maxConnections = boundedPoolCount(pool.options.max, 1);
    const totalConnections = boundedPoolCount(pool.totalCount);
    const idleConnections = boundedPoolCount(pool.idleCount);
    const waitingRequests = boundedPoolCount(pool.waitingCount);
    return {
        totalConnections,
        idleConnections,
        waitingRequests,
        maxConnections,
    };
}

function boundedPoolCount(value: number, minimum = 0): number {
    if (!Number.isFinite(value)) return minimum;
    return Math.min(
        MAX_REPORTED_POOL_COUNT,
        Math.max(minimum, Math.trunc(value)),
    );
}

function poolConfig(config: PoolConfig): ServiceOwnedPoolConfig {
    return {
        ...config,
        application_name: "clockify115-mcp",
        client_encoding: "UTF8",
        options: "-c search_path=public",
        replication: "false",
        sslnegotiation: "postgres",
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
        statement_timeout: 8_000,
        lock_timeout: 3_000,
        idle_in_transaction_session_timeout: 10_000,
    };
}

function postgresUrlConfig(value: string, ca?: string): PoolConfig {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("PostgreSQL connection URL is invalid");
    }
    if (
        (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
        url.hash
    ) {
        throw new Error("PostgreSQL connection URL must use postgres or postgresql");
    }
    for (const name of url.searchParams.keys()) {
        const normalized = name.toLowerCase();
        if (normalized === "sslmode" && name !== "sslmode") {
            throw new Error("PostgreSQL connection URL sslmode must be lowercase");
        }
        if (normalized !== "sslmode") {
            throw new Error(
                `PostgreSQL connection URL must not set ${name}; connection policy is service-owned`,
            );
        }
    }
    const sslModes = url.searchParams.getAll("sslmode");
    if (sslModes.length > 1) {
        throw new Error("PostgreSQL connection URL must set sslmode at most once");
    }
    const sslMode = sslModes[0];
    const ssl = parseSslMode(sslMode ?? undefined, ca);
    url.searchParams.delete("sslmode");
    return {
        connectionString: url.href,
        ...(ssl === undefined ? {} : { ssl }),
    };
}

function parsePort(value: string | undefined): number | undefined {
    if (!value?.trim()) return undefined;
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new Error("PGPORT must be an integer between 1 and 65535");
    }
    return port;
}

function parseSslMode(
    value: string | undefined,
    ca?: string,
): PoolConfig["ssl"] | undefined {
    if (value === undefined) {
        if (ca !== undefined) {
            throw new Error("PostgreSQL CA requires PGSSLMODE=verify-full");
        }
        return undefined;
    }
    const mode = value.trim();
    if (ca !== undefined && mode !== "verify-full") {
        throw new Error("PostgreSQL CA requires PGSSLMODE=verify-full");
    }
    switch (mode) {
        case "disable":
            return false;
        case "require":
            return { rejectUnauthorized: false };
        case "verify-full":
            return {
                rejectUnauthorized: true,
                ...(ca === undefined ? {} : { ca }),
            };
        default:
            throw new Error(
                "PGSSLMODE must be disable, require, or verify-full",
            );
    }
}

interface PgPassTarget {
    host: string;
    port: number;
    user: string | undefined;
    database: string | undefined;
}

async function passwordFromPgPass(
    path: string,
    target: PgPassTarget,
): Promise<string> {
    if (!target.user || !target.database) {
        throw new Error("PGPASSFILE requires PGUSER and PGDATABASE (or USER defaults)");
    }
    const contents = await readMode600File(path, "PostgreSQL password", 64 * 1024);
    const text = contents.toString("utf8");
    if (text.includes("\0")) throw new Error("PGPASSFILE contains invalid data");
    for (const line of text.split(/\r?\n/u)) {
        if (!line || line.startsWith("#")) continue;
        const fields = splitPgPassLine(line);
        if (
            pgPassFieldMatches(fields.host, target.host) &&
            pgPassFieldMatches(fields.port, target.port.toString()) &&
            pgPassFieldMatches(fields.database, target.database) &&
            pgPassFieldMatches(fields.user, target.user)
        ) {
            const password = fields.password;
            if (!password) throw new Error("matching PGPASSFILE password is empty");
            return password;
        }
    }
    throw new Error("PGPASSFILE has no entry matching the configured database");
}

interface PgPassEntry {
    host: string;
    port: string;
    database: string;
    user: string;
    password: string;
}

function splitPgPassLine(line: string): PgPassEntry {
    const fields = [""];
    let escaped = false;
    for (const character of line) {
        if (escaped) {
            appendPgPassCharacter(fields, character);
            escaped = false;
        } else if (character === "\\") {
            escaped = true;
        } else if (character === ":") {
            fields.push("");
        } else {
            appendPgPassCharacter(fields, character);
        }
    }
    if (escaped || fields.length !== 5) {
        throw new Error("PGPASSFILE contains a malformed entry");
    }
    return {
        host: requirePgPassField(fields, 0),
        port: requirePgPassField(fields, 1),
        database: requirePgPassField(fields, 2),
        user: requirePgPassField(fields, 3),
        password: requirePgPassField(fields, 4),
    };
}

function appendPgPassCharacter(fields: string[], character: string): void {
    const index = fields.length - 1;
    fields[index] = requirePgPassField(fields, index) + character;
}

function requirePgPassField(fields: readonly string[], index: number): string {
    const field = fields[index];
    if (field === undefined) throw new Error("PGPASSFILE contains a malformed entry");
    return field;
}

function pgPassFieldMatches(pattern: string, value: string): boolean {
    return pattern === "*" || pattern === value;
}

function isClientQueryTimeout(error: unknown): error is Error {
    return error instanceof Error && error.message === "Query read timeout";
}
