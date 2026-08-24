#!/usr/bin/env node
import { createServer, type Server } from "node:http";
import { parseArgs } from "node:util";

import type { OAuthMetadata } from "@modelcontextprotocol/server";

import { resolvesToModule } from "./direct-invocation.js";
import { requireExactHttpsUrl } from "./http-url.js";
import {
    createClockifyMcpHttpHandler,
    toClockifyMcpNodeHandler,
} from "./http.js";
import { HybridClockifyTokenVerifier } from "./remote/auth.js";
import { pruneExpiredConfirmations } from "./remote/confirmations.js";
import { createPostgresContextResolver } from "./remote/context.js";
import { loadKeyringFile } from "./remote/crypto.js";
import { PostgresEncryptionService } from "./remote/encryption.js";
import {
    migrateDatabase,
    verifyDatabaseMigrations,
} from "./remote/migrations.js";
import {
    PostgresPool,
    type PostgresPoolPressure,
} from "./remote/postgres.js";
import { REMOTE_SCOPES } from "./remote/types.js";

const HELP = `clockify115-mcp-http

Authenticated stateless Clockify MCP HTTP service.

Options:
  --help    Show this help and exit.

Configuration is file/environment based. The service binds to
CLOCKIFY_MCP_BIND_HOST (default 127.0.0.1) and CLOCKIFY_MCP_PORT (default 3000).
`;

const SHUTDOWN_DEADLINE_MS = 25_000;
const EXPIRED_CONFIRMATION_CLEANUP_MS = 60_000;

interface LifecycleLog {
    event: "service_lifecycle";
    phase:
        | "starting"
        | "migrating"
        | "verifying_migrations"
        | "validating_encryption"
        | "ready"
        | "draining"
        | "stopped"
        | "fatal";
    reason?: "signal" | "configuration" | "runtime";
    failure?: LifecycleFailure;
}

type ShutdownReason = "signal" | "configuration" | "runtime";
type StartupStage =
    | "configuration"
    | "postgresql"
    | "secrets"
    | "oauth"
    | "listener"
    | "migration_apply"
    | "migration_verify"
    | "encryption"
    | "runtime";
type LifecycleFailure =
    | "invalid_configuration"
    | "postgresql_initialization_failed"
    | "secret_loading_failed"
    | "oauth_initialization_failed"
    | "listener_initialization_failed"
    | "migration_apply_failed"
    | "migration_verification_failed"
    | "encryption_validation_failed"
    | "runtime_failure"
    | "shutdown_failed"
    | "shutdown_timeout";

type DependencyLog =
    | {
          event: "service_dependency";
          dependency: "postgresql";
          outcome: "idle_client_error";
      }
    | ({
          event: "service_dependency";
          dependency: "postgresql";
          outcome: "pool_pressure";
      } & PostgresPoolPressure);

interface MaintenanceLog {
    event: "service_maintenance";
    operation: "expired_confirmation_cleanup";
    outcome: "completed" | "failed";
    rows?: number;
}

