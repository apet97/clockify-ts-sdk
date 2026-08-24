import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface PoolHooks {
    onIdleClientError: () => void;
    onPoolPressure: (pressure: {
        totalConnections: number;
        idleConnections: number;
        waitingRequests: number;
        maxConnections: number;
    }) => void;
}

type RequestListener = (request: RequestFixture, response: ResponseFixture) => void;
type EventListener = (...args: unknown[]) => void;

interface RequestFixture {
    method?: string;
    url?: string;
    headers: Readonly<Record<string, string>>;
    pause: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array>;
}

interface ResponseFixture {
    destroyed: boolean;
    writeHead: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
    assertKeyCoverage: vi.fn(async (): Promise<void> => undefined),
    assertReadable: vi.fn(async (): Promise<void> => undefined),
    createContextResolver: vi.fn(),
    createHandler: vi.fn(),
    createServer: vi.fn<(listener: unknown) => unknown>(),
    createVerifier: vi.fn(),
    fromEnvironment: vi.fn(),
    loadKeyringFile: vi.fn(),
    migrateDatabase: vi.fn(async (): Promise<readonly string[]> => []),
    nodeHandler: vi.fn(async (): Promise<void> => undefined),
    poolEnd: vi.fn(async (): Promise<void> => undefined),
    pruneExpiredConfirmations: vi.fn(async (): Promise<number> => 0),
    serviceClose: vi.fn(async (): Promise<void> => undefined),
    serviceSetReady: vi.fn(),
    toNodeHandler: vi.fn(),
    verifyDatabaseMigrations: vi.fn(async (): Promise<void> => undefined),
}));

vi.mock("node:http", () => ({ createServer: mocks.createServer }));

vi.mock("../src/remote/postgres.js", () => ({
    PostgresPool: { fromEnvironment: mocks.fromEnvironment },
}));

vi.mock("../src/remote/crypto.js", () => ({
    loadKeyringFile: mocks.loadKeyringFile,
}));

vi.mock("../src/remote/encryption.js", () => ({
    PostgresEncryptionService: class {
        assertKeyCoverage = mocks.assertKeyCoverage;
        assertReadable = mocks.assertReadable;
    },
}));

vi.mock("../src/remote/auth.js", () => ({
    HybridClockifyTokenVerifier: { create: mocks.createVerifier },
}));

vi.mock("../src/remote/context.js", () => ({
    createPostgresContextResolver: mocks.createContextResolver,
}));

vi.mock("../src/http.js", () => ({
    createClockifyMcpHttpHandler: mocks.createHandler,
    toClockifyMcpNodeHandler: mocks.toNodeHandler,
}));

vi.mock("../src/remote/migrations.js", () => ({
    migrateDatabase: mocks.migrateDatabase,
    verifyDatabaseMigrations: mocks.verifyDatabaseMigrations,
}));

vi.mock("../src/remote/confirmations.js", () => ({
    pruneExpiredConfirmations: mocks.pruneExpiredConfirmations,
}));

import { main } from "../src/http-main.js";

const BASE_ENV: NodeJS.ProcessEnv = {
    CLOCKIFY_MCP_PUBLIC_URL: "https://mcp.example/mcp",
    CLOCKIFY_MCP_OAUTH_ISSUER: "https://issuer.example/",
    CLOCKIFY_MCP_OAUTH_JWKS_URL: "https://issuer.example/jwks",
    CLOCKIFY_MCP_OAUTH_AUTHORIZATION_ENDPOINT: "https://issuer.example/authorize",
    CLOCKIFY_MCP_OAUTH_TOKEN_ENDPOINT: "https://issuer.example/token",
    CLOCKIFY_MCP_OAUTH_INTROSPECTION_URL: "https://issuer.example/introspect",
    CLOCKIFY_MCP_OAUTH_JWT_ALGORITHMS: "RS256,ES256,RS256",
    CLOCKIFY_MCP_OAUTH_CLIENT_ID: "clockify-mcp",
    CLOCKIFY_MCP_OAUTH_CLIENT_SECRET_FILE: "/fixture/oauth-secret",
    CLOCKIFY_MCP_KEYRING_FILE: "/fixture/keyring",
    CLOCKIFY_MCP_BIND_HOST: "127.0.0.2",
    CLOCKIFY_MCP_PORT: "43123",
    CLOCKIFY_MCP_CLOCKIFY_TIMEOUT_SECONDS: "42",
    CLOCKIFY_MCP_MAX_CONCURRENT_REQUESTS: "17",
};

