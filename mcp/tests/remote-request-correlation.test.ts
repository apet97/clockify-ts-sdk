import type { AuthInfo } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createContext } from "../src/client.js";
import {
    ingressRequestIdFromAuth,
    withIngressRequestId,
} from "../src/http-context.js";
import { createPostgresContextResolver } from "../src/remote/context.js";
import { PostgresCredentialStore } from "../src/remote/credentials.js";
import { AesGcmKeyring } from "../src/remote/crypto.js";
import type { SqlPool } from "../src/remote/types.js";

const ISSUER = "https://issuer.example/";
const WORKSPACE_ID = "000000000000000000000001";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("remote request correlation", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps concurrent ingress IDs on their own outbound Clockify clients", async () => {
        vi.spyOn(PostgresCredentialStore.prototype, "load").mockResolvedValue({
            principalId: "principal-id",
            credentialId: "credential-id",
            credentialRevision: 1n,
            workspaceId: WORKSPACE_ID,
            apiKey: "fixture-api-key",
            region: "global",
            maxGrant: "read",
        });
        const outboundIds: string[] = [];
        let release!: () => void;
        const bothDispatched = new Promise<void>((resolve) => {
            release = resolve;
        });
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const headers = new Headers(
                init?.headers ?? (input instanceof Request ? input.headers : undefined),
            );
            const requestId = headers.get("x-request-id");
            if (requestId !== null) outboundIds.push(requestId);
            const serializedHeaders = JSON.stringify(Object.fromEntries(headers));
            expect(serializedHeaders).not.toContain("verified-bearer-is-not-retained");
            expect(serializedHeaders).not.toContain("principal-subject");
            if (outboundIds.length === 2) release();
            await bothDispatched;
            return Response.json({ id: "clockify-user" });
        });
        const resolver = createPostgresContextResolver({
            pool: unusedPool(),
            keyring: testKeyring(),
            issuer: ISSUER,
            fetch: dispatch,
        });
        const [first, second] = await Promise.all([
            resolver(withIngressRequestId(authInfo(), "ingress-1")),
            resolver(withIngressRequestId(authInfo(), "ingress-2")),
        ]);

        await Promise.all([
            first.client.users.getCurrentUser(),
            second.client.users.getCurrentUser(),
        ]);

        expect(outboundIds.sort()).toEqual(["ingress-1", "ingress-2"]);
    });

    it("keeps the SDK random request-ID default when no ingress ID is configured", async () => {
        const outboundIds: string[] = [];
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const headers = new Headers(
                init?.headers ?? (input instanceof Request ? input.headers : undefined),
            );
            const requestId = headers.get("x-request-id");
            if (requestId !== null) outboundIds.push(requestId);
            return Response.json({ id: "clockify-user" });
        });
        const context = createContext({
            apiKey: "fixture-api-key",
            workspaceId: WORKSPACE_ID,
            routing: { profile: "global" },
            fetch: dispatch,
        });

        await context.client.users.getCurrentUser();
        await context.client.users.getCurrentUser();

        expect(outboundIds).toHaveLength(2);
        expect(outboundIds.every((requestId) => UUID_V4.test(requestId))).toBe(true);
        expect(new Set(outboundIds).size).toBe(2);
    });

    it("rejects missing or malformed namespaced correlation metadata", () => {
        const attached = withIngressRequestId(authInfo(), "ingress-1");
        expect(attached.token).toBe("");
        expect(ingressRequestIdFromAuth(attached)).toBe("ingress-1");
        expect(() => ingressRequestIdFromAuth(authInfo())).toThrow(
            /correlation metadata is absent/u,
        );
        expect(() => withIngressRequestId(authInfo(), "not a request id")).toThrow(
            /correlation metadata is invalid/u,
        );
    });
});

function authInfo(): AuthInfo {
    return {
        token: "verified-bearer-is-not-retained",
        clientId: "client-1",
        scopes: ["clockify:read"],
        expiresAt: Math.floor(Date.now() / 1_000) + 300,
        resource: new URL("https://mcp.example/mcp"),
        extra: {
            clockifyPrincipal: {
                issuer: ISSUER,
                subject: "principal-subject",
            },
        },
    };
}

function testKeyring(): AesGcmKeyring {
    return AesGcmKeyring.fromDocument({
        version: 1,
        activeKeyId: "test",
        keys: { test: Buffer.alloc(32, 7).toString("base64") },
    });
}

function unusedPool(): SqlPool {
    return {
        async query(): Promise<never> {
            throw new Error("unexpected database query");
        },
        async connect(): Promise<never> {
            throw new Error("unexpected database connection");
        },
        async end(): Promise<void> {},
    };
}