export async function main(
    argv: readonly string[] = process.argv.slice(2),
    env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    let pool: PostgresPool | undefined;
    let service: ReturnType<typeof createClockifyMcpHttpHandler> | undefined;
    let server: Server | undefined;
    let confirmationCleanup: ReturnType<typeof setInterval> | undefined;
    let shuttingDown = false;
    let shutdownPromise: Promise<void> | undefined;
    let shutdownDeadline: ReturnType<typeof setTimeout> | undefined;
    let requestedExitCode = 0;
    let shutdownFailureLogged = false;
    let lifecycleStarted = false;
    let startupStage: StartupStage = "configuration";
    const shutdown = (reason: ShutdownReason): Promise<void> => {
        if (shutdownPromise !== undefined) return shutdownPromise;
        shuttingDown = true;
        shutdownPromise = (async () => {
            if (lifecycleStarted) {
                writeLifecycle({ event: "service_lifecycle", phase: "draining", reason });
            }
            service?.setReady(false);
            if (confirmationCleanup !== undefined) {
                clearInterval(confirmationCleanup);
                confirmationCleanup = undefined;
            }
            let failure: unknown;
            try {
                if (server) await closeServer(server);
            } catch (error) {
                failure = error;
            }
            try {
                await service?.close();
            } catch (error) {
                failure ??= error;
            }
            try {
                await pool?.end();
            } catch (error) {
                failure ??= error;
            }
            if (lifecycleStarted) {
                writeLifecycle({ event: "service_lifecycle", phase: "stopped", reason });
            }
            if (failure !== undefined) {
                throw failure instanceof Error
                    ? failure
                    : new Error("remote service shutdown failed", { cause: failure });
            }
        })();
        return shutdownPromise;
    };

    try {
        const parsed = parseArgs({
            args: [...argv],
            options: { help: { type: "boolean", short: "h" } },
            strict: true,
            allowPositionals: false,
        });
        if (parsed.values.help) {
            process.stdout.write(HELP);
            return 0;
        }
        rejectLocalCredentialEnvironment(env);
        lifecycleStarted = true;
        writeLifecycle({ event: "service_lifecycle", phase: "starting" });

        const config = requireServiceConfig(env);
        startupStage = "postgresql";
        const databasePool = await PostgresPool.fromEnvironment(env, {
            onIdleClientError: () => {
                writeOperational({
                    event: "service_dependency",
                    dependency: "postgresql",
                    outcome: "idle_client_error",
                });
            },
            onPoolPressure: (pressure) => {
                writeOperational({
                    event: "service_dependency",
                    dependency: "postgresql",
                    outcome: "pool_pressure",
                    ...pressure,
                });
            },
        });
        pool = databasePool;
        startupStage = "secrets";
        const keyring = await loadKeyringFile(config.keyringFile);
        const encryption = new PostgresEncryptionService(databasePool, keyring);
        startupStage = "oauth";
        const verifier = await HybridClockifyTokenVerifier.create({
            issuer: config.issuer,
            resource: config.publicUrl,
            jwt: {
                jwksUrl: config.jwksUrl,
                algorithms: config.jwtAlgorithms,
            },
            opaque: {
                introspectionUrl: config.introspectionUrl,
                clientId: config.oauthClientId,
                clientSecretFile: config.oauthClientSecretFile,
            },
        });
        const resolveContext = createPostgresContextResolver({
            pool: databasePool,
            keyring,
            issuer: config.issuer,
            clockifyTimeoutSeconds: config.clockifyTimeoutSeconds,
        });
        service = createClockifyMcpHttpHandler({
            verifier,
            resolveContext,
            publicUrl: config.publicUrl,
            hostAllowlist: config.hostAllowlist,
            originAllowlist: config.originAllowlist,
            oauthMetadata: config.oauthMetadata,
            trustedIssuer: config.issuer,
            readiness: async () => {
                await encryption.assertKeyCoverage();
                return true;
            },
            maxConcurrentMcpRequests: config.maxConcurrentMcpRequests,
        });
        startupStage = "listener";
        const nodeHandler = toClockifyMcpNodeHandler(
            service,
            () => {
                // Adapter failures are represented by its generic 500 response.
            },
            undefined,
            config.maxConcurrentMcpRequests,
        );
        server = createServer((request, response) => {
            const method = request.method;
            if (method === undefined) {
                response.writeHead(400, { "content-type": "application/json" });
                response.end(JSON.stringify({ error: "invalid_request" }));
                return;
            }
            const boundedRequest = {
                method,
                ...(request.url === undefined ? {} : { url: request.url }),
                headers: request.headers,
                pause: () => request.pause(),
                destroy: () => request.destroy(),
                [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
            };
            void nodeHandler(boundedRequest, response).catch(() => {
                if (!response.destroyed) {
                    try {
                        response.writeHead(500, {
                            "cache-control": "no-store",
                            "content-type": "application/json",
                        });
                        response.end(JSON.stringify({ error: "internal_server_error" }));
                    } catch {
                        // The peer may have already closed the socket.
                    }
                }
                request.destroy();
            });
        });
        configureNodeServer(server);
        await listen(server, config.port, config.bindHost);
        server.on("error", () => {
            if (shuttingDown) return;
            writeLifecycle({
                event: "service_lifecycle",
                phase: "fatal",
                reason: "runtime",
                failure: "runtime_failure",
            });
            beginBoundedShutdown("runtime", 1);
        });

        const onSignal = (): void => {
            beginBoundedShutdown("signal", 0);
        };
        process.once("SIGTERM", onSignal);
        process.once("SIGINT", onSignal);

        if (config.migrationMode === "apply") {
            startupStage = "migration_apply";
            writeLifecycle({ event: "service_lifecycle", phase: "migrating" });
            await migrateDatabase(databasePool);
        } else {
            startupStage = "migration_verify";
            writeLifecycle({
                event: "service_lifecycle",
                phase: "verifying_migrations",
            });
            await verifyDatabaseMigrations(databasePool);
        }
        if (shutdownWasRequested()) return requestedExitCode;
        writeLifecycle({
            event: "service_lifecycle",
            phase: "validating_encryption",
        });
        startupStage = "encryption";
        await encryption.assertReadable();
        if (shutdownWasRequested()) return requestedExitCode;
        service.setReady(true);
        confirmationCleanup = startConfirmationCleanup(databasePool);
        startupStage = "runtime";
        writeLifecycle({ event: "service_lifecycle", phase: "ready" });
        return 0;
    } catch (error) {
        const reason = error instanceof TypeError ? "configuration" : "runtime";
        requestedExitCode = Math.max(
            requestedExitCode,
            isParseArgsError(error) ? 2 : 1,
        );
        writeLifecycle({
            event: "service_lifecycle",
            phase: "fatal",
            reason,
            failure: failureForStartupStage(startupStage),
        });
        try {
            await shutdown(reason);
        } catch {
            logShutdownFailure();
            requestedExitCode = Math.max(requestedExitCode, 1);
        }
        return requestedExitCode;
    }

    function shutdownWasRequested(): boolean {
        return shuttingDown;
    }

    function beginBoundedShutdown(
        reason: Exclude<ShutdownReason, "configuration">,
        successCode: number,
    ): void {
        requestedExitCode = Math.max(requestedExitCode, successCode);
        shutdownDeadline ??= setTimeout(() => {
            writeLifecycle({
                event: "service_lifecycle",
                phase: "fatal",
                reason: "runtime",
                failure: "shutdown_timeout",
            });
            process.exit(1);
        }, SHUTDOWN_DEADLINE_MS);
        void shutdown(reason).then(
            () => {
                clearShutdownDeadline();
                setProcessExitCodeAtLeast(requestedExitCode);
            },
            () => {
                clearShutdownDeadline();
                requestedExitCode = Math.max(requestedExitCode, 1);
                setProcessExitCodeAtLeast(requestedExitCode);
                logShutdownFailure();
            },
        );
    }

    function clearShutdownDeadline(): void {
        if (shutdownDeadline === undefined) return;
        clearTimeout(shutdownDeadline);
        shutdownDeadline = undefined;
    }

    function logShutdownFailure(): void {
        if (shutdownFailureLogged) return;
        shutdownFailureLogged = true;
        writeLifecycle({
            event: "service_lifecycle",
            phase: "fatal",
            reason: "runtime",
            failure: "shutdown_failed",
        });
    }
}

function failureForStartupStage(stage: StartupStage): LifecycleFailure {
    const failures: Record<StartupStage, LifecycleFailure> = {
        configuration: "invalid_configuration",
        postgresql: "postgresql_initialization_failed",
        secrets: "secret_loading_failed",
        oauth: "oauth_initialization_failed",
        listener: "listener_initialization_failed",
        migration_apply: "migration_apply_failed",
        migration_verify: "migration_verification_failed",
        encryption: "encryption_validation_failed",
        runtime: "runtime_failure",
    };
    return failures[stage];
}

interface ServiceConfig {
    publicUrl: URL;
    issuer: string;
    jwksUrl: URL;
    jwtAlgorithms: readonly string[];
    introspectionUrl: URL;
    oauthClientId: string;
    oauthClientSecretFile: string;
    keyringFile: string;
    hostAllowlist: readonly string[];
    originAllowlist: readonly string[];
    oauthMetadata: OAuthMetadata;
    bindHost: string;
    port: number;
    migrationMode: "apply" | "verify";
    clockifyTimeoutSeconds: number;
    maxConcurrentMcpRequests: number;
}

function requireServiceConfig(env: NodeJS.ProcessEnv): ServiceConfig {
    const publicUrl = new URL(required(env, "CLOCKIFY_MCP_PUBLIC_URL"));
    const issuer = required(env, "CLOCKIFY_MCP_OAUTH_ISSUER");
    const jwksUrl = new URL(required(env, "CLOCKIFY_MCP_OAUTH_JWKS_URL"));
    const authorizationEndpoint = requireExactHttpsUrl(
        required(env, "CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT"),
        "OAuth authorization endpoint",
    ).href;
    const tokenEndpoint = requireExactHttpsUrl(
        required(env, "CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT"),
        "OAuth token endpoint",
    ).href;
    const jwtAlgorithms = commaList(
        required(env, "CLOCKIFY_MCP_OAUTH_JWT_ALGORITHMS"),
    );
    return {
        publicUrl,
        issuer,
        jwksUrl,
        jwtAlgorithms,
        introspectionUrl: new URL(
            required(env, "CLOCKIFY_MCP_OAUTH_INTROSPECTION_URL"),
        ),
        oauthClientId: required(env, "CLOCKIFY_MCP_OAUTH_CLIENT_ID"),
        oauthClientSecretFile: required(
            env,
            "CLOCKIFY_MCP_OAUTH_CLIENT_SECRET_FILE",
        ),
        keyringFile: required(env, "CLOCKIFY_MCP_KEYRING_FILE"),
        hostAllowlist: env.CLOCKIFY_MCP_HOST_ALLOWLIST
            ? commaList(env.CLOCKIFY_MCP_HOST_ALLOWLIST)
            : [publicUrl.host],
        originAllowlist: env.CLOCKIFY_MCP_ORIGIN_ALLOWLIST
            ? commaList(env.CLOCKIFY_MCP_ORIGIN_ALLOWLIST)
            : [],
        oauthMetadata: {
            issuer,
            authorization_endpoint: authorizationEndpoint,
            token_endpoint: tokenEndpoint,
            jwks_uri: jwksUrl.href,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            token_endpoint_auth_methods_supported: ["client_secret_basic"],
            scopes_supported: [...REMOTE_SCOPES],
        },
        bindHost: env.CLOCKIFY_MCP_BIND_HOST?.trim() || "127.0.0.1",
        port: parsePort(env.CLOCKIFY_MCP_PORT),
        migrationMode: parseMigrationMode(env.CLOCKIFY_MCP_MIGRATION_MODE),
        clockifyTimeoutSeconds: parseBoundedInteger(
            env.CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS,
            "CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS",
            180,
            1,
            600,
        ),
        maxConcurrentMcpRequests: parseBoundedInteger(
            env.CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS,
            "CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS",
            64,
            1,
            10_000,
        ),
    };
}

function rejectLocalCredentialEnvironment(env: NodeJS.ProcessEnv): void {
    for (const name of ["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"] as const) {
        if (Object.prototype.hasOwnProperty.call(env, name)) {
            throw new TypeError(
                `${name} must be absent when starting the multi-user HTTP service`,
            );
        }
    }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
    const value = env[name]?.trim();
    if (!value) throw new TypeError(`${name} is required`);
    return value;
}

function commaList(value: string): readonly string[] {
    const values = value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    if (values.length === 0) throw new TypeError("comma-separated setting is empty");
    return [...new Set(values)];
}

function parsePort(value: string | undefined): number {
    if (!value?.trim()) return 3000;
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new TypeError("CLOCKIFY_MCP_PORT must be between 1 and 65535");
    }
    return port;
}

