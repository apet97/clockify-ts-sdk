import { writeFile } from "node:fs/promises";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { startOAuthFixture } from "./remote-proof-oauth-fixture.mjs";

export async function proveAuthenticationAndHttp(options) {
    const secretFile = `${options.directory}/introspection-secret`;
    await writeFile(secretFile, "proof-introspection-secret\n", { mode: 0o600 });
    const signing = await generateKeyPair("RS256");
    const exported = await exportJWK(signing.publicKey);
    const fixture = await startOAuthFixture({
        directory: options.directory,
        jwk: { ...exported, alg: "RS256", kid: "proof", use: "sig" },
        expectedAuthorization: `Basic ${Buffer.from("proof-resource-server:proof-introspection-secret").toString("base64")}`,
        claims: {
            active: true,
            iss: options.issuer,
            sub: options.storage.subject,
            client_id: "proof-client",
            aud: options.resource.href,
            exp: Math.floor(Date.now() / 1000) + 300,
            scope: "clockify:read",
        },
    });
    let service;
    try {
        const verifier = await options.HybridClockifyTokenVerifier.create({
            issuer: options.issuer,
            resource: options.resource,
            jwt: {
                jwksUrl: fixture.jwksUrl,
                algorithms: ["RS256"],
                fetch: fixture.fetch,
            },
            opaque: {
                introspectionUrl: fixture.introspectionUrl,
                clientId: "proof-resource-server",
                clientSecretFile: secretFile,
                timeoutMs: 150,
            },
            fetch: fixture.fetch,
        });
        const tokenFor = async (subject) =>
            await new SignJWT({
                iss: options.issuer,
                sub: subject,
                client_id: "proof-client",
                aud: options.resource.href,
                exp: Math.floor(Date.now() / 1000) + 300,
                scope: "clockify:read",
            })
                .setProtectedHeader({ alg: "RS256", kid: "proof" })
                .sign(signing.privateKey);
        const jwt = await tokenFor(options.storage.subject);
        const beforeHybridFailure = fixture.stats.introspectionCalls;
        await assertRejects(
            () => verifier.verifyAccessToken(tamperJwtSignature(jwt)),
            "invalid JWT was accepted",
        );
        assert(
            fixture.stats.introspectionCalls === beforeHybridFailure,
            "JWT failure fell back to introspection",
        );
        for (const token of [
            "redirect-proof-token",
            "timeout-proof-token",
            "oversize-proof-token",
        ]) {
            await assertRejects(
                () => verifier.verifyAccessToken(token),
                `${token} was accepted`,
            );
        }
        assert(fixture.stats.redirectTargets === 0, "introspection redirect was followed");
        assert(
            fixture.stats.introspectionRedirectModes.length === 3 &&
                fixture.stats.introspectionRedirectModes.every((mode) => mode === "error"),
            "introspection requests did not disable redirects",
        );

        const logs = [];
        service = options.createClockifyMcpHttpHandler({
            verifier,
            resolveContext: options.createPostgresContextResolver({
                pool: options.database,
                keyring: options.storage.keyring,
                issuer: options.issuer,
                fetch: clockifyFetch(options.storage.expectedApiKey, options.workspaceId),
            }),
            publicUrl: options.resource,
            hostAllowlist: [options.resource.host],
            oauthMetadata: {
                issuer: options.issuer,
                authorization_endpoint: "https://issuer.proof.invalid/authorize",
                token_endpoint: "https://issuer.proof.invalid/token",
                jwks_uri: fixture.jwksUrl.href,
                response_types_supported: ["code"],
            },
            trustedIssuer: options.issuer,
            readiness: () => true,
            logger: (entry) => logs.push(entry),
        });
        service.setReady(true);
        for (const token of [jwt, "opaque-proof-token"]) {
            const response = await service.fetch(modernRequest(options.resource, token));
            assert(response.status === 200, "authenticated modern HTTP proof failed");
            assert(!response.headers.has("mcp-session-id"), "stateless response has a session id");
            const statusResponse = await service.fetch(
                modernToolRequest(options.resource, token, "clockify_status", {}),
            );
            assert(
                statusResponse.status === 200,
                `authenticated tools/call proof failed with status ${statusResponse.status}`,
            );
            const statusBody = await statusResponse.json();
            assert(
                statusBody?.result?.structuredContent?.ok === true &&
                    statusBody.result.structuredContent.action === "clockify_status",
                `clockify_status did not return its canonical success envelope (${statusBody?.result?.structuredContent?.error?.code ?? "unknown"})`,
            );
            assert(
                !statusResponse.headers.has("mcp-session-id"),
                "stateless tools/call response has a session id",
            );
        }
        assert(
            fixture.stats.introspectionRedirectModes.length === 5 &&
                fixture.stats.introspectionRedirectModes.every((mode) => mode === "error"),
            "successful introspection did not disable redirects",
        );
        const legacy = await service.fetch(legacyRequest(options.resource, jwt));
        assert(legacy.status === 200, "authenticated legacy HTTP proof failed");
        assert(!legacy.headers.has("mcp-session-id"), "legacy response has a session id");
        const metadata = await service.fetch(
            new Request(
                `https://${options.resource.host}/.well-known/oauth-protected-resource/mcp`,
                { headers: { host: options.resource.host } },
            ),
        );
        assert(metadata.status === 200, "protected-resource metadata failed");

        const credentials = new options.PostgresCredentialStore(
            options.database,
            options.storage.keyring,
            options.issuer,
        );
        const missingCredentialSubject = "proof-missing-credential";
        await credentials.grantPrincipal(missingCredentialSubject, "read");
        const disabledSubject = "proof-disabled-principal";
        await credentials.grantPrincipal(disabledSubject, "read");
        await credentials.setCredential(disabledSubject, {
            workspaceId: options.workspaceId,
            apiKey: "proof-disabled-api-key",
            region: "global",
        });
        await credentials.disablePrincipal(disabledSubject);
        for (const subject of [
            "proof-absent-principal",
            missingCredentialSubject,
            disabledSubject,
        ]) {
            const denied = await service.fetch(
                modernRequest(options.resource, await tokenFor(subject)),
            );
            assert(denied.status === 403, "unprovisioned principal did not receive 403");
        }
        const serializedLogs = JSON.stringify(logs);
        assert(!serializedLogs.includes(jwt), "JWT leaked to logs");
        assert(!serializedLogs.includes(options.storage.subject), "subject leaked to logs");
        assert(!serializedLogs.includes("opaque-proof-token"), "opaque token leaked to logs");
        assert(
            !serializedLogs.includes(options.storage.expectedApiKey),
            "Clockify API key leaked to logs",
        );
    } finally {
        try {
            await service?.close();
        } finally {
            await fixture.close();
        }
    }
}

