import { randomUUID } from "node:crypto";

import {
    getOAuthProtectedResourceMetadataUrl,
    oauthMetadataResponse,
    type AuthMetadataOptions,
    type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";

import { cancelStreamWithoutWaiting } from "./bounded-stream.js";
import type { AuthenticatedContextResolver } from "./http-context.js";
import {
    createMcpPostPipeline,
    type McpPostAuthOutcome,
    type McpPostFailure,
} from "./http-mcp-post.js";
import { requireExactHttpsUrl } from "./http-url.js";
import { REMOTE_SCOPES } from "./remote/types.js";
import type { ToolOutcome } from "./tool-observability.js";

export { toClockifyMcpNodeHandler } from "./http-node.js";
export {
    ingressRequestIdFromAuth,
    PrincipalNotProvisionedError,
    type AuthenticatedContextResolver,
} from "./http-context.js";

const DEFAULT_READINESS_CACHE_MS = 1_000;
const READINESS_TIMEOUT_MS = 5_000;
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;
type AuthOutcome = "not_applicable" | McpPostAuthOutcome;

export interface HttpRequestLog {
    event: "http_request";
    requestId: string;
    method: string;
    route: "mcp" | "oauth_metadata" | "health" | "ready" | "unknown";
    status: number;
    durationMs: number;
    auth: AuthOutcome;
    failure?: HttpFailure;
}

export interface McpToolOutcomeLog extends ToolOutcome {
    event: "mcp_tool_outcome";
    requestId: string;
}

type HttpFailure =
    | McpPostFailure
    | "invalid_host"
    | "invalid_origin"
    | "method_not_allowed"
    | "not_found"
    | "internal_error";

export type RemoteLogEntry = HttpRequestLog | McpToolOutcomeLog;
export type RemoteLogger = (entry: RemoteLogEntry) => void | Promise<void>;

export interface CreateClockifyMcpHttpHandlerOptions {
    verifier: OAuthTokenVerifier;
    resolveContext: AuthenticatedContextResolver;
    /** Exact externally visible HTTPS URL, including the `/mcp` path. */
    publicUrl: URL;
    /** Exact HTTP Host values, including a non-default port when one is used. */
    hostAllowlist: readonly string[];
    /** Exact serialized origins. Missing Origin is accepted; every present Origin is checked. */
    originAllowlist?: readonly string[];
    oauthMetadata: AuthMetadataOptions["oauthMetadata"];
    trustedIssuer: string;
    readiness?: () => boolean | Promise<boolean>;
    logger?: RemoteLogger;
    bodyLimitBytes?: number;
    /** Process-local admission bound for authenticated and opaque-token work. */
    maxConcurrentMcpRequests?: number;
    /** Short single-flight cache for the anonymous readiness endpoint. */
    readinessCacheMs?: number;
}

export interface ClockifyMcpHttpHandler {
    fetch(request: Request): Promise<Response>;
    /** Validate Node metadata and optionally complete a pre-body rejection. */
    preflightIngress(
        request: Request,
        failure?:
            | "overloaded"
            | "request_too_large"
            | "invalid_request",
    ): Response | undefined;
    close(): Promise<void>;
    setReady(ready: boolean): void;
}

/** Build the transport-portable authenticated HTTP service. */
export function createClockifyMcpHttpHandler(
    options: CreateClockifyMcpHttpHandlerOptions,
): ClockifyMcpHttpHandler {
    const publicUrl = requirePublicMcpUrl(options.publicUrl);
    const allowedHosts = requireHostAllowlist(options.hostAllowlist, publicUrl.host);
    const allowedOrigins = new Set(
        (options.originAllowlist ?? []).map((origin) => requireOrigin(origin)),
    );
    const trustedIssuer = requireIssuer(options.trustedIssuer);
    const oauthMetadata = requireOAuthMetadata(
        structuredClone(options.oauthMetadata),
        trustedIssuer,
    );
    const readiness = cachedReadiness(
        options.readiness,
        options.readinessCacheMs ?? DEFAULT_READINESS_CACHE_MS,
    );
    const metadataOptions: AuthMetadataOptions = {
        oauthMetadata,
        resourceServerUrl: publicUrl,
        scopesSupported: [...REMOTE_SCOPES],
        resourceName: "Clockify 115 MCP",
    };
    // Build once at startup so issuer/resource metadata errors fail closed.
    const metadataProbe = new Request(
        getOAuthProtectedResourceMetadataUrl(publicUrl),
    );
    if (!oauthMetadataResponse(metadataProbe, metadataOptions)) {
        throw new Error("failed to configure OAuth protected-resource metadata");
    }

    const logger = options.logger ?? writeStructuredLog;
    const mcpPost = createMcpPostPipeline({
        verifier: options.verifier,
        resolveContext: options.resolveContext,
        publicUrl,
        ...(options.bodyLimitBytes === undefined
            ? {}
            : { bodyLimitBytes: options.bodyLimitBytes }),
        ...(options.maxConcurrentMcpRequests === undefined
            ? {}
            : { maxConcurrentRequests: options.maxConcurrentMcpRequests }),
        observeTool(requestId, outcome): void {
            emitRemoteLog(logger, {
                event: "mcp_tool_outcome",
                requestId,
                ...outcome,
            });
        },
    });
    let ready = false;
    let closed = false;

    async function currentReadiness(): Promise<boolean> {
        return ready && !closed && (await readiness());
    }

    return {
        async fetch(request): Promise<Response> {
            const scope = startHttpRequest(request, publicUrl.pathname);
            let outcome: HttpRequestOutcome;
            try {
                const invalidHost = validateHost(request, allowedHosts);
                const invalidOrigin = validateOrigin(request, allowedOrigins);
                if (invalidHost) {
                    outcome = failedOutcome(invalidHost, "invalid_host");
                } else if (invalidOrigin) {
                    outcome = failedOutcome(invalidOrigin, "invalid_origin");
                } else {
                    outcome = await dispatchHttpRequest(request, scope, {
                        isClosed: () => closed,
                        isAcceptingMcp: () => ready,
                        currentReadiness,
                        metadataOptions,
                        mcpPost,
                    });
                }
            } catch {
                outcome = failedOutcome(
                    jsonResponse(500, { error: "internal_server_error" }),
                    "internal_error",
                );
            }
            return finishHttpRequest(logger, scope, outcome);
        },
        preflightIngress(request, ingressFailure): Response | undefined {
            const scope = startHttpRequest(request, publicUrl.pathname);
            const invalidHost = validateHost(request, allowedHosts);
            const invalidOrigin = validateOrigin(request, allowedOrigins);
            if (!invalidHost && !invalidOrigin && ingressFailure === undefined) {
                return undefined;
            }
            const failure = invalidHost
                ? "invalid_host"
                : invalidOrigin
                  ? "invalid_origin"
                  : (ingressFailure ?? "invalid_request");
            const response =
                invalidHost ??
                invalidOrigin ??
                (ingressFailure === "overloaded"
                    ? serviceOverloaded()
                    : ingressFailure === "request_too_large"
                      ? jsonResponse(413, { error: "request_too_large" })
                      : jsonResponse(400, { error: "invalid_request" }));
            return finishHttpRequest(logger, scope, failedOutcome(response, failure));
        },
        async close(): Promise<void> {
            if (closed) return;
            ready = false;
            closed = true;
            await mcpPost.close();
        },
        setReady(next): void {
            if (!closed) ready = next;
        },
    };
}

interface HttpRequestScope {
    request: Request;
    requestId: string;
    route: HttpRequestLog["route"];
    startedAt: number;
}

interface HttpRequestOutcome {
    response: Response;
    auth: AuthOutcome;
    failure?: HttpFailure;
}

interface HttpDispatchContext {
    isClosed(): boolean;
    isAcceptingMcp(): boolean;
    currentReadiness(): Promise<boolean>;
    metadataOptions: AuthMetadataOptions;
    mcpPost: ReturnType<typeof createMcpPostPipeline>;
}

function startHttpRequest(request: Request, mcpPath: string): HttpRequestScope {
    return {
        request,
        requestId: sanitizedRequestId(request.headers.get("x-request-id")),
        route: routeFor(new URL(request.url).pathname, mcpPath),
        startedAt: performance.now(),
    };
}

async function dispatchHttpRequest(
    request: Request,
    scope: HttpRequestScope,
    context: HttpDispatchContext,
): Promise<HttpRequestOutcome> {
    if (context.isClosed()) {
        return failedOutcome(
            jsonResponse(503, { error: "service_unavailable" }),
            "not_ready",
        );
    }
    if (scope.route === "oauth_metadata") {
        if (request.method !== "GET") {
            return failedOutcome(methodNotAllowed("GET"), "method_not_allowed");
        }
        return successfulOutcome(
            oauthMetadataResponse(request, context.metadataOptions) ??
                jsonResponse(404, { error: "not_found" }),
        );
    }
    if (scope.route === "health") {
        return request.method === "GET"
            ? successfulOutcome(jsonResponse(200, { status: "ok" }))
            : failedOutcome(methodNotAllowed("GET"), "method_not_allowed");
    }
    if (scope.route === "ready") {
        if (request.method !== "GET") {
            return failedOutcome(methodNotAllowed("GET"), "method_not_allowed");
        }
        return (await context.currentReadiness())
            ? successfulOutcome(jsonResponse(200, { status: "ready" }))
            : failedOutcome(
                  jsonResponse(503, { status: "not_ready" }),
                  "not_ready",
              );
    }
    if (scope.route !== "mcp") {
        return failedOutcome(jsonResponse(404, { error: "not_found" }), "not_found");
    }
    if (request.method !== "POST") {
        return failedOutcome(methodNotAllowed("POST"), "method_not_allowed");
    }
    if (!context.isAcceptingMcp()) {
        return failedOutcome(
            jsonResponse(503, { error: "service_unavailable" }),
            "not_ready",
        );
    }
    return await context.mcpPost.handle(
        request,
        scope.requestId,
        () => context.currentReadiness(),
    );
}

function successfulOutcome(response: Response): HttpRequestOutcome {
    return { response, auth: "not_applicable" };
}

function failedOutcome(
    response: Response,
    failure: HttpFailure,
    auth: AuthOutcome = "not_applicable",
): HttpRequestOutcome {
    return { response, auth, failure };
}

function validateHost(request: Request, allowed: ReadonlySet<string>): Response | undefined {
    const value = request.headers.get("host")?.toLowerCase();
    if (!value || !allowed.has(value)) {
        return jsonResponse(403, { error: "invalid_host" });
    }
    return undefined;
}

function validateOrigin(
    request: Request,
    allowed: ReadonlySet<string>,
): Response | undefined {
    const value = request.headers.get("origin");
    if (value === null) return undefined;
    let canonical: string;
    try {
        canonical = requireOrigin(value);
    } catch {
        return jsonResponse(403, { error: "invalid_origin" });
    }
    return allowed.has(canonical)
        ? undefined
        : jsonResponse(403, { error: "invalid_origin" });
}

function withResponseHeaders(
    response: Response,
    requestId: string,
    route: HttpRequestLog["route"],
    method: string,
): Response {
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    if (route === "oauth_metadata" && method === "GET" && response.ok) {
        headers.set("cache-control", "public, max-age=300");
    } else {
        headers.set("cache-control", "no-store");
    }
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function finishHttpRequest(
    logger: RemoteLogger,
    scope: HttpRequestScope,
    outcome: HttpRequestOutcome,
): Response {
    if (outcome.response.status >= 400 && scope.request.body) {
        cancelStreamWithoutWaiting(scope.request.body);
    }
    const finalResponse = withResponseHeaders(
        outcome.response,
        scope.requestId,
        scope.route,
        scope.request.method,
    );
    emitRemoteLog(logger, {
        event: "http_request",
        requestId: scope.requestId,
        method: scope.request.method,
        route: scope.route,
        status: finalResponse.status,
        durationMs: Math.max(0, Math.round(performance.now() - scope.startedAt)),
        auth: outcome.auth,
        ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
    });
    return finalResponse;
}

function emitRemoteLog(logger: RemoteLogger, entry: RemoteLogEntry): void {
    try {
        const pending = logger(entry);
        if (pending !== undefined) void pending.catch(() => {});
    } catch {
        // Observability is best effort and never owns the HTTP outcome.
    }
}

function routeFor(pathname: string, mcpPath: string): HttpRequestLog["route"] {
    if (pathname === mcpPath) return "mcp";
    if (pathname === "/healthz") return "health";
    if (pathname === "/readyz") return "ready";
    if (
        pathname === "/.well-known/oauth-authorization-server" ||
        pathname === `/.well-known/oauth-protected-resource${mcpPath}`
    ) {
        return "oauth_metadata";
    }
    return "unknown";
}

function jsonResponse(status: number, body: Record<string, string>): Response {
    return Response.json(body, { status });
}

function methodNotAllowed(allow: string): Response {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { "content-type": "application/json", allow },
    });
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

function requirePublicMcpUrl(value: URL): URL {
    const url = new URL(value);
    if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.href.includes("?") ||
        url.href.includes("#") ||
        url.pathname !== "/mcp"
    ) {
        throw new Error("public URL must be an exact HTTPS URL ending in /mcp");
    }
    return url;
}