function parseMigrationMode(value: string | undefined): "apply" | "verify" {
    const mode = value?.trim() || "apply";
    if (mode !== "apply" && mode !== "verify") {
        throw new TypeError("CLOCKIFY_MCP_MIGRATION_MODE must be apply or verify");
    }
    return mode;
}

function parseBoundedInteger(
    value: string | undefined,
    name: string,
    fallback: number,
    minimum: number,
    maximum: number,
): number {
    if (!value?.trim()) return fallback;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new TypeError(`${name} must be between ${minimum} and ${maximum}`);
    }
    return parsed;
}

function configureNodeServer(server: Server): void {
    server.requestTimeout = 30_000;
    server.headersTimeout = 15_000;
    server.keepAliveTimeout = 5_000;
    server.maxHeadersCount = 100;
    server.maxRequestsPerSocket = 1_000;
}

async function listen(server: Server, port: number, host: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });
}

async function closeServer(server: Server): Promise<void> {
    server.closeIdleConnections();
    await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve();
        };
        const timeout = setTimeout(finish, 10_000);
        timeout.unref();
        server.close(finish);
    });
    server.closeAllConnections();
}

function writeLifecycle(entry: LifecycleLog): void {
    writeOperational(entry);
}

function writeOperational(entry: LifecycleLog | DependencyLog | MaintenanceLog): void {
    try {
        process.stderr.write(`${JSON.stringify(entry)}\n`);
    } catch {
        // Lifecycle logging is best effort and never owns service state.
    }
}