describe("remote HTTP binary lifecycle", () => {
    let stderr: ReturnType<typeof vi.spyOn>;
    let stdout: ReturnType<typeof vi.spyOn>;
    let fakeServer: ReturnType<typeof createFakeServer>;
    let poolHooks: PoolHooks | undefined;
    let requestListener: RequestListener | undefined;
    let previousExitCode: number | string | null | undefined;
    let originalSigtermListeners: Set<NodeJS.SignalsListener>;
    let originalSigintListeners: Set<NodeJS.SignalsListener>;

    beforeEach(() => {
        vi.clearAllMocks();
        previousExitCode = process.exitCode;
        process.exitCode = undefined;
        originalSigtermListeners = new Set(process.listeners("SIGTERM"));
        originalSigintListeners = new Set(process.listeners("SIGINT"));
        fakeServer = createFakeServer();
        poolHooks = undefined;
        requestListener = undefined;
        mocks.createServer.mockImplementation((listener) => {
            requestListener = listener as RequestListener;
            return fakeServer.server;
        });
        mocks.fromEnvironment.mockImplementation(
            async (_env: NodeJS.ProcessEnv, hooks: PoolHooks) => {
                poolHooks = hooks;
                return { end: mocks.poolEnd };
            },
        );
        mocks.loadKeyringFile.mockResolvedValue({ activeId: "key-1" });
        mocks.createVerifier.mockResolvedValue({ verify: vi.fn() });
        mocks.createContextResolver.mockReturnValue(vi.fn());
        mocks.createHandler.mockReturnValue({
            setReady: mocks.serviceSetReady,
            close: mocks.serviceClose,
        });
        mocks.toNodeHandler.mockReturnValue(mocks.nodeHandler);
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    });

    afterEach(() => {
        removeAddedListeners("SIGTERM", originalSigtermListeners);
        removeAddedListeners("SIGINT", originalSigintListeners);
        process.exitCode = previousExitCode;
        stdout.mockRestore();
        stderr.mockRestore();
    });

    it("starts in apply mode, bounds requests, reports dependencies, and drains on signal", async () => {
        await expect(main([], BASE_ENV)).resolves.toBe(0);

        expect(mocks.fromEnvironment).toHaveBeenCalledWith(BASE_ENV, {
            onIdleClientError: expect.any(Function),
            onPoolPressure: expect.any(Function),
        });
        expect(mocks.loadKeyringFile).toHaveBeenCalledWith("/fixture/keyring");
        expect(mocks.createVerifier).toHaveBeenCalledWith({
            issuer: "https://issuer.example/",
            resource: new URL("https://mcp.example/mcp"),
            jwt: {
                jwksUrl: new URL("https://issuer.example/jwks"),
                algorithms: ["RS256", "ES256"],
            },
            opaque: {
                introspectionUrl: new URL("https://issuer.example/introspect"),
                clientId: "clockify-mcp",
                clientSecretFile: "/fixture/oauth-secret",
            },
        });
        expect(mocks.createContextResolver).toHaveBeenCalledWith({
            pool: { end: mocks.poolEnd },
            keyring: { activeId: "key-1" },
            issuer: "https://issuer.example/",
            clockifyTimeoutSeconds: 42,
        });
        expect(mocks.createHandler).toHaveBeenCalledWith(
            expect.objectContaining({
                publicUrl: new URL("https://mcp.example/mcp"),
                hostAllowlist: ["mcp.example"],
                originAllowlist: [],
                trustedIssuer: "https://issuer.example/",
                maxConcurrentMcpRequests: 17,
            }),
        );
        expect(mocks.toNodeHandler).toHaveBeenCalledWith(
            expect.any(Object),
            expect.any(Function),
            undefined,
            17,
        );
        expect(fakeServer.listen).toHaveBeenCalledWith(
            43_123,
            "127.0.0.2",
            expect.any(Function),
        );
        expect(fakeServer.server).toEqual(
            expect.objectContaining({
                requestTimeout: 30_000,
                headersTimeout: 15_000,
                keepAliveTimeout: 5_000,
                maxHeadersCount: 100,
                maxRequestsPerSocket: 1_000,
            }),
        );
        expect(mocks.migrateDatabase).toHaveBeenCalledWith({ end: mocks.poolEnd });
        expect(mocks.verifyDatabaseMigrations).not.toHaveBeenCalled();
        expect(mocks.assertReadable).toHaveBeenCalledOnce();
        expect(mocks.serviceSetReady).toHaveBeenLastCalledWith(true);
        expect(jsonLines(stderr).slice(0, 4)).toEqual([
            { event: "service_lifecycle", phase: "starting" },
            { event: "service_lifecycle", phase: "migrating" },
            { event: "service_lifecycle", phase: "validating_encryption" },
            { event: "service_lifecycle", phase: "ready" },
        ]);

        poolHooks?.onIdleClientError();
        poolHooks?.onPoolPressure({
            totalConnections: 10,
            idleConnections: 1,
            waitingRequests: 4,
            maxConnections: 10,
        });
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_dependency",
            dependency: "postgresql",
            outcome: "idle_client_error",
        });
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_dependency",
            dependency: "postgresql",
            outcome: "pool_pressure",
            totalConnections: 10,
            idleConnections: 1,
            waitingRequests: 4,
            maxConnections: 10,
        });

        await exerciseRequestBoundary(requestListener, mocks.nodeHandler);
        expect(mocks.nodeHandler).toHaveBeenCalledOnce();

        process.emit("SIGTERM");
        await vi.waitFor(() => expect(mocks.poolEnd).toHaveBeenCalledOnce());

        expect(mocks.serviceSetReady).toHaveBeenLastCalledWith(false);
        expect(fakeServer.closeIdleConnections).toHaveBeenCalledOnce();
        expect(fakeServer.close).toHaveBeenCalledOnce();
        expect(fakeServer.closeAllConnections).toHaveBeenCalledOnce();
        expect(mocks.serviceClose).toHaveBeenCalledOnce();
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "draining",
            reason: "signal",
        });
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "stopped",
            reason: "signal",
        });
    });

    it("verifies migrations and performs bounded cleanup after a runtime server error", async () => {
        await expect(
            main([], { ...BASE_ENV, CLOCKIFY_MCP_MIGRATION_MODE: "verify" }),
        ).resolves.toBe(0);

        expect(mocks.migrateDatabase).not.toHaveBeenCalled();
        expect(mocks.verifyDatabaseMigrations).toHaveBeenCalledWith({
            end: mocks.poolEnd,
        });
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "verifying_migrations",
        });

        fakeServer.runtimeError?.(new Error("runtime fixture secret"));
        await vi.waitFor(() => expect(mocks.poolEnd).toHaveBeenCalledOnce());

        expect(process.exitCode).toBe(1);
        expect(jsonLines(stderr)).toContainEqual({
            event: "service_lifecycle",
            phase: "fatal",
            reason: "runtime",
            failure: "runtime_failure",
        });
        expect(written(stderr)).not.toContain("runtime fixture secret");
        expect(mocks.serviceClose).toHaveBeenCalledOnce();
    });

    it("sanitizes secret-loading failure and closes the initialized pool", async () => {
        const secret = "keyring-path-secret-that-must-not-leak";
        mocks.loadKeyringFile.mockRejectedValue(new Error(secret));

        await expect(main([], BASE_ENV)).resolves.toBe(1);

        expect(mocks.poolEnd).toHaveBeenCalledOnce();
        expect(mocks.createVerifier).not.toHaveBeenCalled();
        expect(jsonLines(stderr)).toEqual([
            { event: "service_lifecycle", phase: "starting" },
            {
                event: "service_lifecycle",
                phase: "fatal",
                reason: "runtime",
                failure: "secret_loading_failed",
            },
            {
                event: "service_lifecycle",
                phase: "draining",
                reason: "runtime",
            },
            {
                event: "service_lifecycle",
                phase: "stopped",
                reason: "runtime",
            },
        ]);
        expect(written(stderr)).not.toContain(secret);
    });
});

