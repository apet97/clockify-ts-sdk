import {
    createMcpHandler,
    getOAuthProtectedResourceMetadataUrl,
    requireBearerAuth,
    type AuthInfo,
    type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";

import {
    cancelReaderWithoutWaiting,
    cancelStreamWithoutWaiting,
    decodeUtf8Strict,
    readStreamChunk,
    releaseReaderLock,
} from "./bounded-stream.js";
import {
    ingressRequestIdFromAuth,
    PrincipalNotProvisionedError,
    withIngressRequestId,
    type AuthenticatedContextResolver,
} from "./http-context.js";
import {
    isJsonMediaType,
    requireBodyLimit,
    requireMaxConcurrentMcpRequests,
    validDeclaredLength,
} from "./http-limits.js";
import { buildServer } from "./server.js";
import type { ToolOutcome } from "./tool-observability.js";

const BEARER_AUTHORIZATION = /^Bearer [A-Za-z0-9._~+\/-]+=*$/iu;
const MCP_HANDLER_HEADERS = [
    "accept",
    "content-type",
    "mcp-method",
    "mcp-name",
    "mcp-protocol-version",
] as const;
const REQUEST_AUTH_STATE = Symbol("clockifyMcpRequestAuthState");

interface RequestAuthInfo extends AuthInfo {
    [REQUEST_AUTH_STATE]: {
        failure?: "not_provisioned" | "unavailable";
    };
}

export type McpPostAuthOutcome =
    | "missing"
    | "accepted"
    | "rejected"
    | "unavailable";

export type McpPostFailure =
    | "not_ready"
    | "overloaded"
    | "auth_missing"
    | "auth_rejected"
    | "auth_unavailable"
    | "request_too_large"
    | "unsupported_media_type"
    | "malformed_json"
    | "principal_not_provisioned"
    | "context_unavailable"
    | "request_cancelled"
    | "invalid_request"
    | "internal_error";

interface McpPostOutcome {
    response: Response;
    auth: McpPostAuthOutcome;
    failure?: McpPostFailure;
}

interface McpPostPipeline {
    handle(
        request: Request,
        requestId: string,
        readiness: () => Promise<boolean>,
    ): Promise<McpPostOutcome>;
    close(): Promise<void>;
}

interface CreateMcpPostPipelineOptions {
    verifier: OAuthTokenVerifier;
    resolveContext: AuthenticatedContextResolver;
    publicUrl: URL;
    bodyLimitBytes?: number;
    maxConcurrentRequests?: number;
    observeTool(requestId: string, outcome: ToolOutcome): void;
}

interface McpPostRequestScope {
    requestId: string;
    auth: McpPostAuthOutcome;
}

/**
 * Own authenticated admission, bounded body parsing, request context, and
 * stateless MCP dispatch for POST /mcp.
 */
export function createMcpPostPipeline(
    options: CreateMcpPostPipelineOptions,
): McpPostPipeline {
    const bodyLimit = requireBodyLimit(options.bodyLimitBytes);
    const maxConcurrentRequests = requireMaxConcurrentMcpRequests(
        options.maxConcurrentRequests,
    );
    const authenticate = requireBearerAuth({
        verifier: options.verifier,
        resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(options.publicUrl),
    });
    // SDK v2 emits a construction-time warning for JSON response mode and has
    // no logger hook for it. Keep the process-wide console untouched; the
    // warning is safer than temporarily replacing another component's sink.
    const mcp = createMcpHandler(
        async ({ authInfo }) => {
            if (!authInfo || !isRequestAuthInfo(authInfo)) {
                throw new Error("authenticated MCP context is absent");
            }
            try {
                const context = await options.resolveContext(authInfo);
                const requestId = ingressRequestIdFromAuth(authInfo);
                return buildServer(context, {
                    toolObserver: (outcome) => {
                        options.observeTool(requestId, outcome);
                    },
                });
            } catch (error) {
                authInfo[REQUEST_AUTH_STATE].failure =
                    error instanceof PrincipalNotProvisionedError
                        ? "not_provisioned"
                        : "unavailable";
                throw error;
            }
        },
        {
            legacy: "stateless",
            responseMode: "json",
            onerror: () => {
                // Per-request failures are represented on the response and in
                // the bounded request log; never emit error objects here.
            },
        },
    );
    let activeRequests = 0;

    return {
        async handle(request, requestId, readiness): Promise<McpPostOutcome> {
            const scope: McpPostRequestScope = {
                requestId,
                auth: request.headers.has("authorization") ? "rejected" : "missing",
            };
            try {
                const authorization = request.headers.get("authorization");
                if (
                    authorization !== null &&
                    !BEARER_AUTHORIZATION.test(authorization)
                ) {
                    return failedOutcome(
                        scope,
                        await missingBearerChallenge(request, authenticate),
                        "auth_rejected",
                    );
                }
                if (authorization === null) {
                    const authResult = await authenticate(request);
                    return failedOutcome(
                        scope,
                        authResult instanceof Response
                            ? authResult
                            : jsonResponse(401, { error: "invalid_token" }),
                        authResult instanceof Response && authResult.status >= 500
                            ? "auth_unavailable"
                            : "auth_missing",
                    );
                }
                if (activeRequests >= maxConcurrentRequests) {
                    return failedOutcome(scope, serviceOverloaded(), "overloaded");
                }
                activeRequests += 1;
                try {
                    return await serveAdmittedMcpPost(
                        request,
                        scope,
                        readiness,
                        authenticate,
                        bodyLimit,
                        mcp,
                    );
                } finally {
                    activeRequests -= 1;
                }
            } catch {
                return failedOutcome(
                    scope,
                    jsonResponse(500, { error: "internal_server_error" }),
                    "internal_error",
                );
            }
        },
        async close(): Promise<void> {
            await mcp.close();
        },
    };
}

async function serveAdmittedMcpPost(
    request: Request,
    scope: McpPostRequestScope,
    readiness: () => Promise<boolean>,
    authenticate: ReturnType<typeof requireBearerAuth>,
    bodyLimit: number,
    mcp: ReturnType<typeof createMcpHandler>,
): Promise<McpPostOutcome> {
    const authResult = await authenticate(request);
    if (authResult instanceof Response) {
        scope.auth = authResult.status >= 500 ? "unavailable" : "rejected";
        return failedOutcome(
            scope,
            authResult,
            authResult.status >= 500 ? "auth_unavailable" : "auth_rejected",
        );
    }
    scope.auth = "accepted";
    if (!(await readiness())) {
        return failedOutcome(
            scope,
            jsonResponse(503, { error: "service_unavailable" }),
            "not_ready",
        );
    }

    const bodyOutcome = await readJsonBody(request, bodyLimit);
    if ("failure" in bodyOutcome) {
        return failedOutcome(scope, bodyOutcome.response, bodyOutcome.failure);
    }

    const forwarded = new Request(request.url, {
        method: "POST",
        headers: headersForMcpHandler(request.headers, scope.requestId),
        body: copyArrayBuffer(bodyOutcome.body),
        signal: request.signal,
    });
    const requestAuthInfo: RequestAuthInfo = {
        ...withIngressRequestId(authResult, scope.requestId),
        [REQUEST_AUTH_STATE]: {},
    };
    const response = await mcp.fetch(forwarded, {
        authInfo: requestAuthInfo,
        parsedBody: bodyOutcome.parsedBody,
    });
    const contextFailure = requestAuthInfo[REQUEST_AUTH_STATE].failure;
    if (contextFailure === "not_provisioned") {
        return failedOutcome(
            scope,
            jsonResponse(403, { error: "principal_not_provisioned" }),
            "principal_not_provisioned",
        );
    }
    if (contextFailure === "unavailable") {
        return failedOutcome(
            scope,
            jsonResponse(503, { error: "service_unavailable" }),
            "context_unavailable",
        );
    }
    return { response, auth: scope.auth };
}

function failedOutcome(
    scope: McpPostRequestScope,
    response: Response,
    failure: McpPostFailure,
): McpPostOutcome {
    return { response, auth: scope.auth, failure };
}

type JsonBodyOutcome =
    | { body: Uint8Array; parsedBody: unknown }
    | { response: Response; failure: McpPostFailure };

async function readJsonBody(request: Request, limit: number): Promise<JsonBodyOutcome> {
    const declaredLength = request.headers.get("content-length");
    if (declaredLength !== null && !validDeclaredLength(declaredLength, limit)) {
        if (request.body) cancelStreamWithoutWaiting(request.body);
        return {
            response: jsonResponse(413, { error: "request_too_large" }),
            failure: "request_too_large",
        };
    }
    if (!isJsonMediaType(request.headers.get("content-type"))) {
        return {
            response: jsonResponse(415, { error: "unsupported_media_type" }),
            failure: "unsupported_media_type",
        };
    }

    let body: Uint8Array | undefined;
    try {
        body = await readBoundedRequest(request, limit);
    } catch {
        if (request.signal.aborted) {
            return {
                response: new Response(null, { status: 499 }),
                failure: "request_cancelled",
            };
        }
        return {
            response: jsonResponse(400, { error: "invalid_request" }),
            failure: "invalid_request",
        };
    }
    if (body === undefined) {
        return {
            response: jsonResponse(413, { error: "request_too_large" }),
            failure: "request_too_large",
        };
    }
    try {
        return {
            body,
            parsedBody: JSON.parse(decodeUtf8Strict(body)) as unknown,
        };
    } catch {
        return { response: parseErrorResponse(), failure: "malformed_json" };
    }
}

function headersForMcpHandler(headers: Headers, requestId: string): Headers {
    const forwarded = new Headers();
    for (const name of MCP_HANDLER_HEADERS) {
        const value = headers.get(name);
        if (value !== null) forwarded.set(name, value);
    }
    forwarded.set("x-request-id", requestId);
    return forwarded;
}

async function readBoundedRequest(
    request: Request,
    limit: number,
): Promise<Uint8Array | undefined> {
    if (!request.body) return new Uint8Array();
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (
            let result = await readStreamChunk(reader, request.signal);
            !result.done;
            result = await readStreamChunk(reader, request.signal)
        ) {
            const { value } = result;
            total += value.byteLength;
            if (total > limit) {
                cancelReaderWithoutWaiting(reader);
                return undefined;
            }
            chunks.push(value);
        }
    } finally {
        if (request.signal.aborted) cancelReaderWithoutWaiting(reader);
        releaseReaderLock(reader);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

async function missingBearerChallenge(
    request: Request,
    authenticate: ReturnType<typeof requireBearerAuth>,
): Promise<Response> {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    const result = await authenticate(
        new Request(request.url, { method: request.method, headers }),
    );
    return result instanceof Response
        ? result
        : jsonResponse(401, { error: "invalid_token" });
}

function parseErrorResponse(): Response {
    return Response.json(
        {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
        },
        { status: 400 },
    );
}

function serviceOverloaded(): Response {
    return new Response(JSON.stringify({ error: "service_overloaded" }), {
        status: 503,
        headers: {
            "content-type": "application/json",
            "retry-after": "1",
        },
    });
}

function copyArrayBuffer(value: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(value.byteLength);
    new Uint8Array(copy).set(value);
    return copy;
}

function jsonResponse(status: number, body: Record<string, string>): Response {
    return Response.json(body, { status });
}

function isRequestAuthInfo(authInfo: AuthInfo): authInfo is RequestAuthInfo {
    return Object.prototype.hasOwnProperty.call(authInfo, REQUEST_AUTH_STATE);
}
