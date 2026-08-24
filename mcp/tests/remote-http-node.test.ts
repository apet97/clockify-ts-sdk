import { once } from "node:events";
import { createServer } from "node:http";
import { connect } from "node:net";

import type { NodeServerResponseLike } from "@modelcontextprotocol/node";
import type { AuthInfo, OAuthTokenVerifier } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadContext } from "../src/client.js";
import {
    createClockifyMcpHttpHandler,
    type AuthenticatedContextResolver,
    type RemoteLogEntry,
    toClockifyMcpNodeHandler,
} from "../src/http.js";

const PUBLIC_URL = new URL("https://mcp.example/mcp");
const ISSUER = "https://issuer.example/";
const AUTHORIZATION = "Bearer bearer-secret-value";

describe("Clockify MCP Node HTTP adapter", () => {
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

    it("bounds Node chunked ingress independently of the portable handler limit", async () => {
        const service = makeService();
        const nodeHandler = toClockifyMcpNodeHandler(service, undefined, 64);
        let reads = 0;
        let finalized = false;
        const pause = vi.fn();
        const destroy = vi.fn();
        const incoming = {
            method: "POST",
            url: "/mcp",
            headers: {
                host: "mcp.example",
                authorization: AUTHORIZATION,
                "content-type": "application/json",
                "transfer-encoding": "chunked",
            },
            pause,
            destroy,
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                try {
                    reads += 1;
                    yield new Uint8Array(40);
                    reads += 1;
                    yield new Uint8Array(40);
                    reads += 1;
                    yield new Uint8Array(40);
                } finally {
                    finalized = true;
                }
            },
        };
        const outgoing = new FakeNodeResponse();

        await nodeHandler(incoming, outgoing);

        expect(outgoing.status).toBe(413);
        expect(reads).toBe(2);
        expect(pause).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(finalized).toBe(true));
        expect(outgoing.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
        expect(logs.at(-1)).toMatchObject({ failure: "request_too_large" });
        await service.close();
    });

    it("rejects a declared oversized Node body without reading it", async () => {
        const service = makeService({ bodyLimitBytes: 64 });
        const nodeHandler = toClockifyMcpNodeHandler(service, undefined, 64);
        let reads = 0;
        const destroy = vi.fn();
        const outgoing = new FakeNodeResponse();
        const incoming = {
            method: "POST",
            url: "/mcp",
            headers: {
                host: "mcp.example",
                "content-length": "65",
                "x-request-id": "declared-size-test",
            },
            destroy,
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                reads += 1;
                yield new Uint8Array();
            },
        };

        await nodeHandler(incoming, outgoing);

        expect(outgoing.status).toBe(413);
        expect(outgoing.headers["x-request-id"]).toBe("declared-size-test");
        expect(reads).toBe(0);
        expect(destroy).toHaveBeenCalledOnce();
        expect(logs.at(-1)).toMatchObject({ failure: "request_too_large" });
        await service.close();
    });

    it("preserves invalid Node ingress UTF-8 as a JSON parse error", async () => {
        const service = makeService();
        const nodeHandler = toClockifyMcpNodeHandler(service);
        const encoder = new TextEncoder();
        const body = new Uint8Array([
            ...encoder.encode('{"jsonrpc":"2.0","id":"'),
            0xff,
            ...encoder.encode('","method":"ping"}'),
        ]);
        const outgoing = new FakeNodeResponse();

        await nodeHandler(
            {
                method: "POST",
                url: "/mcp",
                headers: {
                    host: "mcp.example",
                    authorization: AUTHORIZATION,
                    "content-length": String(body.byteLength),
                    "content-type": "application/json",
                    "x-request-id": "invalid-utf8-test",
                },
                async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                    yield body;
                },
            },
            outgoing,
        );

        expect(outgoing.status).toBe(400);
        expect(JSON.parse(outgoing.body)).toMatchObject({
            error: { code: -32700 },
        });
        expect(resolveContext).not.toHaveBeenCalled();
        expect(logs.at(-1)).toMatchObject({
            requestId: "invalid-utf8-test",
            failure: "malformed_json",
        });
        await service.close();
    });

    it.each([
        ["missing bearer", undefined, "application/json", 401, "auth_missing"],
        ["unsupported media", AUTHORIZATION, "text/plain", 415, "unsupported_media_type"],
    ])(
        "preserves Node auth and media ordering for invalid UTF-8: %s",
        async (_label, authorization, contentType, expectedStatus, expectedFailure) => {
            const service = makeService();
            const nodeHandler = toClockifyMcpNodeHandler(service);
            const outgoing = new FakeNodeResponse();
            const headers: Record<string, string> = {
                host: "mcp.example",
                "content-length": "1",
                "content-type": contentType,
                "x-request-id": `invalid-utf8-${expectedStatus}`,
            };
            if (authorization !== undefined) headers.authorization = authorization;

            await nodeHandler(
                {
                    method: "POST",
                    url: "/mcp",
                    headers,
                    async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                        yield new Uint8Array([0xff]);
                    },
                },
                outgoing,
            );

            expect(outgoing.status).toBe(expectedStatus);
            if (expectedStatus === 401) {
                expect(outgoing.headers["www-authenticate"]).toContain(
                    'resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp"',
                );
            }
            expect(resolveContext).not.toHaveBeenCalled();
            expect(logs.at(-1)).toMatchObject({ failure: expectedFailure });
            await service.close();
        },
    );

    it("preflights Node Host and Origin before reading the body", async () => {
        const service = makeService();
        const nodeHandler = toClockifyMcpNodeHandler(service);
        for (const [headers, expectedFailure] of [
            [{ host: "untrusted.example" }, "invalid_host"],
            [{ host: "mcp.example", origin: "https://untrusted.example" }, "invalid_origin"],
        ] as const) {
            let reads = 0;
            const destroy = vi.fn();
            const outgoing = new FakeNodeResponse();
            const incoming = {
                method: "POST",
                url: "/mcp",
                headers,
                destroy,
                async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                    reads += 1;
                    yield new TextEncoder().encode("{}");
                },
            };
            await nodeHandler(incoming, outgoing);
            expect(outgoing.status).toBe(403);
            expect(reads).toBe(0);
            expect(destroy).toHaveBeenCalledOnce();
            expect(logs.at(-1)).toMatchObject({ failure: expectedFailure });
        }
        await service.close();
    });

    it("rejects Node MCP overload before reading another request body", async () => {
        const service = makeService();
        const nodeHandler = toClockifyMcpNodeHandler(service, undefined, 1_024, 1);
        let release!: () => void;
        let firstStarted!: () => void;
        const bodyReleased = new Promise<void>((resolve) => {
            release = resolve;
        });
        const started = new Promise<void>((resolve) => {
            firstStarted = resolve;
        });
        const first = nodeHandler(
            {
                method: "POST",
                url: "/mcp",
                headers: { host: "mcp.example" },
                async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                    firstStarted();
                    await bodyReleased;
                    yield new TextEncoder().encode("{}");
                },
            },
            new FakeNodeResponse(),
        );
        await started;

        let reads = 0;
        const destroy = vi.fn();
        const overloaded = new FakeNodeResponse();
        const incoming = {
            method: "POST",
            url: "/mcp",
            headers: { host: "mcp.example" },
            destroy,
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                reads += 1;
                yield new TextEncoder().encode("{}");
            },
        };
        await nodeHandler(incoming, overloaded);

        expect(overloaded.status).toBe(503);
        expect(overloaded.headers["retry-after"]).toBe("1");
        expect(overloaded.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/u);
        expect(reads).toBe(0);
        expect(destroy).toHaveBeenCalledOnce();
        expect(logs.at(-1)).toMatchObject({
            route: "mcp",
            status: 503,
            auth: "not_applicable",
            failure: "overloaded",
        });
        release();
        await first;
        await service.close();
    });

    it("contains an aborted Node body read without rejecting or crashing", async () => {
        const service = makeService({ bodyLimitBytes: 64 });
        const onerror = vi.fn();
        const nodeHandler = toClockifyMcpNodeHandler(service, onerror, 64);
        const destroy = vi.fn();
        const incoming = {
            method: "POST",
            url: "/mcp",
            headers: {
                host: "mcp.example",
                authorization: AUTHORIZATION,
                "content-type": "application/json",
                "transfer-encoding": "chunked",
                "x-request-id": "abort-test",
            },
            destroy,
            async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
                yield new Uint8Array(8);
                throw new Error("peer aborted");
            },
        };
        const outgoing = new FakeNodeResponse();

        await expect(nodeHandler(incoming, outgoing)).resolves.toBeUndefined();

        expect(outgoing.status).toBe(400);
        expect(outgoing.headers["cache-control"]).toBe("no-store");
        expect(outgoing.headers["x-request-id"]).toBe("abort-test");
        expect(onerror).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
        expect(logs.at(-1)).toMatchObject({
            requestId: "abort-test",
            status: 400,
            failure: "invalid_request",
        });
        await service.close();
    });

    it("finalizes a Node iterator that yields an unsupported chunk", async () => {
        const service = makeService({ bodyLimitBytes: 64 });
        const nodeHandler = toClockifyMcpNodeHandler(service, undefined, 64);
        let finalized = false;
        const destroy = vi.fn();
        const incoming = {
            method: "POST",
            url: "/mcp",
            headers: {
                host: "mcp.example",
                "content-type": "application/json",
                "transfer-encoding": "chunked",
            },
            destroy,
            async *[Symbol.asyncIterator](): AsyncGenerator {
                try {
                    yield 7;
                } finally {
                    finalized = true;
                }
            },
        };
        const outgoing = new FakeNodeResponse();

        await expect(nodeHandler(incoming, outgoing)).resolves.toBeUndefined();

        expect(outgoing.status).toBe(400);
        expect(destroy).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(finalized).toBe(true));
        await service.close();
    });

    it.each([
        ["POST", "/unknown", 404],
        ["PUT", "/mcp", 405],
        ["GET", "/healthz", 200],
        ["HEAD", "/healthz", 405],
    ])(
        "closes a body-bearing non-MCP socket for %s %s with %i",
        async (method, path, expectedStatus) => {
            const service = makeService();
            const nodeHandler = toClockifyMcpNodeHandler(service, undefined, 64);
            let handled: Promise<void> | undefined;
            let serverBytesRead = Number.POSITIVE_INFINITY;
            const server = createServer((incoming, outgoing) => {
                const method = incoming.method;
                if (method === undefined) {
                    outgoing.writeHead(400).end();
                    return;
                }
                const boundedRequest = {
                    method,
                    ...(incoming.url === undefined ? {} : { url: incoming.url }),
                    headers: incoming.headers,
                    pause: () => incoming.pause(),
                    destroy: () => incoming.destroy(),
                    [Symbol.asyncIterator]: () => incoming[Symbol.asyncIterator](),
                };
                handled = nodeHandler(boundedRequest, outgoing).finally(() => {
                    serverBytesRead = incoming.socket.bytesRead;
                });
            });
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(0, "127.0.0.1", () => {
                    server.off("error", reject);
                    resolve();
                });
            });
            const address = server.address();
            if (address === null || typeof address === "string") {
                throw new Error("test server did not expose a TCP address");
            }
            const socket = connect({ host: "127.0.0.1", port: address.port });
            socket.setEncoding("utf8");
            let received = "";
            socket.on("data", (chunk: string) => {
                received += chunk;
            });
            socket.on("error", () => {
                // The server intentionally tears down a body-bearing rejected peer.
            });

            try {
                await once(socket, "connect");
                socket.write(
                    `${method} ${path} HTTP/1.1\r\nHost: mcp.example\r\nContent-Length: 2097152\r\nConnection: keep-alive\r\n\r\n`,
                );
                await Promise.race([
                    new Promise<void>((resolve) => socket.once("close", resolve)),
                    new Promise<never>((_, reject) => {
                        setTimeout(() => reject(new Error("rejected socket stayed open")), 1_000);
                    }),
                ]);
                if (handled === undefined) {
                    throw new Error("test request never reached the Node handler");
                }
                await handled;

                expect(received).toContain(`HTTP/1.1 ${expectedStatus}`);
                expect(received).toMatch(/\r\nconnection: close\r\n/iu);
                expect(serverBytesRead).toBeLessThan(1024 * 1024);
            } finally {
                socket.destroy();
                await new Promise<void>((resolve, reject) => {
                    server.close((error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
                await service.close();
            }
        },
    );

    function makeService(
        overrides: Partial<
            Pick<Parameters<typeof createClockifyMcpHttpHandler>[0], "bodyLimitBytes">
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

class FakeNodeResponse implements NodeServerResponseLike {
    status = 0;
    headers: Record<string, string> = {};
    destroyed = false;
    body = "";

    writeHead(statusCode: number, headers: Record<string, string> = {}): void {
        this.status = statusCode;
        this.headers = headers;
    }

    write(chunk?: unknown): boolean {
        if (typeof chunk === "string") this.body += chunk;
        else if (chunk instanceof Uint8Array) {
            this.body += new TextDecoder().decode(chunk);
        }
        return true;
    }

    end(chunk?: unknown): void {
        if (typeof chunk === "string") this.body += chunk;
        else if (chunk instanceof Uint8Array) {
            this.body += new TextDecoder().decode(chunk);
        }
    }

    on(): this {
        return this;
    }
}
