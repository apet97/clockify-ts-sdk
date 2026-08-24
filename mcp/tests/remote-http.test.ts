import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadContext } from "../src/client.js";
import {
    createClockifyMcpHttpHandler,
    ingressRequestIdFromAuth,
    PrincipalNotProvisionedError,
    type AuthenticatedContextResolver,
    type McpToolOutcomeLog,
    type RemoteLogEntry,
} from "../src/http.js";

const PUBLIC_URL = new URL("https://mcp.example/mcp");
const ISSUER = "https://issuer.example/";
const AUTHORIZATION = "Bearer bearer-secret-value";

describe("Clockify MCP HTTP boundary", () => {
    let logs: RemoteLogEntry[];
    let verifier: OAuthTokenVerifier;
    let resolveContext: ReturnType<typeof vi.fn<AuthenticatedContextResolver>>;

    beforeEach(() => {
        logs = [];
        verifier = {
            async verifyAccessToken(token): Promise<AuthInfo> {
                if (token !== "bearer-secret-value") throw new Error("invalid token");
                return {
                    token: "",
                    clientId: "client-1",
                    scopes: ["clockify:read"],
                    expiresAt: Math.floor(Date.now() / 1000) + 300,
                    resource: PUBLIC_URL,
                    extra: {
                        clockifyPrincipal: {
                            issuer: ISSUER,
                            subject: "private-subject",
                        },
                    },
                };
            },
        };
        resolveContext = vi.fn<AuthenticatedContextResolver>(async () => loadContext({}));
    });

    it("serves path-aware protected-resource and OAuth compatibility metadata", async () => {
        const service = makeService();

        const resource = await service.fetch(request("/.well-known/oauth-protected-resource/mcp"));
        expect(resource.status).toBe(200);
        expect(resource.headers.get("cache-control")).toBe("public, max-age=300");
        await expect(resource.json()).resolves.toMatchObject({
            resource: PUBLIC_URL.href,
            authorization_servers: [ISSUER],
            scopes_supported: ["clockify:read", "clockify:write", "clockify:admin"],
        });

        const compatibility = await service.fetch(
            request("/.well-known/oauth-authorization-server"),
        );
        expect(compatibility.status).toBe(200);
        expect(compatibility.headers.get("cache-control")).toBe("public, max-age=300");
        await expect(compatibility.json()).resolves.toMatchObject({ issuer: ISSUER });

        const unknown = await service.fetch(request("/.well-known/not-mcp"));
        expect(unknown.status).toBe(404);
        expect(unknown.headers.get("cache-control")).toBe("no-store");

        const rejectedHost = await service.fetch(
            request("/.well-known/oauth-protected-resource/mcp", {
                headers: { host: "untrusted.example" },
            }),
        );
        expect(rejectedHost.status).toBe(403);
        expect(rejectedHost.headers.get("cache-control")).toBe("no-store");

        const wrongMethod = await service.fetch(
            request("/.well-known/oauth-authorization-server", { method: "POST" }),
        );
        expect(wrongMethod.status).toBe(405);
        expect(wrongMethod.headers.get("allow")).toBe("GET");
        expect(wrongMethod.headers.get("cache-control")).toBe("no-store");
        for (const path of [
            "/.well-known/oauth-authorization-server/",
            "/.well-known/oauth-protected-resource/mcp/",
        ]) {
            expect((await service.fetch(request(path))).status).toBe(404);
        }
        for (const method of ["HEAD", "OPTIONS"]) {
            expect(
                (
                    await service.fetch(
                        request("/.well-known/oauth-authorization-server", { method }),
                    )
                ).status,
            ).toBe(405);
        }
        await service.close();
    });

    it.each(["authorization_endpoint", "token_endpoint", "jwks_uri"])(
        "rejects insecure advertised OAuth metadata field %s at the handler boundary",
        (field) => {
            expect(() =>
                makeService({
                    oauthMetadata: {
                        issuer: ISSUER,
                        authorization_endpoint: "https://issuer.example/authorize",
                        token_endpoint: "https://issuer.example/token",
                        jwks_uri: "https://issuer.example/jwks",
                        response_types_supported: ["code"],
                        [field]: `http://issuer.example/${field}`,
                    },
                }),
            ).toThrow(/canonical HTTPS URL/u);
        },
    );

    it.each(["?", "#", "?#"])(
        "rejects an empty query or fragment delimiter in public URLs: %s",
        (suffix) => {
            expect(() =>
                makeService({
                    publicUrl: new URL(`https://mcp.example/mcp${suffix}`),
                }),
            ).toThrow(/public URL/u);
            expect(() =>
                makeService({ trustedIssuer: `${ISSUER}${suffix}` }),
            ).toThrow(/canonical HTTPS URL/u);
        },
    );

    it("has minimal health/readiness and exact method routing", async () => {
        const service = makeService();
        service.setReady(false);
        expect(await json(service, "/healthz")).toEqual({ status: "ok" });

        const notReady = await service.fetch(request("/readyz"));
        expect(notReady.status).toBe(503);
        expect(await notReady.json()).toEqual({ status: "not_ready" });
        const mcpNotReady = await service.fetch(modernRequest());
        expect(mcpNotReady.status).toBe(503);
        expect(resolveContext).not.toHaveBeenCalled();
        service.setReady(true);
        expect(await json(service, "/readyz")).toEqual({ status: "ready" });
        expect((await service.fetch(modernRequest())).status).toBe(200);

        for (const method of ["GET", "DELETE", "PUT"]) {
            const response = await service.fetch(request("/mcp", { method }));
            expect(response.status).toBe(405);
            expect(response.headers.get("allow")).toBe("POST");
            expect(response.headers.has("mcp-session-id")).toBe(false);
        }
        expect((await service.fetch(request("/missing"))).status).toBe(404);
        expect((await service.fetch(request("/healthz", { method: "POST" }))).status).toBe(405);
        await service.close();
        expect((await service.fetch(request("/healthz"))).status).toBe(503);
        expect(logs.at(-1)).toMatchObject({
            auth: "not_applicable",
            failure: "not_ready",
            status: 503,
        });
    });

    it("bounds a stalled readiness query and does not make shutdown wait for it", async () => {
        vi.useFakeTimers();
        const service = makeService({
            readiness: async () => await new Promise<boolean>(() => {}),
        });
        try {
            const pending = service.fetch(request("/readyz"));
            await expect(service.close()).resolves.toBeUndefined();
            await vi.advanceTimersByTimeAsync(5_000);
            expect((await pending).status).toBe(503);
        } finally {
            vi.useRealTimers();
        }
    });

    it("enforces exact Host including port and an exact optional Origin", async () => {
        const service = makeService({
            hostAllowlist: ["mcp.example", "internal.example:8443"],
            originAllowlist: ["https://console.example"],
        });
        expect((await service.fetch(request("/healthz"))).status).toBe(200);
        expect(
            (
                await service.fetch(
                    request("/healthz", { headers: { host: "internal.example:8443" } }),
                )
            ).status,
        ).toBe(200);
        expect(
            (await service.fetch(request("/healthz", { headers: { host: "internal.example" } })))
                .status,
        ).toBe(403);
        expect(
            (
                await service.fetch(
                    request("/healthz", { headers: { origin: "https://console.example" } }),
                )
            ).status,
        ).toBe(200);
        expect(
            (
                await service.fetch(
                    request("/healthz", { headers: { origin: "https://evil.example" } }),
                )
            ).status,
        ).toBe(403);
        await service.close();
    });

    it("challenges missing bearer tokens with path-aware resource metadata", async () => {
        const readiness = vi.fn(() => true);
        const service = makeService({ readiness });
        const response = await service.fetch(modernRequest({ authorization: undefined }));
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toContain(
            'resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp"',
        );
        expect(readiness).not.toHaveBeenCalled();
        expect(resolveContext).not.toHaveBeenCalled();
        await service.close();
    });

    it.each([
        "Bearer bearer-secret-value trailing",
        "Bearer bearer-secret-value, Bearer other",
        "Bearer  bearer-secret-value",
        "Basic bearer-secret-value",
    ])("rejects ambiguous Authorization syntax: %s", async (authorization) => {
        const verifyAccessToken = vi.fn(verifier.verifyAccessToken.bind(verifier));
        verifier = { verifyAccessToken };
        const service = makeService();

        const response = await service.fetch(modernRequest({ authorization }));

        expect(response.status).toBe(401);
        expect(verifyAccessToken).not.toHaveBeenCalled();
        expect(logs.at(-1)).toMatchObject({
            auth: "rejected",
            failure: "auth_rejected",
        });
        await service.close();
    });

    it("bounds concurrent authentication and returns a retryable overload", async () => {
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const originalVerifier = verifier;
        const verifyAccessToken = vi.fn(async (token: string) => {
            await blocked;
            return await originalVerifier.verifyAccessToken(token);
        });
        verifier = { verifyAccessToken };
        const service = makeService({ maxConcurrentMcpRequests: 2 });

        const first = service.fetch(modernRequest({ "x-request-id": "admission-1" }));
        const second = service.fetch(modernRequest({ "x-request-id": "admission-2" }));
        await vi.waitFor(() => expect(verifyAccessToken).toHaveBeenCalledTimes(2));
        const overloaded = await service.fetch(modernRequest({ "x-request-id": "admission-3" }));
        expect(overloaded.status).toBe(503);
        expect(overloaded.headers.get("retry-after")).toBe("1");
        expect(logs.at(-1)).toMatchObject({ failure: "overloaded" });
        expect(verifyAccessToken).toHaveBeenCalledTimes(2);

        release();
        expect((await first).status).toBe(200);
        expect((await second).status).toBe(200);
        await service.close();
    });

    it("single-flights and briefly caches readiness probes", async () => {
        let release!: (ready: boolean) => void;
        const pending = new Promise<boolean>((resolve) => {
            release = resolve;
        });
        const readiness = vi.fn(async () => await pending);
        const service = makeService({ readiness, readinessCacheMs: 1_000 });

        const probes = [
            service.fetch(request("/readyz")),
            service.fetch(request("/readyz")),
            service.fetch(request("/readyz")),
        ];
        await vi.waitFor(() => expect(readiness).toHaveBeenCalledOnce());
        release(true);
        expect((await Promise.all(probes)).map((response) => response.status)).toEqual([
            200, 200, 200,
        ]);
        expect((await service.fetch(request("/readyz"))).status).toBe(200);
        expect(readiness).toHaveBeenCalledOnce();
        await service.close();
    });

    it("maps absent principals and context infrastructure failures deliberately", async () => {
        resolveContext = vi.fn<AuthenticatedContextResolver>(async () => {
            throw new PrincipalNotProvisionedError();
        });
        const absent = makeService();
        const absentResponse = await absent.fetch(modernRequest());
        expect(absentResponse.status).toBe(403);
        await expect(absentResponse.json()).resolves.toEqual({
            error: "principal_not_provisioned",
        });
        await absent.close();

        resolveContext = vi.fn<AuthenticatedContextResolver>(async () => {
            throw new Error("database unavailable");
        });
        const unavailable = makeService();
        expect((await unavailable.fetch(modernRequest())).status).toBe(503);
        await unavailable.close();
    });

    it("does not replace the global console warning sink during SDK setup", async () => {
        const descriptor = Object.getOwnPropertyDescriptor(console, "warn");
        const warning = vi.fn();
        let assigned = false;
        Object.defineProperty(console, "warn", {
            configurable: true,
            get: () => warning,
            set: () => {
                assigned = true;
                throw new Error("console.warn must not be replaced");
            },
        });
        try {
            const service = makeService();
            expect(assigned).toBe(false);
            await service.close();
        } finally {
            if (descriptor === undefined) {
                Reflect.deleteProperty(console, "warn");
            } else {
                Object.defineProperty(console, "warn", descriptor);
            }
        }
    });

    it("serves modern server/discover and legacy initialize without session state", async () => {
        const service = makeService();
        service.setReady(true);
        const modern = await service.fetch(modernRequest());
        expect(modern.status).toBe(200);
        expect(modern.headers.has("mcp-session-id")).toBe(false);
        expect(modern.headers.get("cache-control")).toBe("no-store");
        await expect(modern.json()).resolves.toMatchObject({
            jsonrpc: "2.0",
            id: 1,
            result: { supportedVersions: expect.arrayContaining(["2026-07-28"]) },
        });

        const legacy = await service.fetch(
            jsonRequest(
                {
                    jsonrpc: "2.0",
                    id: 2,
                    method: "initialize",
                    params: {
                        protocolVersion: "2025-06-18",
                        capabilities: {},
                        clientInfo: { name: "fixture", version: "1" },
                    },
                },
                {
                    "mcp-protocol-version": undefined,
                    "mcp-method": undefined,
                },
            ),
        );
        expect(legacy.status).toBe(200);
        expect(legacy.headers.has("mcp-session-id")).toBe(false);
        expect(await readLegacyResponse(legacy)).toMatchObject({
            jsonrpc: "2.0",
            id: 2,
            result: { protocolVersion: "2025-06-18" },
        });
        await service.close();
    });

    it("enforces protocol header/body agreement and supported modern versions", async () => {
        const service = makeService();

        const mismatch = await service.fetch(protocolRequest("2026-07-28", "2099-01-01"));
        expect(mismatch.status).toBe(400);
        await expect(mismatch.json()).resolves.toMatchObject({
            id: 7,
            error: { code: -32020 },
        });

        const unsupported = await service.fetch(protocolRequest("2099-01-01", "2099-01-01"));
        expect(unsupported.status).toBe(400);
        await expect(unsupported.json()).resolves.toMatchObject({
            id: 7,
            error: {
                code: -32022,
                data: { requested: "2099-01-01", supported: ["2026-07-28"] },
            },
        });
        await service.close();
    });

    it("propagates request cancellation through the stateless exchange", async () => {
        const service = makeService();
        const controller = new AbortController();
        controller.abort();

        const response = await service.fetch(
            protocolRequest("2026-07-28", "2026-07-28", controller.signal),
        );

        expect(response.status).toBe(499);
        expect(await response.text()).toBe("");
        expect(logs.at(-1)).toMatchObject({ failure: "request_cancelled" });
        await service.close();
    });

    it("isolates concurrent requests when a verifier reuses one AuthInfo object", async () => {
        const sharedAuth = await verifier.verifyAccessToken("bearer-secret-value");
        verifier = {
            async verifyAccessToken() {
                return sharedAuth;
            },
        };
        let arrivals = 0;
        let release!: () => void;
        const bothArrived = new Promise<void>((resolve) => {
            release = resolve;
        });
        const requestIds: string[] = [];
        resolveContext = vi.fn<AuthenticatedContextResolver>(async (authInfo) => {
            requestIds.push(ingressRequestIdFromAuth(authInfo));
            arrivals += 1;
            if (arrivals === 2) release();
            await bothArrived;
            return loadContext({});
        });
        const service = makeService();

        const responses = await Promise.all([
            service.fetch(
                toolCallRequest(
                    "clockify_docs_search",
                    { query: "first" },
                    { "x-request-id": "concurrent-1" },
                ),
            ),
            service.fetch(
                toolCallRequest(
                    "clockify_docs_search",
                    { query: "second" },
                    { "x-request-id": "concurrent-2" },
                ),
            ),
        ]);

        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(requestIds.sort()).toEqual(["concurrent-1", "concurrent-2"]);
        expect(resolveContext).toHaveBeenCalledTimes(2);
        expect(toolOutcomeLogs(logs).map(({ requestId }) => requestId).sort()).toEqual([
            "concurrent-1",
            "concurrent-2",
        ]);
        await service.close();
    });

    it("rejects media, malformed JSON, and chunked oversize before DB/decryption", async () => {
        const service = makeService({ bodyLimitBytes: 64 });

        const media = await service.fetch(
            request("/mcp", {
                method: "POST",
                headers: { authorization: AUTHORIZATION, "content-type": "text/plain" },
                body: "{}",
            }),
        );
        expect(media.status).toBe(415);

        const malformed = await service.fetch(
            request("/mcp", {
                method: "POST",
                headers: { authorization: AUTHORIZATION, "content-type": "application/json" },
                body: "{",
            }),
        );
        expect(malformed.status).toBe(400);
        await expect(malformed.json()).resolves.toMatchObject({
            error: { code: -32700 },
        });

        const encoder = new TextEncoder();
        const invalidUtf8 = await service.fetch(
            request("/mcp", {
                method: "POST",
                headers: { authorization: AUTHORIZATION, "content-type": "application/json" },
                body: new Uint8Array([
                    ...encoder.encode('{"jsonrpc":"2.0","id":"'),
                    0xff,
                    ...encoder.encode('","method":"ping"}'),
                ]),
            }),
        );
        expect(invalidUtf8.status).toBe(400);
        await expect(invalidUtf8.json()).resolves.toMatchObject({
            error: { code: -32700 },
        });

        const oversized = await service.fetch(
            request("/mcp", {
                method: "POST",
                headers: { authorization: AUTHORIZATION, "content-type": "application/json" },
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("x".repeat(65)));
                        controller.close();
                    },
                }),
                duplex: "half",
            }),
        );
        expect(oversized.status).toBe(413);
        expect(resolveContext).not.toHaveBeenCalled();
        await service.close();
    });

    it.each([
        ["invalid Host", { host: "untrusted.example", "content-type": "application/json" }, 403],
        [
            "unsupported media type",
            { authorization: AUTHORIZATION, "content-type": "text/plain" },
            415,
        ],
    ])(
        "cancels a pre-read refusal body without awaiting hostile cleanup: %s",
        async (_label, headers, expectedStatus) => {
            const service = makeService();
            let cancelled = false;
            const incoming = request("/mcp", {
                method: "POST",
                headers,
                body: new ReadableStream<Uint8Array>({
                    cancel() {
                        cancelled = true;
                        return new Promise<void>(() => {});
                    },
                }),
                duplex: "half",
            });

            const response = await service.fetch(incoming);

            expect(response.status).toBe(expectedStatus);
            expect(cancelled).toBe(true);
            expect(resolveContext).not.toHaveBeenCalled();
            await service.close();
        },
    );

    it("returns 413 even when hostile stream cancellation never settles", async () => {
        const service = makeService({ bodyLimitBytes: 1 });
        let cancelled = false;
        const oversized = request("/mcp", {
            method: "POST",
            headers: {
                authorization: AUTHORIZATION,
                "content-type": "application/json",
            },
            body: new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new Uint8Array([1, 2]));
                },
                cancel() {
                    cancelled = true;
                    return new Promise<void>(() => {});
                },
            }),
            duplex: "half",
        });

        const response = await Promise.race([
            service.fetch(oversized),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error("request hung")), 100);
            }),
        ]);

        expect(response.status).toBe(413);
        expect(cancelled).toBe(true);
        expect(resolveContext).not.toHaveBeenCalled();
        await service.close();
    });

    it("cancels a declared-oversize body without awaiting hostile cleanup", async () => {
        const service = makeService({ bodyLimitBytes: 1 });
        let cancelled = false;
        const response = await service.fetch(
            request("/mcp", {
                method: "POST",
                headers: {
                    authorization: AUTHORIZATION,
                    "content-length": "2",
                    "content-type": "application/json",
                },
                body: new ReadableStream<Uint8Array>({
                    cancel() {
                        cancelled = true;
                        return new Promise<void>(() => {});
                    },
                }),
                duplex: "half",
            }),
        );

        expect(response.status).toBe(413);
        expect(cancelled).toBe(true);
        expect(resolveContext).not.toHaveBeenCalled();
        await service.close();
    });

    it("aborts a stalled body read and releases its admission slot", async () => {
        const service = makeService({ maxConcurrentMcpRequests: 1 });
        const abort = new AbortController();
        let markReading!: () => void;
        const reading = new Promise<void>((resolve) => {
            markReading = resolve;
        });
        let cancelled = false;
        const stalled = request("/mcp", {
            method: "POST",
            headers: {
                authorization: AUTHORIZATION,
                "content-type": "application/json",
            },
            body: new ReadableStream<Uint8Array>({
                pull() {
                    markReading();
                    return new Promise<void>(() => {});
                },
                cancel() {
                    cancelled = true;
                    return new Promise<void>(() => {});
                },
            }),
            duplex: "half",
            signal: abort.signal,
        });

        const stalledResponse = service.fetch(stalled);
        await reading;
        abort.abort();
        await expect(
            Promise.race([
                stalledResponse,
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error("aborted body read hung")), 100);
                }),
            ]),
        ).resolves.toMatchObject({ status: 499 });
        expect(cancelled).toBe(true);

        expect((await service.fetch(modernRequest())).status).toBe(200);
        expect(resolveContext).toHaveBeenCalledTimes(1);
        await service.close();
    });

    it("correlates a sanitized request ID and logs no token, subject, body, or data", async () => {
        const service = makeService();
        const response = await service.fetch(
            modernRequest({ "x-request-id": "trace_123", "x-private": "do-not-log" }),
        );
        expect(response.headers.get("x-request-id")).toBe("trace_123");
        const entry = logs.at(-1);
        expect(entry).toEqual({
            event: "http_request",
            requestId: "trace_123",
            method: "POST",
            route: "mcp",
            status: 200,
            durationMs: expect.any(Number),
            auth: "accepted",
        });
        const serialized = JSON.stringify(logs);
        expect(serialized).not.toContain("bearer-secret-value");
        expect(serialized).not.toContain("private-subject");
        expect(serialized).not.toContain("server/discover");
        expect(serialized).not.toContain("do-not-log");

        const regenerated = await service.fetch(
            request("/healthz", { headers: { "x-request-id": "bad id with spaces" } }),
        );
        expect(regenerated.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
        await service.close();
    });

    it("emits one correlated, redacted tool outcome with only bounded fields", async () => {
        const service = makeService();
        const response = await service.fetch(
            toolCallRequest(
                "clockify_docs_search",
                { query: "private-tool-argument" },
                {
                    "x-request-id": "tool-trace-1",
                    "x-private": "private-header-value",
                },
            ),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            result: { structuredContent: { ok: true } },
        });
        expect(toolOutcomeLogs(logs)).toEqual([
            {
                event: "mcp_tool_outcome",
                requestId: "tool-trace-1",
                tool: "clockify_docs_search",
                risk: "read",
                outcome: "success",
                code: "ok",
                retryable: false,
                durationMs: expect.any(Number),
            },
        ]);
        const serialized = JSON.stringify(toolOutcomeLogs(logs));
        expect(serialized).not.toContain("private-tool-argument");
        expect(serialized).not.toContain("private-header-value");
        expect(serialized).not.toContain("bearer-secret-value");
        expect(serialized).not.toContain("private-subject");
        expect(serialized).not.toContain("client-1");
        await service.close();
    });

    it("does not let a failing logger alter a completed response", async () => {
        const service = makeService({
            logger: async () => {
                throw new Error("sink failed");
            },
        });

        const response = await service.fetch(
            toolCallRequest("clockify_docs_search", { query: "status" }),
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            result: { structuredContent: { ok: true } },
        });
        await service.close();
    });

    function makeService(
        overrides: Partial<
            Pick<
                Parameters<typeof createClockifyMcpHttpHandler>[0],
                | "hostAllowlist"
                | "originAllowlist"
                | "bodyLimitBytes"
                | "logger"
                | "readiness"
                | "oauthMetadata"
                | "maxConcurrentMcpRequests"
                | "readinessCacheMs"
                | "publicUrl"
                | "trustedIssuer"
            >
        > = {},
    ) {
        const service = createClockifyMcpHttpHandler({
            verifier,
            resolveContext,
            publicUrl: PUBLIC_URL,
            hostAllowlist: ["mcp.example"],
            oauthMetadata: {
                issuer: ISSUER,
                authorization_endpoint: "https://issuer.example/authorize",
                token_endpoint: "https://issuer.example/token",
                response_types_supported: ["code"],
            },
            trustedIssuer: ISSUER,
            logger: (entry) => {
                logs.push(entry);
            },
            ...overrides,
        });
        service.setReady(true);
        return service;
    }
});

