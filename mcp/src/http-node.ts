import { Buffer } from "node:buffer";

import {
    toNodeHandler,
    type NodeIncomingMessageLike,
    type NodeMcpRequestHandler,
} from "@modelcontextprotocol/node";

import { decodeUtf8Strict } from "./bounded-stream.js";
import {
    DEFAULT_BODY_LIMIT,
    DEFAULT_MAX_CONCURRENT_MCP_REQUESTS,
    isJsonMediaType,
    requireBodyLimit,
    requireMaxConcurrentMcpRequests,
    validDeclaredLength,
} from "./http-limits.js";
import type { ClockifyMcpHttpHandler } from "./http.js";

/** Adapt the portable Fetch handler to Node without allowing its adapter to buffer unbounded input. */
export function toClockifyMcpNodeHandler(
    handler: ClockifyMcpHttpHandler,
    onerror?: (error: Error) => void,
    bodyLimitBytes = DEFAULT_BODY_LIMIT,
    maxConcurrentMcpRequests = DEFAULT_MAX_CONCURRENT_MCP_REQUESTS,
): NodeMcpRequestHandler {
    const bodyLimit = requireBodyLimit(bodyLimitBytes);
    const ingressLimit = requireMaxConcurrentMcpRequests(maxConcurrentMcpRequests);
    const adapted = toNodeHandler(handler, onerror === undefined ? {} : { onerror });
    let activeMcpRequests = 0;
    return async (request, response): Promise<void> => {
        const isMcpRequest = isNodeMcpPost(request);
        const discardBodyAfterResponse =
            !isMcpRequest && nodeRequestDeclaresBody(request);
        const metadata = isMcpRequest ? nodeRequestMetadata(request) : undefined;
        if (metadata !== undefined) {
            const policyRejection = handler.preflightIngress(metadata);
            if (policyRejection !== undefined) {
                await safelyEndNodeFetchResponse(response, policyRejection);
                if (isDestroyableNodeRequest(request)) safelyDestroyNodeRequest(request);
                return;
            }
            const ingressFailure = nodeDeclaredLengthExceeds(request, bodyLimit)
                ? "request_too_large"
                : activeMcpRequests >= ingressLimit
                  ? "overloaded"
                  : undefined;
            if (ingressFailure !== undefined) {
                const rejected = handler.preflightIngress(metadata, ingressFailure);
                if (rejected === undefined) {
                    throw new Error("ingress rejection did not produce a response");
                }
                await safelyEndNodeFetchResponse(response, rejected);
                if (isDestroyableNodeRequest(request)) safelyDestroyNodeRequest(request);
                return;
            }
        }
        if (isMcpRequest) activeMcpRequests += 1;
        try {
            const collected = isMcpRequest
                ? await collectNodeRequestBody(request, bodyLimit)
                : { body: new Uint8Array(), exceeded: false };
            if (isMcpRequest && collected.exceeded) {
                const rejected = handler.preflightIngress(
                    metadata ?? nodeRequestMetadata(request),
                    "request_too_large",
                );
                if (rejected === undefined) {
                    throw new Error("oversize rejection did not produce a response");
                }
                await safelyEndNodeFetchResponse(response, rejected);
                if (isDestroyableNodeRequest(request)) safelyDestroyNodeRequest(request);
                return;
            }
            let forwardedBody = collected.body;
            let syntheticLength: number | undefined;
            if (
                isMcpRequest &&
                !collected.exceeded &&
                isJsonMediaType(nodeHeaderValue(request, "content-type"))
            ) {
                try {
                    decodeUtf8Strict(collected.body);
                } catch {
                    // Preserve handler ordering (auth -> media -> parse) while preventing
                    // the SDK adapter from replacing malformed UTF-8 before JSON parsing.
                    forwardedBody = new Uint8Array([0x7b]);
                    syntheticLength = forwardedBody.byteLength;
                }
            }
            const bounded = nodeRequestWithBody(
                request,
                forwardedBody,
                !isMcpRequest ? 0 : syntheticLength,
            );
            if (discardBodyAfterResponse) {
                forceConnectionClose(response);
            }
            await adapted(bounded, response);
        } catch (cause) {
            const error =
                cause instanceof Error
                    ? cause
                    : new Error("failed to read the Node request body");
            try {
                onerror?.(error);
            } catch {
                // Observability never owns the request outcome.
            }
            await safelyEndNodeFetchResponse(
                response,
                handler.preflightIngress(
                    metadata ?? nodeRequestMetadata(request),
                    "invalid_request",
                ) ?? Response.json({ error: "invalid_request" }, { status: 400 }),
            );
            if (isDestroyableNodeRequest(request)) safelyDestroyNodeRequest(request);
        } finally {
            if (isMcpRequest) activeMcpRequests -= 1;
        }
    };
}

interface CollectedNodeBody {
    body: Uint8Array;
    exceeded: boolean;
}

interface PausableNodeRequest extends NodeIncomingMessageLike {
    pause(): unknown;
}

interface DestroyableNodeRequest extends NodeIncomingMessageLike {
    destroy(): unknown;
}