export function modernToolRequest(resource, token, name, args, id = 3) {
    return new Request(resource, {
        method: "POST",
        headers: {
            host: resource.host,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/call",
            "mcp-name": name,
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: {
                name,
                arguments: args,
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
        }),
    });
}

function clockifyFetch(expectedApiKey, workspaceId) {
    return async (input, init) => {
        const request = new Request(input, init);
        if (request.headers.get("x-api-key") !== expectedApiKey) {
            return jsonResponse(401, { message: "unauthorized" });
        }
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/api/v1/user") {
            return jsonResponse(200, { id: "00000000000000000000a115", email: "proof@example.invalid" });
        }
        if (
            request.method === "GET" &&
            url.pathname ===
                `/api/v1/workspaces/${workspaceId}/time-entries/status/in-progress`
        ) {
            return jsonResponse(200, []);
        }
        return jsonResponse(404, { message: "not found" });
    };
}

function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function modernRequest(resource, token) {
    return new Request(resource, {
        method: "POST",
        headers: {
            host: resource.host,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "server/discover",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "server/discover",
            params: {
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
        }),
    });
}

function legacyRequest(resource, token) {
    return new Request(resource, {
        method: "POST",
        headers: {
            host: resource.host,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "initialize",
            params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: { name: "remote-proof", version: "1" },
            },
        }),
    });
}

async function assertRejects(operation, message) {
    try {
        await operation();
    } catch {
        return;
    }
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function tamperJwtSignature(token) {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) throw new Error("proof JWT is malformed");
    const replacement = signature[0] === "A" ? "B" : "A";
    return `${header}.${payload}.${replacement}${signature.slice(1)}`;
}