function requireIssuer(value: string): string {
    return requireExactHttpsUrl(value, "trusted issuer").href;
}

function requireOAuthMetadata(
    metadata: AuthMetadataOptions["oauthMetadata"],
    trustedIssuer: string,
): AuthMetadataOptions["oauthMetadata"] {
    if (metadata.issuer !== trustedIssuer) {
        throw new Error("OAuth metadata issuer must exactly match the trusted issuer");
    }
    for (const [name, value] of Object.entries(metadata)) {
        if (!name.endsWith("_endpoint") && !name.endsWith("_uri")) continue;
        if (typeof value !== "string") {
            throw new TypeError(`OAuth metadata ${name} must be a canonical HTTPS URL`);
        }
        requireExactHttpsUrl(value, `OAuth metadata ${name}`);
    }
    return metadata;
}

function requireHostAllowlist(
    values: readonly string[],
    publicHost: string,
): ReadonlySet<string> {
    if (values.length === 0) throw new Error("Host allowlist must not be empty");
    const hosts = new Set(values.map((value) => requireHost(value)));
    if (!hosts.has(publicHost.toLowerCase())) {
        throw new Error("Host allowlist must contain the exact public URL host");
    }
    return hosts;
}

function requireHost(value: string): string {
    const normalized = value.toLowerCase();
    let url: URL;
    try {
        url = new URL(`https://${normalized}/`);
    } catch {
        throw new Error("Host allowlist entries must be exact hostname[:port] values");
    }
    if (
        value !== value.trim() ||
        url.host !== normalized ||
        url.username ||
        url.password ||
        url.pathname !== "/"
    ) {
        throw new Error("Host allowlist entries must be exact hostname[:port] values");
    }
    return normalized;
}