function createFakeServer(): {
    server: Record<string, unknown>;
    listen: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    closeIdleConnections: ReturnType<typeof vi.fn>;
    closeAllConnections: ReturnType<typeof vi.fn>;
    runtimeError?: EventListener;
} {
    let listeningError: EventListener | undefined;
    const fixture: ReturnType<typeof createFakeServer> = {
        server: {},
        listen: vi.fn(),
        close: vi.fn(),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
    };
    const server = {
        requestTimeout: 0,
        headersTimeout: 0,
        keepAliveTimeout: 0,
        maxHeadersCount: 0,
        maxRequestsPerSocket: 0,
        once: vi.fn((event: string, listener: EventListener) => {
            if (event === "error") listeningError = listener;
            return server;
        }),
        off: vi.fn((event: string, listener: EventListener) => {
            if (event === "error" && listeningError === listener) {
                listeningError = undefined;
            }
            return server;
        }),
        listen: fixture.listen.mockImplementation(
            (_port: number, _host: string, callback: () => void) => {
                callback();
                return server;
            },
        ),
        on: vi.fn((event: string, listener: EventListener) => {
            if (event === "error") fixture.runtimeError = listener;
            return server;
        }),
        closeIdleConnections: fixture.closeIdleConnections,
        close: fixture.close.mockImplementation((callback: () => void) => {
            callback();
            return server;
        }),
        closeAllConnections: fixture.closeAllConnections,
    };
    fixture.server = server;
    return fixture;
}

