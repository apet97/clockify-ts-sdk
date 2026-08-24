import type * as McpServer from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ request: undefined as Request | undefined }));

vi.mock("@modelcontextprotocol/server", async (importOriginal) => {
    const actual = await importOriginal<typeof McpServer>();
    return {
        ...actual,
        createMcpHandler: () => ({
            async fetch(request: Request): Promise<Response> {
                captured.request = request;
                return Response.json({ jsonrpc: "2.0", id: 1, result: {} });
            },
            async close(): Promise<void> {},
        }),
    };
});

import { loadContext } from "../src/client.js";
import { createClockifyMcpHttpHandler } from "../src/http.js";

const PUBLIC_URL = new URL("https://mcp.example/mcp");
const ISSUER = "https://issuer.example/";

describe("authenticated MCP header boundary", () => {
    afterEach(() => {
        captured.request = undefined;
    });

    it("forwards only protocol, content-negotiation, and correlation headers", async () => {
        const verifier: McpServer.OAuthTokenVerifier = {
            async verifyAccessToken(): Promise<McpServer.AuthInfo> {
                return {
                    token: "",
                    clientId: "client-1",
                    scopes: ["clockify:read"],
                    expiresAt: Math.floor(Date.now() / 1_000) + 300,
                    resource: PUBLIC_URL,
                    extra: {
                        clockifyPrincipal: {
                            issuer: ISSUER,
                            subject: "principal-1",
                        },
                    },
                };
            },
        };
        const service = createClockifyMcpHttpHandler({
            verifier,
            resolveContext: async () => loadContext({}),
            publicUrl: PUBLIC_URL,
            hostAllowlist: ["mcp.example"],
            oauthMetadata: {
                issuer: ISSUER,
                authorization_endpoint: "https://issuer.example/authorize",
                token_endpoint: "https://issuer.example/token",
                response_types_supported: ["code"],
            },
            trustedIssuer: ISSUER,
            logger: () => {},
        });
        service.setReady(true);

        const response = await service.fetch(
            new Request(PUBLIC_URL, {
                method: "POST",
                headers: {
                    accept: "application/json, text/event-stream",
                    authorization: "Bearer bearer-secret-value",
                    cookie: "session=cookie-secret",
                    "content-type": "application/json",
                    host: "mcp.example",
                    "mcp-method": "tools/call",
                    "mcp-name": "clockify_status",
                    "mcp-param-secret": "must-not-cross",
                    "mcp-protocol-version": "2026-07-28",
                    "proxy-authorization": "Basic proxy-secret",
                    "x-api-key": "api-key-secret",
                    "x-auth-token": "auth-token-secret",
                    "x-forwarded-authorization": "Bearer forwarded-secret",
                    "x-private": "private-secret",
                    "x-request-id": "trace_123",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "tools/call",
                    params: {
                        name: "clockify_status",
                        arguments: {},
                        _meta: {
                            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                            "io.modelcontextprotocol/clientCapabilities": {},
                        },
                    },
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(captured.request).toBeDefined();
        expect(Object.fromEntries(captured.request?.headers ?? [])).toEqual({
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            "mcp-method": "tools/call",
            "mcp-name": "clockify_status",
            "mcp-protocol-version": "2026-07-28",
            "x-request-id": "trace_123",
        });
        await service.close();
    });
});