async function collectNodeRequestBody(
    request: NodeIncomingMessageLike,
    limit: number,
): Promise<CollectedNodeBody> {
    const method = request.method?.toUpperCase() ?? "GET";
    if (method === "GET" || method === "HEAD") {
        return { body: new Uint8Array(), exceeded: false };
    }
    const iterator = request[Symbol.asyncIterator]();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        let result: IteratorResult<unknown>;
        try {
            result = await iterator.next();
        } catch (error) {
            closeIteratorWithoutWaiting(iterator);
            throw error;
        }
        if (result.done) break;
        let chunk: Uint8Array;
        try {
            chunk = nodeChunk(result.value);
        } catch (error) {
            closeIteratorWithoutWaiting(iterator);
            throw error;
        }
        total += chunk.byteLength;
        if (total > limit) {
            closeIteratorWithoutWaiting(iterator);
            if (isPausableNodeRequest(request)) request.pause();
            return { body: new Uint8Array(), exceeded: true };
        }
        chunks.push(chunk);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return { body, exceeded: false };
}

function closeIteratorWithoutWaiting(iterator: AsyncIterator<unknown>): void {
    if (iterator.return === undefined) return;
    try {
        void Promise.resolve(iterator.return()).catch(() => {});
    } catch {
        // Cleanup must not replace or delay the bounded-read outcome.
    }
}

function nodeRequestWithBody(
    request: NodeIncomingMessageLike,
    body: Uint8Array,
    declaredLength: number | undefined,
): NodeIncomingMessageLike {
    const headers = { ...request.headers };
    if (declaredLength !== undefined) {
        delete headers["transfer-encoding"];
        headers["content-length"] = declaredLength.toString();
    }
    return {
        ...(request.method === undefined ? {} : { method: request.method }),
        ...(request.url === undefined ? {} : { url: request.url }),
        headers,
        ...(request.auth === undefined ? {} : { auth: request.auth }),
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
            if (body.byteLength > 0) yield body;
        },
    };
}

function nodeChunk(value: unknown): Uint8Array {
    if (typeof value === "string") return Buffer.from(value);
    if (value instanceof Uint8Array) return value;
    throw new Error("Node request body yielded an unsupported chunk type");
}

function isPausableNodeRequest(
    request: NodeIncomingMessageLike,
): request is PausableNodeRequest {
    return "pause" in request && typeof request.pause === "function";
}

function isDestroyableNodeRequest(
    request: NodeIncomingMessageLike,
): request is DestroyableNodeRequest {
    return "destroy" in request && typeof request.destroy === "function";
}

function safelyDestroyNodeRequest(request: DestroyableNodeRequest): void {
    try {
        request.destroy();
    } catch {
        // The peer may already have closed the socket.
    }
}

function safelyEndNodeResponse(
    response: Parameters<NodeMcpRequestHandler>[1],
    status: number,
    error: string,
): void {
    if (response.destroyed) return;
    try {
        response.writeHead(status, {
            "cache-control": "no-store",
            "content-type": "application/json",
        });
        response.end(JSON.stringify({ error }));
    } catch {
        // An aborted peer can make both response operations fail.
    }
}

async function safelyEndNodeFetchResponse(
    response: Parameters<NodeMcpRequestHandler>[1],
    fetchResponse: Response,
): Promise<void> {
    if (response.destroyed) return;
    try {
        const body = await fetchResponse.text();
        const headers: Record<string, string> = {};
        fetchResponse.headers.forEach((value, name) => {
            headers[name] = value;
        });
        response.writeHead(fetchResponse.status, headers);
        response.end(body);
    } catch {
        safelyEndNodeResponse(response, 500, "internal_server_error");
    }
}

function nodeRequestMetadata(request: NodeIncomingMessageLike): Request {
    const headers = new Headers();
    for (const name of ["host", "origin", "x-request-id"] as const) {
        const value = request.headers[name];
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value) && typeof value[0] === "string") {
            headers.set(name, value[0]);
        }
    }
    return new Request(new URL(request.url ?? "/", "http://mcp.invalid"), {
        method: request.method ?? "POST",
        headers,
    });
}

function nodeHeaderValue(
    request: NodeIncomingMessageLike,
    name: string,
): string | null {
    const value = request.headers[name];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(", ");
    return null;
}

function nodeDeclaredLengthExceeds(
    request: NodeIncomingMessageLike,
    limit: number,
): boolean {
    const value = request.headers["content-length"];
    return value === undefined || typeof value === "string"
        ? value !== undefined && !validDeclaredLength(value, limit)
        : true;
}

function nodeRequestDeclaresBody(request: NodeIncomingMessageLike): boolean {
    const contentLength = nodeHeaderValue(request, "content-length");
    return (
        (contentLength !== null && contentLength !== "0") ||
        nodeHeaderValue(request, "transfer-encoding") !== null
    );
}

function forceConnectionClose(response: Parameters<NodeMcpRequestHandler>[1]): void {
    if (
        "shouldKeepAlive" in response &&
        typeof response.shouldKeepAlive === "boolean"
    ) {
        response.shouldKeepAlive = false;
    }
    if ("setHeader" in response && typeof response.setHeader === "function") {
        response.setHeader("connection", "close");
    }
}

function isNodeMcpPost(request: NodeIncomingMessageLike): boolean {
    if (request.method?.toUpperCase() !== "POST" || request.url === undefined) {
        return false;
    }
    try {
        return new URL(request.url, "http://mcp.invalid").pathname === "/mcp";
    } catch {
        return false;
    }
}