function modernRequest(extraHeaders: Record<string, string | undefined> = {}): Request {
    return jsonRequest(
        {
            jsonrpc: "2.0",
            id: 1,
            method: "server/discover",
            params: {
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
        },
        { "mcp-method": "server/discover", ...extraHeaders },
    );
}

function toolCallRequest(
    name: string,
    args: Record<string, unknown>,
    extraHeaders: Record<string, string | undefined> = {},
): Request {
    return jsonRequest(
        {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
                name,
                arguments: args,
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
        },
        {
            "mcp-method": "tools/call",
            "mcp-name": name,
            ...extraHeaders,
        },
    );
}

function toolOutcomeLogs(logs: readonly RemoteLogEntry[]): McpToolOutcomeLog[] {
    return logs.filter((entry): entry is McpToolOutcomeLog =>
        entry.event === "mcp_tool_outcome"
    );
}

function protocolRequest(
    bodyVersion: string,
    headerVersion: string,
    signal?: AbortSignal,
): Request {
    const request = jsonRequest(
        {
            jsonrpc: "2.0",
            id: 7,
            method: "server/discover",
            params: {
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": bodyVersion,
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
        },
        {
            "mcp-method": "server/discover",
            "mcp-protocol-version": headerVersion,
        },
    );
    return signal === undefined ? request : new Request(request, { signal });
}

function jsonRequest(
    body: unknown,
    extraHeaders: Record<string, string | undefined> = {},
): Request {
    const headers = new Headers({
        host: "mcp.example",
        authorization: AUTHORIZATION,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": "2026-07-28",
    });
    for (const [name, value] of Object.entries(extraHeaders)) {
        if (value === undefined) headers.delete(name);
        else headers.set(name, value);
    }
    return new Request(PUBLIC_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

function request(pathname: string, init: RequestInit & { duplex?: "half" } = {}): Request {
    const headers = new Headers(init.headers);
    if (!headers.has("host")) headers.set("host", "mcp.example");
    return new Request(new URL(pathname, PUBLIC_URL), { ...init, headers });
}

async function json(
    service: ReturnType<typeof createClockifyMcpHttpHandler>,
    pathname: string,
): Promise<unknown> {
    return await (await service.fetch(request(pathname))).json();
}

async function readLegacyResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type");
    if (contentType?.startsWith("application/json")) return await response.json();
    const dataLine = (await response.text()).split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("legacy SSE response has no data frame");
    return JSON.parse(dataLine.slice("data: ".length)) as unknown;
}
