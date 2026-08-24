import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    HybridClockifyTokenVerifier,
    remotePrincipalFromAuth,
} from "../src/remote/auth.js";

const ISSUER = "https://issuer.example/";
const RESOURCE = new URL("https://mcp.example/mcp");
const NOW = Math.floor(Date.now() / 1000);

describe("HybridClockifyTokenVerifier", () => {
    let directory: string;
    let secretFile: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "clockify-mcp-auth-"));
        secretFile = join(directory, "introspection-secret");
        await writeFile(secretFile, "fixture-secret\n", { mode: 0o600 });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await rm(directory, { recursive: true, force: true });
    });

    it("verifies an asymmetric JWT and removes the bearer secret from AuthInfo", async () => {
        const { privateKey, publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({ keyResolver: async () => publicKey });
        const token = await signedToken(privateKey);

        const info = await verifier.verifyAccessToken(token);

        expect(info).toMatchObject({
            token: "",
            clientId: "test-client",
            scopes: ["clockify:read"],
            expiresAt: NOW + 300,
        });
        expect(info.extra.clockifyPrincipal).toEqual({
            issuer: ISSUER,
            subject: "principal-1",
        });
    });

    it.each(["", " principal-1", "principal-1 ", "x".repeat(1_025)])(
        "rejects an unprovisionable subject from a custom verifier: %j",
        (subject) => {
            expect(() =>
                remotePrincipalFromAuth({
                    clientId: "test-client",
                    scopes: ["clockify:read"],
                    extra: { clockifyPrincipal: { issuer: ISSUER, subject } },
                }),
            ).toThrow();
        },
    );

    it.each([
        "bad.jwt.token",
        "header.payload.",
        "header..signature",
        "..",
        "not+base64.payload.signature",
    ])("never introspects a failed three-segment token: %s", async (token) => {
        const { publicKey } = await generateKeyPair("RS256");
        const request = vi.fn<typeof fetch>();
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: request,
        });

        await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
            code: "invalid_token",
        });
        expect(request).not.toHaveBeenCalled();
    });

    it.each([
        ["wrong audience", { aud: "https://other.example/mcp" }],
        ["wrong issuer", { iss: "https://other.example/" }],
        ["expired", { exp: NOW - 1 }],
        ["missing client", { client_id: undefined }],
        ["whitespace-padded subject", { sub: " principal-1" }],
        ["oversized subject", { sub: "x".repeat(1_025) }],
        ["missing scope", { scope: undefined }],
        ["unrelated scope", { scope: "profile email" }],
        ["different resource claim", { resource: "https://other.example/mcp" }],
    ])("rejects JWT claims with %s", async (_label, overrides) => {
        const { privateKey, publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({ keyResolver: async () => publicKey });
        const token = await signedToken(privateKey, overrides);

        await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
            code: "invalid_token",
        });
    });

    it("accepts JWKS-style key rotation through the configured resolver", async () => {
        const first = await generateKeyPair("RS256");
        const second = await generateKeyPair("RS256");
        const keys = new Map([
            ["first", first.publicKey],
            ["second", second.publicKey],
        ]);
        const verifier = await makeVerifier({
            keyResolver: async (header) => keys.get(String(header.kid)) ?? first.publicKey,
        });

        await expect(
            verifier.verifyAccessToken(
                await signedToken(first.privateKey, {}, "first"),
            ),
        ).resolves.toMatchObject({ clientId: "test-client" });
        await expect(
            verifier.verifyAccessToken(
                await signedToken(second.privateKey, {}, "second"),
            ),
        ).resolves.toMatchObject({ clientId: "test-client" });
    });

    it("fetches, caches, and refreshes a remote JWKS after rotation", async () => {
        const first = await generateKeyPair("RS256");
        const second = await generateKeyPair("RS256");
        let keys = [
            { ...(await exportJWK(first.publicKey)), alg: "RS256", kid: "first" },
        ];
        const jwksFetch = vi.fn<typeof fetch>(async () => Response.json({ keys }));
        const verifier = await makeRemoteJwksVerifier(jwksFetch);

        await expect(
            verifier.verifyAccessToken(await signedToken(first.privateKey, {}, "first")),
        ).resolves.toMatchObject({ clientId: "test-client" });
        await expect(
            verifier.verifyAccessToken(await signedToken(first.privateKey, {}, "first")),
        ).resolves.toMatchObject({ clientId: "test-client" });
        expect(jwksFetch).toHaveBeenCalledTimes(1);

        keys = [
            { ...(await exportJWK(second.publicKey)), alg: "RS256", kid: "second" },
        ];
        const afterCooldown = Date.now() + 31_000;
        vi.spyOn(Date, "now").mockReturnValue(afterCooldown);
        const rotated = await verifier
            .verifyAccessToken(await signedToken(second.privateKey, {}, "second"))
            .catch((error: unknown) => error);
        expect(jwksFetch).toHaveBeenCalledTimes(2);
        expect(rotated).toMatchObject({ clientId: "test-client" });
    });

    it.each([
        ["network failure", async () => { throw new TypeError("offline"); }],
        ["non-success response", async () => new Response(null, { status: 503 })],
        ["non-object JWKS", async () => Response.json([])],
        ["malformed keys member", async () => Response.json({ keys: "invalid" })],
        [
            "oversized response",
            async () =>
                new Response("x".repeat(256 * 1024 + 1), {
                    headers: { "content-type": "application/json" },
                }),
        ],
        [
            "wrong media type",
            async () =>
                new Response('{"keys":[]}', {
                    headers: { "content-type": "text/plain" },
                }),
        ],
    ])("reports remote JWKS %s as verification unavailable", async (_label, request) => {
        const signing = await generateKeyPair("RS256");
        const verifier = await makeRemoteJwksVerifier(request);

        await expect(
            verifier.verifyAccessToken(await signedToken(signing.privateKey)),
        ).rejects.toMatchObject({ code: "server_error" });
    });

    it.each([
        ["non-success status", 503, "application/json"],
        ["wrong media type", 200, "text/plain"],
    ])(
        "cancels a rejected JWKS body without awaiting hostile cleanup: %s",
        async (_label, status, contentType) => {
            const signing = await generateKeyPair("RS256");
            let cancelled = false;
            const verifier = await makeRemoteJwksVerifier(async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        cancel() {
                            cancelled = true;
                            return new Promise<void>(() => {});
                        },
                    }),
                    { status, headers: { "content-type": contentType } },
                ),
            );

            await expect(
                verifier.verifyAccessToken(await signedToken(signing.privateKey)),
            ).rejects.toMatchObject({ code: "server_error" });
            expect(cancelled).toBe(true);
        },
    );

    it("introspects opaque tokens with Basic auth, no redirects, and a bounded body", async () => {
        const request = vi.fn<typeof fetch>(async (_input, init) => {
            expect(init?.redirect).toBe("error");
            expect(init?.headers).toMatchObject({
                authorization: `Basic ${Buffer.from("resource-client:fixture-secret").toString("base64")}`,
            });
            expect(String(init?.body)).toContain("token=opaque-token");
            return Response.json({
                active: true,
                iss: ISSUER,
                sub: "principal-opaque",
                client_id: "caller-client",
                aud: RESOURCE.href,
                exp: NOW + 300,
                scope: "clockify:write profile",
            });
        });
        const { publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: request,
        });

        await expect(verifier.verifyAccessToken("opaque-token")).resolves.toMatchObject({
            token: "",
            clientId: "caller-client",
            scopes: ["clockify:write"],
        });
    });

    it("accepts a case-insensitive JSON introspection media type", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                Response.json(
                    {
                        active: true,
                        iss: ISSUER,
                        sub: "principal-opaque",
                        client_id: "caller-client",
                        aud: RESOURCE.href,
                        exp: NOW + 300,
                        scope: "clockify:read",
                    },
                    { headers: { "content-type": "Application/JSON; Charset=UTF-8" } },
                ),
        });

        await expect(verifier.verifyAccessToken("opaque-token")).resolves.toMatchObject({
            clientId: "caller-client",
            scopes: ["clockify:read"],
        });
    });

    it.each([
        ["non-success status", 503, "application/json"],
        ["wrong media type", 200, "text/plain"],
    ])(
        "cancels a rejected introspection body without awaiting hostile cleanup: %s",
        async (_label, status, contentType) => {
            const { publicKey } = await generateKeyPair("RS256");
            let cancelled = false;
            const verifier = await makeVerifier({
                keyResolver: async () => publicKey,
                fetch: async () =>
                    new Response(
                        new ReadableStream<Uint8Array>({
                            cancel() {
                                cancelled = true;
                                return new Promise<void>(() => {});
                            },
                        }),
                        { status, headers: { "content-type": contentType } },
                    ),
            });

            await expect(
                verifier.verifyAccessToken("opaque-token"),
            ).rejects.toMatchObject({ code: "server_error" });
            expect(cancelled).toBe(true);
        },
    );

    it.each([
        ["inactive", { active: false }],
        ["wrong issuer", { active: true, iss: "https://other.example/" }],
        ["wrong audience", { active: true, aud: "https://other.example/mcp" }],
        ["expired", { active: true, exp: NOW - 1 }],
        ["whitespace-padded subject", { active: true, sub: "principal-1 " }],
        ["oversized subject", { active: true, sub: "x".repeat(1_025) }],
        ["missing scope", { active: true, scope: undefined }],
        ["unrelated scope", { active: true, scope: "openid" }],
    ])("rejects an opaque token that is %s", async (_label, overrides) => {
        const { publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () => {
                const payload: Record<string, unknown> = {
                    active: true,
                    iss: ISSUER,
                    sub: "principal-1",
                    client_id: "client-1",
                    aud: RESOURCE.href,
                    exp: NOW + 300,
                    scope: "clockify:read",
                };
                Object.assign(payload, overrides);
                return Response.json(payload);
            },
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "invalid_token",
        });
    });

    it("rejects oversized streamed introspection responses", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                new Response("x".repeat(64 * 1024 + 1), {
                    headers: { "content-type": "application/json" },
                }),
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "server_error",
        });
    });

    it("cancels a declared-oversize introspection body without awaiting it", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        let cancelled = false;
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        cancel() {
                            cancelled = true;
                            return new Promise<void>(() => {});
                        },
                    }),
                    {
                        headers: {
                            "content-length": String(64 * 1024 + 1),
                            "content-type": "application/json",
                        },
                    },
                ),
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "server_error",
        });
        expect(cancelled).toBe(true);
    });

    it("rejects invalid UTF-8 in an introspection identity", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        const encoder = new TextEncoder();
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                new Response(
                    new Uint8Array([
                        ...encoder.encode(
                            `{"active":true,"iss":"${ISSUER}","sub":"`,
                        ),
                        0xff,
                        ...encoder.encode(
                            `","client_id":"client-1","aud":"${RESOURCE.href}","exp":${NOW + 300},"scope":"clockify:read"}`,
                        ),
                    ]),
                    { headers: { "content-type": "application/json" } },
                ),
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "server_error",
        });
    });

    it("fails closed on introspection timeout and redirect errors", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        const request = vi.fn<typeof fetch>(async (_input, init) => {
            expect(init?.redirect).toBe("error");
            await new Promise<void>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            });
            throw new Error("unreachable");
        });
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: request,
            timeoutMs: 5,
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "server_error",
        });
    });

    it("keeps the timeout active while reading the introspection body", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("{"));
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            timeoutMs: 5,
        });

        await expect(verifier.verifyAccessToken("opaque-token")).rejects.toMatchObject({
            code: "server_error",
        });
    });

    it("does not let a non-settling stream cancellation defeat the timeout", async () => {
        const { publicKey } = await generateKeyPair("RS256");
        let cancelled = false;
        const verifier = await makeVerifier({
            keyResolver: async () => publicKey,
            fetch: async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("{"));
                        },
                        cancel() {
                            cancelled = true;
                            return new Promise<void>(() => {});
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
            timeoutMs: 5,
        });

        await expect(
            Promise.race([
                verifier.verifyAccessToken("opaque-token"),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("verification hung")), 100);
                }),
            ]),
        ).rejects.toMatchObject({ code: "server_error" });
        expect(cancelled).toBe(true);
    });

    it.each(["?", "#", "?#"])(
        "rejects an empty query or fragment delimiter in auth URLs: %s",
        async (suffix) => {
            const { publicKey } = await generateKeyPair("RS256");
            const opaque = {
                introspectionUrl: new URL("https://issuer.example/introspect"),
                clientId: "resource-client",
                clientSecretFile: secretFile,
            };

            await expect(
                HybridClockifyTokenVerifier.create({
                    issuer: `${ISSUER}${suffix}`,
                    resource: RESOURCE,
                    jwt: { keyResolver: async () => publicKey, algorithms: ["RS256"] },
                    opaque,
                }),
            ).rejects.toThrow(/canonical HTTPS URL/u);
            await expect(
                HybridClockifyTokenVerifier.create({
                    issuer: ISSUER,
                    resource: RESOURCE,
                    jwt: {
                        jwksUrl: new URL(`https://issuer.example/jwks${suffix}`),
                        algorithms: ["RS256"],
                    },
                    opaque,
                }),
            ).rejects.toThrow(/canonical HTTPS URL/u);
            await expect(
                HybridClockifyTokenVerifier.create({
                    issuer: ISSUER,
                    resource: RESOURCE,
                    jwt: { keyResolver: async () => publicKey, algorithms: ["RS256"] },
                    opaque: {
                        ...opaque,
                        introspectionUrl: new URL(
                            `https://issuer.example/introspect${suffix}`,
                        ),
                    },
                }),
            ).rejects.toThrow(/canonical HTTPS URL/u);
        },
    );

    it("requires mode-0600 introspection secrets and asymmetric algorithms", async () => {
        await writeFile(secretFile, "fixture-secret\n", { mode: 0o644 });
        await chmod(secretFile, 0o644);
        const { publicKey } = await generateKeyPair("RS256");
        await expect(
            makeVerifier({ keyResolver: async () => publicKey }),
        ).rejects.toThrow(/0600/u);
        await writeFile(secretFile, "fixture-secret\n", { mode: 0o600 });
        await chmod(secretFile, 0o600);
        for (const algorithm of ["HS256", "RS1", "ES999"]) {
            await expect(
                makeVerifier({
                    keyResolver: async () => publicKey,
                    algorithms: [algorithm],
                }),
            ).rejects.toThrow(/asymmetric/u);
        }
    });

    async function makeVerifier(options: {
        keyResolver: NonNullable<
            Parameters<typeof HybridClockifyTokenVerifier.create>[0]["jwt"]["keyResolver"]
        >;
        fetch?: typeof fetch;
        timeoutMs?: number;
        algorithms?: readonly string[];
    }): Promise<HybridClockifyTokenVerifier> {
        return await HybridClockifyTokenVerifier.create({
            issuer: ISSUER,
            resource: RESOURCE,
            jwt: {
                keyResolver: options.keyResolver,
                algorithms: options.algorithms ?? ["RS256"],
            },
            opaque: {
                introspectionUrl: new URL("https://issuer.example/introspect"),
                clientId: "resource-client",
                clientSecretFile: secretFile,
                ...(options.timeoutMs === undefined
                    ? {}
                    : { timeoutMs: options.timeoutMs }),
            },
            ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        });
    }

    async function makeRemoteJwksVerifier(
        jwksFetch: typeof fetch,
    ): Promise<HybridClockifyTokenVerifier> {
        return await HybridClockifyTokenVerifier.create({
            issuer: ISSUER,
            resource: RESOURCE,
            jwt: {
                jwksUrl: new URL("https://issuer.example/jwks"),
                algorithms: ["RS256"],
                fetch: jwksFetch,
            },
            opaque: {
                introspectionUrl: new URL("https://issuer.example/introspect"),
                clientId: "resource-client",
                clientSecretFile: secretFile,
            },
            fetch: async () => {
                throw new Error("opaque introspection was not expected");
            },
        });
    }
});

async function signedToken(
    key: CryptoKey,
    overrides: Record<string, unknown> = {},
    keyId = "fixture",
): Promise<string> {
    const supplied: Record<string, unknown> = {
        iss: ISSUER,
        sub: "principal-1",
        client_id: "test-client",
        aud: RESOURCE.href,
        exp: NOW + 300,
        scope: "clockify:read",
        ...overrides,
    };
    const claims: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(supplied)) {
        if (value !== undefined) claims[name] = value;
    }
    return await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: keyId })
        .sign(key);
}