function startConfirmationCleanup(pool: PostgresPool): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
        void pruneExpiredConfirmations(pool, 10_000).then(
            (rows) => {
                if (rows > 0) {
                    writeOperational({
                        event: "service_maintenance",
                        operation: "expired_confirmation_cleanup",
                        outcome: "completed",
                        rows,
                    });
                }
            },
            () => {
                writeOperational({
                    event: "service_maintenance",
                    operation: "expired_confirmation_cleanup",
                    outcome: "failed",
                });
            },
        );
    }, EXPIRED_CONFIRMATION_CLEANUP_MS);
    timer.unref();
    return timer;
}

function isParseArgsError(error: unknown): boolean {
    return (
        error instanceof TypeError &&
        "code" in error &&
        typeof error.code === "string" &&
        error.code.startsWith("ERR_PARSE_ARGS_")
    );
}

if (resolvesToModule(process.argv[1], import.meta.filename)) {
    main().then(
        (code) => {
            setProcessExitCodeAtLeast(code);
        },
        () => {
            writeLifecycle({
                event: "service_lifecycle",
                phase: "fatal",
                reason: "runtime",
                failure: "runtime_failure",
            });
            setProcessExitCodeAtLeast(1);
        },
    );
}

function setProcessExitCodeAtLeast(code: number): void {
    const current = typeof process.exitCode === "number" ? process.exitCode : 0;
    if (code > current) process.exitCode = code;
}