function requireOrigin(value: string): string {
    const url = new URL(value);
    if (
        (url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.origin !== value
    ) {
        throw new Error("Origin allowlist entries must be exact serialized origins");
    }
    return url.origin;
}

function sanitizedRequestId(value: string | null): string {
    return value !== null && REQUEST_ID.test(value) ? value : randomUUID();
}

async function boundedReadiness(check: () => boolean | Promise<boolean>): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            Promise.resolve().then(check).then(Boolean, () => false),
            new Promise<false>((resolve) => {
                timeout = setTimeout(() => {
                    resolve(false);
                }, READINESS_TIMEOUT_MS);
                timeout.unref();
            }),
        ]);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}

function cachedReadiness(
    check: (() => boolean | Promise<boolean>) | undefined,
    cacheMs: number,
): () => Promise<boolean> {
    if (!Number.isSafeInteger(cacheMs) || cacheMs < 0 || cacheMs > 60_000) {
        throw new Error("readiness cache must be between 0 and 60000 milliseconds");
    }
    if (check === undefined) return async () => true;
    let cached = false;
    let freshUntil = 0;
    let inFlight: Promise<boolean> | undefined;
    return async () => {
        if (performance.now() < freshUntil) return cached;
        if (inFlight) return await inFlight;
        const probe = boundedReadiness(check)
            .then((result) => {
                cached = result;
                freshUntil = performance.now() + cacheMs;
                return result;
            })
            .finally(() => {
                if (inFlight === probe) inFlight = undefined;
            });
        inFlight = probe;
        return await probe;
    };
}

function writeStructuredLog(entry: RemoteLogEntry): void {
    process.stderr.write(`${JSON.stringify(entry)}\n`);
}
