import { execFile } from "node:child_process";
import { chmod, readFile } from "node:fs/promises";
import { createServer, request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ADVERTISED_ORIGIN = "https://issuer.proof.invalid";

export async function startOAuthFixture(options) {
    const keyPath = `${options.directory}/oauth-fixture.key`;
    const certificatePath = `${options.directory}/oauth-fixture.crt`;
    await execFileAsync("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
        "-days",
        "1",
        "-subj",
        "/CN=issuer.proof.invalid",
        "-addext",
        "subjectAltName=DNS:issuer.proof.invalid",
    ], {
        timeout: 10_000,
        maxBuffer: 64 * 1024,
    });
    await chmod(keyPath, 0o600);
    const [key, certificate] = await Promise.all([
        readFile(keyPath),
        readFile(certificatePath),
    ]);
    const stats = {
        introspectionCalls: 0,
        jwksCalls: 0,
        redirectTargets: 0,
        introspectionRedirectModes: [],
    };
    const server = createServer({ key, cert: certificate }, (request, response) => {
        void handleRequest(request, response, options, stats).catch(() => {
            if (response.headersSent) response.destroy();
            else writeJson(response, 500, { error: "fixture_failure" });
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.off("error", reject);
            resolve();
        });
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        server.closeAllConnections();
        throw new Error("OAuth proof fixture did not bind a TCP port");
    }
    const targetOrigin = `https://127.0.0.1:${address.port}`;
    return {
        fetch: createPinnedFetch(targetOrigin, certificate, stats),
        introspectionUrl: new URL(`${ADVERTISED_ORIGIN}/introspect`),
        jwksUrl: new URL(`${ADVERTISED_ORIGIN}/jwks`),
        stats,
        async close() {
            await new Promise((resolve) => {
                server.close(resolve);
                server.closeAllConnections();
            });
        },
    };
}

async function handleRequest(request, response, options, stats) {
    if (request.method === "GET" && request.url === "/jwks") {
        stats.jwksCalls += 1;
        writeJson(response, 200, { keys: [options.jwk] });
        return;
    }
    if (request.method !== "POST" || request.url !== "/introspect") {
        if (request.url === "/introspect-redirect-target") {
            stats.redirectTargets += 1;
        }
        writeJson(response, 404, { error: "not_found" });
        return;
    }
    stats.introspectionCalls += 1;
    if (request.headers.authorization !== options.expectedAuthorization) {
        writeJson(response, 401, { error: "invalid_client" });
        return;
    }
    const body = new URLSearchParams(await readBody(request));
    const token = body.get("token");
    if (token === "redirect-proof-token") {
        response.writeHead(302, { location: "/introspect-redirect-target" });
        response.end();
        return;
    }
    if (token === "timeout-proof-token") return;
    if (token === "oversize-proof-token") {
        writeJson(response, 200, { ...options.claims, padding: "x".repeat(70_000) });
        return;
    }
    writeJson(response, 200, token === "opaque-proof-token" ? options.claims : { active: false });
}

function createPinnedFetch(targetOrigin, certificate, stats) {
    return async (input, init = {}) => {
        const advertised = new URL(input instanceof Request ? input.url : String(input));
        if (advertised.origin !== ADVERTISED_ORIGIN) {
            throw new Error("OAuth proof fetch escaped its owned fixture");
        }
        const target = new URL(`${advertised.pathname}${advertised.search}`, targetOrigin);
        if (advertised.pathname === "/introspect") {
            stats.introspectionRedirectModes.push(init.redirect ?? "follow");
        }
        return await new Promise((resolve, reject) => {
            const headers = new Headers(
                input instanceof Request ? input.headers : init.headers,
            );
            const request = httpsRequest(
                target,
                {
                    method: init.method ?? (input instanceof Request ? input.method : "GET"),
                    headers: Object.fromEntries(headers.entries()),
                    ca: certificate,
                    servername: "issuer.proof.invalid",
                    signal: init.signal,
                },
                (response) => {
                    const status = response.statusCode ?? 500;
                    if (init.redirect === "error" && status >= 300 && status < 400) {
                        response.resume();
                        reject(new Error("OAuth proof redirect rejected"));
                        return;
                    }
                    resolve(
                        new Response(Readable.toWeb(response), {
                            status,
                            headers: response.headers,
                        }),
                    );
                },
            );
            request.once("error", reject);
            const body = init.body;
            if (body === undefined || body === null) request.end();
            else if (typeof body === "string" || body instanceof Uint8Array) {
                request.end(body);
            } else if (body instanceof URLSearchParams) request.end(body.toString());
            else {
                request.destroy();
                reject(new TypeError("OAuth proof fetch received an unsupported body"));
            }
        });
    };
}

async function readBody(request) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += value.byteLength;
        if (bytes > 8 * 1024) throw new Error("OAuth proof request body is too large");
        chunks.push(value);
    }
    return Buffer.concat(chunks, bytes).toString("utf8");
}

function writeJson(response, status, value) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(value));
}