async function exerciseRequestBoundary(
    listener: RequestListener | undefined,
    nodeHandler: typeof mocks.nodeHandler,
): Promise<void> {
    if (!listener) throw new Error("HTTP request listener was not registered");
    const invalidResponse = responseFixture();
    listener(requestFixture(), invalidResponse);
    expect(invalidResponse.writeHead).toHaveBeenCalledWith(400, {
        "content-type": "application/json",
    });
    expect(invalidResponse.end).toHaveBeenCalledWith(
        JSON.stringify({ error: "invalid_request" }),
    );

    const request = requestFixture("POST");
    const response = responseFixture();
    nodeHandler.mockRejectedValueOnce(new Error("adapter fixture secret"));
    listener(request, response);
    await vi.waitFor(() => {
        expect(response.writeHead).toHaveBeenCalledWith(500, {
            "cache-control": "no-store",
            "content-type": "application/json",
        });
        expect(response.end).toHaveBeenCalledWith(
            JSON.stringify({ error: "internal_server_error" }),
        );
        expect(request.destroy).toHaveBeenCalledOnce();
    });
}

function requestFixture(method?: string): RequestFixture {
    const request: RequestFixture = {
        ...(method === undefined ? {} : { method }),
        url: "/mcp",
        headers: {},
        pause: vi.fn(),
        destroy: vi.fn(),
        [Symbol.asyncIterator]: () => emptyIterator(),
    };
    return request;
}

async function* emptyIterator(): AsyncGenerator<Uint8Array> {}

function responseFixture(): ResponseFixture {
    return {
        destroyed: false,
        writeHead: vi.fn(),
        end: vi.fn(),
    };
}

function removeAddedListeners(
    signal: "SIGTERM" | "SIGINT",
    originals: ReadonlySet<NodeJS.SignalsListener>,
): void {
    for (const listener of process.listeners(signal)) {
        if (!originals.has(listener)) process.removeListener(signal, listener);
    }
}

function written(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
    return spy.mock.calls.map((call) => String(call[0])).join("");
}

function jsonLines(spy: { mock: { calls: readonly (readonly unknown[])[] } }): unknown[] {
    return written(spy)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
}
