import { request as nodeHttpRequest } from "node:http";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const PROTOCOL_VERSION = "2026-07-28";

export function requestHttp(port, path, options) {
    const timeoutMs = options.timeoutMs ?? 8_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
        throw new Error("proof HTTP timeout must be between 100 and 30000 milliseconds");
    }
    return new Promise((resolveRequest, rejectRequest) => {
        let settled = false;
        const resolveOnce = (value) => {
            if (settled) return;
            settled = true;
            resolveRequest(value);
        };
        const rejectOnce = (error) => {
            if (settled) return;
            settled = true;
            rejectRequest(error);
        };
        const request = nodeHttpRequest(
            {
                hostname: "127.0.0.1",
                port,
                path,
                method: options.method,
                headers: options.headers,
                timeout: timeoutMs,
            },
            (response) => {
                const chunks = [];
                let bytes = 0;
                let ended = false;
                response.once("error", rejectOnce);
                response.once("aborted", () => rejectOnce(new Error("proof response was aborted")));
                response.once("close", () => {
                    if (!ended) rejectOnce(new Error("proof response closed before completion"));
                });
                response.on("data", (chunk) => {
                    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                    bytes += value.byteLength;
                    if (bytes > MAX_RESPONSE_BYTES) {
                        rejectOnce(new Error("proof response exceeds 2 MiB"));
                        response.destroy();
                        return;
                    }
                    chunks.push(value);
                });
                response.once("end", () => {
                    ended = true;
                    resolveOnce({
                        status: response.statusCode ?? 500,
                        headers: response.headers,
                        body: Buffer.concat(chunks, bytes).toString("utf8"),
                    });
                });
            },
        );
        request.once("timeout", () => request.destroy(new Error("proof request timed out")));
        request.once("error", rejectOnce);
        request.end(options.body);
    });
}

export async function discoverMcp(port, publicHost, token, id, options = {}) {
    return await mcpRequest(
        port,
        publicHost,
        token,
        id,
        "server/discover",
        {
            _meta: {
                "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
        options,
    );
}

export async function callMcpTool(port, publicHost, token, id, name, args) {
    return await mcpRequest(
        port,
        publicHost,
        token,
        id,
        "tools/call",
        {
            name,
            arguments: args,
            _meta: {
                "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
                "io.modelcontextprotocol/clientCapabilities": {},
            },
        },
        { toolName: name },
    );
}

export function assertJsonRpcSuccess(response, expectedId) {
    assert(response.status === 200, `JSON-RPC ${expectedId} returned HTTP ${response.status}`);
    assert(
        response.headers["mcp-session-id"] === undefined,
        `JSON-RPC ${expectedId} received a forbidden session id`,
    );
    const body = JSON.parse(response.body);
    assert(body.jsonrpc === "2.0", `JSON-RPC ${expectedId} response version is wrong`);
    assert(body.id === expectedId, `JSON-RPC ${expectedId} response id is wrong`);
    assert(isRecord(body.result), `JSON-RPC ${expectedId} did not return a result`);
    return body;
}

export function toolEnvelope(response, expectedId) {
    const body = assertJsonRpcSuccess(response, expectedId);
    const structured = body.result.structuredContent;
    if (isRecord(structured) && typeof structured.ok === "boolean") return structured;
    const content = Array.isArray(body.result.content) ? body.result.content : [];
    const text = content.find(
        (entry) => isRecord(entry) && entry.type === "text" && typeof entry.text === "string",
    )?.text;
    assert(typeof text === "string", `tool response ${expectedId} has no text envelope`);
    const parsed = JSON.parse(text);
    assert(isRecord(parsed) && typeof parsed.ok === "boolean", "tool envelope is malformed");
    return parsed;
}

export function confirmationToken(envelope) {
    assert(isRecord(envelope.data), "confirmation envelope has no data object");
    const token = envelope.data.confirm_token;
    assert(
        typeof token === "string" && /^[A-Za-z0-9_-]{43}$/u.test(token),
        "confirmation envelope has no bounded token",
    );
    return token;
}

async function mcpRequest(port, publicHost, token, id, method, params, options = {}) {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return await requestHttp(port, "/mcp", {
        method: "POST",
        headers: {
            host: publicHost,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": PROTOCOL_VERSION,
            "mcp-method": method,
            ...(options.toolName === undefined ? {} : { "mcp-name": options.toolName }),
            "x-request-id": `container-proof-${id}`,
            "content-length": Buffer.byteLength(body),
        },
        body,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
}

function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
