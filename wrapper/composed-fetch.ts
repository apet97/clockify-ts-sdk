/**
 * Composed `fetch` wrapper for `clockify-sdk-ts-115`.
 *
 * Wraps the user's `fetch` (or `globalThis.fetch`) with four
 * orthogonal concerns, each opt-out:
 *
 * 1. **User-Agent** — `clockify-sdk-ts-115/<ver> (Node.js <ver>;
 *    <platform> <arch>)` injected on every request. Disable with
 *    `userAgent: false`; override with `userAgent: "my-string"`.
 * 2. **X-Request-Id** — UUID v4 injected per request (uses
 *    `node:crypto.randomUUID()`). Disable with `requestId: false`;
 *    supply your own generator with `requestId: () => myId()`.
 * 3. **Hooks** — `beforeRequest`, `afterResponse`, `onError`,
 *    `onRetry` callbacks invoked at lifecycle boundaries.
 *    Hooks may be sync or async; their rejections do NOT propagate
 *    (best-effort; failure of a hook never blocks the request).
 * 4. **Retry policy** — configurable `maxRetries`,
 *    `initialDelayMs`, `maxDelayMs`, `jitter`,
 *    `retryableStatusCodes`, `retryableMethods`, and `computeDelay`.
 *    Honors `Retry-After` + `X-RateLimit-Reset` headers (matches
 *    the generated client's default behavior). When `retryPolicy` is set,
 *    `createClockifyClient` automatically sets the generated client's
 *    `maxRetries: 0` to avoid nested retry loops.
 *
 * `createClockifyClient` wraps every constructed client with this
 * fetcher using sensible defaults (UA + req-id on, no retry layer
 * beyond the generated client's, no hooks). Direct callers can use `composedFetch`
 * via the `clockify-sdk-ts-115/composed-fetch` subpath for non-Clockify
 * fetch needs (e.g. testing, observability piping, multi-SDK
 * aggregation).
 */
import { randomUUID } from "node:crypto";
import { platform, arch } from "node:os";

import { PACKAGE_VERSION } from "./generated/version.js";

/** The npm package version baked into the User-Agent string. This line
 *  is updated automatically on release by release-please via the
 *  `x-release-please-version` marker below (see `release-please-config.json`,
 *  which lists this file under `extra-files`). Do not remove the marker. */
const PACKAGE_NAME = "clockify-sdk-ts-115" as const;

/** Header name carrying the per-request UUID. */
export const REQUEST_ID_HEADER = "X-Request-Id" as const;

/** Header name carrying the SDK + runtime advertisement. */
export const USER_AGENT_HEADER = "User-Agent" as const;

/** Default retry behavior mirrors the generated client's retry layer:
 *  408/429/5xx retryable on idempotent methods only, exponential
 *  backoff with 20% jitter, honors `Retry-After` and
 *  `X-RateLimit-Reset`, max delay 60s.
 *
 *  Mutation-safety model: only safe/idempotent methods are retried by
 *  default. GET/HEAD/OPTIONS/PUT/DELETE are retryable; POST and PATCH
 *  are NOT, because a 5xx or transport timeout on a write may land
 *  server-side mid-mutation and a blind retry could double-apply it. */
const DEFAULT_RETRY_POLICY: Required<Omit<RetryPolicy, "computeDelay">> = {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 60_000,
    jitter: 0.2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableMethods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"],
};

/** Configurable retry behavior. Pass `false` to disable retries
 *  entirely. Omit to keep the generated client's retry layer untouched. */
export interface RetryPolicy {
    /** Max retry attempts in addition to the initial request. Default `2`. */
    maxRetries?: number;
    /** Initial backoff delay (ms). Default `1000`. */
    initialDelayMs?: number;
    /** Maximum delay cap (ms). Default `60000`. */
    maxDelayMs?: number;
    /** Jitter factor `[0, 1]`. Default `0.2` (±20%). */
    jitter?: number;
    /** Status codes that trigger a retry. Default `[408, 429, 500, 502, 503, 504]`. */
    retryableStatusCodes?: readonly number[];
    /** HTTP methods that may be retried. Default idempotent methods only
     *  (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`). POST/PATCH excluded
     *  by default because they're not idempotent on the server side.
     *  ⚠️ Only add `POST`/`PATCH` here if the specific operation is
     *  guaranteed idempotent and safe to retry on a 5xx / transport
     *  error — a server error can occur after the write was applied. */
    retryableMethods?: readonly string[];
    /** Custom delay calculator. Receives 0-indexed attempt + optional
     *  response (undefined on network errors). Return the wait time in
     *  ms. Default: exponential backoff with jitter, capped by
     *  `maxDelayMs`, honoring `Retry-After` / `X-RateLimit-Reset`. */
    computeDelay?: (attempt: number, response: Response | undefined) => number;
}

/** Per-request lifecycle context passed to hooks. */
export interface RequestContext {
    /** Final URL after any wrapping. */
    url: string;
    /** Uppercased HTTP method. */
    method: string;
    /** Request headers as a `Headers` instance (mutable copy). */
    headers: Headers;
    /** 0-indexed attempt number (0 = initial; 1+ = retries). */
    attempt: number;
    /** The UUID for this request (after injection, if enabled). */
    requestId: string | undefined;
}

/** Context passed to `afterResponse`. */
export interface ResponseContext extends RequestContext {
    response: Response;
    /** Wall-clock duration of THIS attempt in ms. */
    durationMs: number;
}

/** Context passed to `onError`. */
export interface ErrorContext extends RequestContext {
    error: unknown;
    /** Wall-clock duration of THIS attempt in ms. */
    durationMs: number;
}

/** Context passed to `onRetry` between attempts. */
export interface RetryContext extends RequestContext {
    /** The response or error that triggered the retry. */
    cause: { response: Response } | { error: unknown };
    /** The attempt number the next call will be (1-indexed). */
    nextAttempt: number;
    /** The delay in ms before the next attempt. */
    delayMs: number;
}

/** A single numeric metric sample emitted via {@link ComposedFetchHooks.onMetric}. */
export interface FetchMetric {
    /** Stable dotted metric name, such as `request.duration` or `retry.count`. */
    name: string;
    /** Numeric sample value. Durations are milliseconds. */
    value: number;
    /** Low-cardinality dimensions suitable for metrics backends. */
    attributes?: Record<string, string | number>;
}

/** Lifecycle hook set. Hooks are best-effort: any rejection inside a
 *  hook is logged via `console.warn` but does NOT block the request. */
export interface ComposedFetchHooks {
    beforeRequest?: (ctx: RequestContext) => void | Promise<void>;
    afterResponse?: (ctx: ResponseContext) => void | Promise<void>;
    onError?: (ctx: ErrorContext) => void | Promise<void>;
    onRetry?: (ctx: RetryContext) => void | Promise<void>;
    /** Emit numeric samples for request duration, retry scheduling, and
     *  rate-limit remaining headers. Zero-cost when unset. */
    onMetric?: (metric: FetchMetric) => void | Promise<void>;
}

/** Options for {@link composedFetch}. */
export interface ComposedFetchOptions {
    /** Underlying fetch implementation. Default: `globalThis.fetch`. */
    fetch?: typeof fetch;
    /** User-Agent injection. `true` (default): inject the default UA
     *  string. `false`: do not touch the UA header (caller controls).
     *  string: use this exact value. */
    userAgent?: boolean | string;
    /** X-Request-Id injection. `true` (default): inject a UUID v4 per
     *  request via `node:crypto.randomUUID()`. `false`: do not inject.
     *  function: call to generate the ID per request. If the caller
     *  already set an `X-Request-Id` header, that value is respected. */
    requestId?: boolean | (() => string);
    /** Lifecycle hooks. Default: none. */
    hooks?: ComposedFetchHooks;
    /** Retry policy. `undefined` (default): no wrapper-side retry —
     *  composedFetch is a single-shot wrapper. `false`: explicit no-op
     *  (semantically identical to undefined; provided for symmetry).
     *  object: enable retry with the merged-with-defaults policy. */
    retryPolicy?: RetryPolicy | false;
}

/** Returns the default User-Agent string for this SDK build. */
export function defaultUserAgent(): string {
    return `${PACKAGE_NAME}/${PACKAGE_VERSION} (Node.js ${process.version}; ${platform()} ${arch()})`;
}

/** Generates a UUID v4 via `node:crypto.randomUUID()`. */
export function generateRequestId(): string {
    return randomUUID();
}

/**
 * Builds a `fetch`-compatible function that wraps an underlying
 * fetcher with four orthogonal concerns (User-Agent, X-Request-Id,
 * lifecycle hooks, optional retry policy). The returned function is
 * shape-compatible with `BaseClientOptions.fetch` — pass it to
 * `createClockifyClient({ fetch: composedFetch({...}) })` or use it
 * directly anywhere a `fetch`-typed callable is accepted.
 *
 * Pass `{}` to get just the defaults (UA + UUID req-id, no retries,
 * no hooks).
 *
 * @example
 * ```ts
 * import { composedFetch } from "clockify-sdk-ts-115/composed-fetch";
 *
 * const myFetch = composedFetch({
 *   hooks: {
 *     beforeRequest: ({ method, url, requestId }) =>
 *       console.log(`→ ${method} ${url} [${requestId}]`),
 *     afterResponse: ({ response, durationMs }) =>
 *       console.log(`← ${response.status} (${durationMs}ms)`),
 *   },
 *   retryPolicy: { maxRetries: 5, retryableStatusCodes: [500, 502, 503] },
 * });
 *
 * const res = await myFetch("https://api.example.com/health");
 * ```
 *
 * @throws TypeError if no `fetch` implementation is available — pass
 *   `options.fetch` explicitly when running outside Node 18+/browsers.
 */
export function composedFetch(options: ComposedFetchOptions = {}): typeof fetch {
    const baseFetch = options.fetch ?? globalThis.fetch;
    if (typeof baseFetch !== "function") {
        throw new TypeError(
            "composedFetch: no `fetch` implementation found. Pass `options.fetch` or run on Node 18+ / a browser.",
        );
    }

    const userAgentValue = resolveUserAgent(options.userAgent);
    const requestIdFn = resolveRequestIdFn(options.requestId);
    const hooks = options.hooks;
    const retryPolicy = options.retryPolicy ? mergeRetryPolicy(options.retryPolicy) : undefined;

    return async function composedFetchImpl(input, init) {
        const initHeaders = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const method = (
            init?.method ?? (input instanceof Request ? input.method : "GET")
        ).toUpperCase();

        // Inject User-Agent if not already set.
        if (userAgentValue != null && !initHeaders.has(USER_AGENT_HEADER)) {
            initHeaders.set(USER_AGENT_HEADER, userAgentValue);
        }

        // Inject X-Request-Id if not already set.
        let requestId: string | undefined;
        if (initHeaders.has(REQUEST_ID_HEADER)) {
            requestId = initHeaders.get(REQUEST_ID_HEADER) ?? undefined;
        } else if (requestIdFn != null) {
            requestId = requestIdFn();
            initHeaders.set(REQUEST_ID_HEADER, requestId);
        }

        // Default redirect handling to `manual` so the underlying fetch never
        // transparently follows a 3xx — which would re-send the auth headers
        // (`X-Api-Key` / `X-Addon-Token`) to the redirect target, potentially a
        // host outside the trusted Clockify allowlist. Every legitimate
        // Clockify endpoint answers with a direct 2xx/4xx, so a redirect is
        // surfaced as an explicit error below (see `assertNotRedirect`). A
        // caller that deliberately sets `redirect` keeps full control.
        const effectiveRedirect: RequestRedirect =
            init?.redirect ?? (input instanceof Request ? input.redirect : "manual");
        const finalInit: RequestInit = {
            ...init,
            headers: initHeaders,
            redirect: effectiveRedirect,
        };

        if (retryPolicy == null) {
            // No wrapper-side retry — single shot.
            const ctx: RequestContext = {
                url,
                method,
                headers: initHeaders,
                attempt: 0,
                requestId,
            };
            return await runSingleAttempt(
                baseFetch,
                input,
                finalInit,
                ctx,
                hooks,
                effectiveRedirect,
            );
        }

        validateRetryPolicy(retryPolicy);
        if (
            input instanceof Request &&
            retryPolicy.maxRetries > 0 &&
            retryPolicy.retryableMethods.includes(method)
        ) {
            input.clone();
        }
        const template = buildRequestTemplate(input, finalInit);
        assertSignalNotAborted(template.signal);
        if (retryPolicy.maxRetries > 0 && retryPolicy.retryableMethods.includes(method)) {
            template.clone();
        }
        return await runWithRetries(
            baseFetch,
            template,
            retryPolicy,
            hooks,
            {
                url,
                method,
                headers: initHeaders,
                requestId,
            },
        );
    } satisfies typeof fetch;
}

/**
 * Utility: extracts an `X-Request-Id` value from a thrown
 * `ClockifyApiError`'s raw response headers (or `undefined` if the
 * error doesn't carry one). Stainless-style helper for log
 * correlation.
 *
 * @example
 * ```ts
 * try { await client.tags.list({...}); }
 * catch (err) {
 *   const id = getRequestIdFromError(err);
 *   logger.error({ requestId: id, message: (err as Error).message });
 * }
 * ```
 */
export function getRequestIdFromError(err: unknown): string | undefined {
    if (err == null || typeof err !== "object") return undefined;
    const raw = (err as { rawResponse?: { headers?: Headers | Record<string, string> } })
        .rawResponse;
    const headers = raw?.headers;
    if (headers == null) return undefined;
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
        return headers.get(REQUEST_ID_HEADER) ?? undefined;
    }
    for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === REQUEST_ID_HEADER.toLowerCase()) {
            return typeof v === "string" ? v : undefined;
        }
    }
    return undefined;
}

// ---------- internals ----------

/**
 * Error surfaced when a request receives a 3xx redirect that the wrapper did
 * not follow (the default `redirect: "manual"` policy). Internal-only — it is
 * thrown and propagates to the caller with a descriptive message, but is not a
 * public export, so the SDK's public-name surface is unchanged. Callers can
 * still branch on `err.name === "RedirectNotAllowedError"`.
 *
 * Every legitimate Clockify endpoint answers with a direct 2xx/4xx, so a
 * redirect off the trusted host is treated as an error rather than silently
 * followed — following it would re-send the auth headers (`X-Api-Key` /
 * `X-Addon-Token`) to the redirect target. With `redirect: "manual"` the
 * platform fetch returns the 3xx WITHOUT re-issuing the request, so those
 * headers were never re-sent before this error is raised.
 */
class RedirectNotAllowedError extends Error {
    /** The 3xx status code that was blocked. */
    readonly status: number;
    /** The `Location` header value, when present. */
    readonly location: string | undefined;
    constructor(status: number, location?: string) {
        super(
            `composedFetch: refusing to follow HTTP ${status} redirect` +
                (location != null ? ` to ${JSON.stringify(location)}` : "") +
                " — auth headers are not re-sent across redirects; every Clockify endpoint answers with a direct 2xx/4xx.",
        );
        this.name = "RedirectNotAllowedError";
        this.status = status;
        this.location = location;
    }
}

/**
 * Throw {@link RedirectNotAllowedError} when `response` is a 3xx and we asked
 * the underlying fetch NOT to follow it (`redirect: "manual"`). With manual
 * redirect handling the platform fetch returns the 3xx without re-issuing the
 * request, so the auth headers were never re-sent — surfacing it as an error
 * (instead of returning the bare 3xx) keeps callers from mistaking it for a
 * normal response. When the caller opted into `redirect: "follow"` the fetch
 * already followed it and a residual 3xx is left alone; `redirect: "error"`
 * makes the platform fetch reject before we ever see a response.
 */
function assertNotRedirect(response: Response, redirect: RequestRedirect): void {
    if (redirect !== "manual") return;
    if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("Location") ?? undefined;
        throw new RedirectNotAllowedError(response.status, location);
    }
}

function resolveUserAgent(opt: boolean | string | undefined): string | null {
    if (opt === false) return null;
    if (typeof opt === "string") return opt;
    return defaultUserAgent();
}

function resolveRequestIdFn(opt: boolean | (() => string) | undefined): (() => string) | null {
    if (opt === false) return null;
    if (typeof opt === "function") return opt;
    return generateRequestId;
}

function mergeRetryPolicy(
    user: RetryPolicy | false,
): Required<Omit<RetryPolicy, "computeDelay">> & Pick<RetryPolicy, "computeDelay"> {
    if (user === false) return { ...DEFAULT_RETRY_POLICY, maxRetries: 0 };
    return {
        maxRetries: user.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
        initialDelayMs: user.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
        maxDelayMs: user.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
        jitter: user.jitter ?? DEFAULT_RETRY_POLICY.jitter,
        retryableStatusCodes:
            user.retryableStatusCodes ?? DEFAULT_RETRY_POLICY.retryableStatusCodes,
        retryableMethods: (user.retryableMethods ?? DEFAULT_RETRY_POLICY.retryableMethods).map(
            (m) => m.toUpperCase(),
        ),
        ...(user.computeDelay !== undefined ? { computeDelay: user.computeDelay } : {}),
    };
}

async function runSingleAttempt(
    baseFetch: typeof fetch,
    input: RequestInfo | URL,
    init: RequestInit,
    ctx: RequestContext,
    hooks: ComposedFetchHooks | undefined,
    redirect: RequestRedirect,
): Promise<Response> {
    const start = Date.now();
    await safeHook(hooks?.beforeRequest, ctx);
    try {
        const response = await baseFetch(input, init);
        // A blocked redirect is surfaced as an error, never returned: with
        // `redirect: "manual"` the underlying fetch did NOT follow it, so the
        // auth headers were not re-sent to the target. Route through the catch
        // below so `onError` fires and error metrics are emitted.
        assertNotRedirect(response, redirect);
        const durationMs = Date.now() - start;
        await safeHook(hooks?.afterResponse, { ...ctx, response, durationMs });
        await emitResponseMetrics(hooks, ctx, response, durationMs);
        return response;
    } catch (error) {
        const durationMs = Date.now() - start;
        await safeHook(hooks?.onError, { ...ctx, error, durationMs });
        await emitErrorMetrics(hooks, ctx, durationMs);
        throw error;
    }
}

async function runWithRetries(
    baseFetch: typeof fetch,
    template: Request,
    policy: ReturnType<typeof mergeRetryPolicy>,
    hooks: ComposedFetchHooks | undefined,
    base: Omit<RequestContext, "attempt">,
): Promise<Response> {
    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
        assertSignalNotAborted(template.signal);
        const ctx: RequestContext = { ...base, attempt };
        const start = Date.now();
        let response: Response | undefined;
        let error: unknown;

        await safeHook(hooks?.beforeRequest, ctx);
        assertSignalNotAborted(template.signal);

        try {
            response = await baseFetch(template.clone());
            // A blocked redirect is terminal, not transient: surface it as an
            // error (so auth headers are never re-sent to the target) and do
            // NOT retry. Converting to the error branch routes it through the
            // existing `onError` path and the post-loop `throw`.
            assertNotRedirect(response, template.redirect);
        } catch (e) {
            error = e;
            response = undefined;
        }

        const durationMs = Date.now() - start;

        if (error != null) {
            await safeHook(hooks?.onError, { ...ctx, error, durationMs });
            await emitErrorMetrics(hooks, ctx, durationMs);
            lastError = error;
            // A blocked redirect is never retried, even on an otherwise
            // retryable method — it is a deliberate security stop, not a
            // transient transport failure.
            if (error instanceof RedirectNotAllowedError) throw error;
            // A cancelled/timed-out request is terminal, not a transient
            // transport error: never fire onRetry / retry.count for it (onError
            // already fired). Mirrors the generated layer's shouldRetryError,
            // which returns false for AbortError. The init.signal?.aborted clause
            // is the workhorse — it also catches custom abort reasons that
            // surface as a non-DOMException Error (e.g. controller.abort(new Error())).
            if (template.signal.aborted) throw abortReason(template.signal);
            if (
                (typeof DOMException !== "undefined" &&
                    error instanceof DOMException &&
                    error.name === "AbortError")
            ) {
                throw toError(error);
            }
            if (attempt >= policy.maxRetries || !policy.retryableMethods.includes(base.method)) {
                throw toError(error);
            }
            const delayMs = computeRetryDelay(attempt, undefined, policy);
            await safeHook(hooks?.onRetry, {
                ...ctx,
                cause: { error },
                nextAttempt: attempt + 1,
                delayMs,
            });
            await emitRetryMetric(hooks, base.method, attempt + 1, "network_error");
            await sleep(delayMs, template.signal);
            continue;
        }

        if (response != null) {
            await safeHook(hooks?.afterResponse, { ...ctx, response, durationMs });
            await emitResponseMetrics(hooks, ctx, response, durationMs);
            lastResponse = response;
            if (
                attempt >= policy.maxRetries ||
                !policy.retryableStatusCodes.includes(response.status) ||
                !policy.retryableMethods.includes(base.method)
            ) {
                return response;
            }
            await response.body?.cancel();
            assertSignalNotAborted(template.signal);
            const delayMs = computeRetryDelay(attempt, response, policy);
            await safeHook(hooks?.onRetry, {
                ...ctx,
                cause: { response },
                nextAttempt: attempt + 1,
                delayMs,
            });
            await emitRetryMetric(hooks, base.method, attempt + 1, String(response.status));
            await sleep(delayMs, template.signal);
        }
    }

    if (lastResponse != null) return lastResponse;
    throw lastError != null
        ? toError(lastError)
        : new Error("composedFetch: exhausted retries with no response and no error");
}

function buildRequestTemplate(input: RequestInfo | URL, init: RequestInit): Request {
    if (!(input instanceof Request)) return new Request(input, init);
    return new Request(input, {
        method: input.method,
        cache: input.cache,
        credentials: input.credentials,
        integrity: input.integrity,
        keepalive: input.keepalive,
        mode: input.mode,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        signal: input.signal,
        ...init,
    });
}

function validateRetryPolicy(policy: ReturnType<typeof mergeRetryPolicy>): void {
    if (
        !Number.isFinite(policy.maxRetries) ||
        !Number.isInteger(policy.maxRetries) ||
        policy.maxRetries < 0
    ) {
        throw new TypeError("composedFetch: maxRetries must be a finite integer greater than or equal to zero");
    }
}

function assertSignalNotAborted(signal: AbortSignal): void {
    if (signal.aborted) throw abortReason(signal);
}

function toError(value: unknown): Error {
    return value instanceof Error ? value : new Error(String(value));
}

function computeRetryDelay(
    attempt: number,
    response: Response | undefined,
    policy: ReturnType<typeof mergeRetryPolicy>,
): number {
    if (policy.computeDelay != null) {
        return Math.max(0, policy.computeDelay(attempt, response));
    }
    if (response != null) {
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter != null) {
            const seconds = Number.parseInt(retryAfter, 10);
            // Honor Retry-After: 0 (RFC 9110 delay-seconds=0 = retry immediately) as a
            // 0ms delay; only fall through to the HTTP-date / backoff paths for a
            // non-numeric or negative value.
            if (Number.isFinite(seconds) && seconds >= 0) {
                return Math.min(seconds * 1000, policy.maxDelayMs);
            }
            const dateMs = new Date(retryAfter).getTime() - Date.now();
            if (Number.isFinite(dateMs) && dateMs > 0) {
                return Math.min(dateMs, policy.maxDelayMs);
            }
        }
        const rateLimitReset = response.headers.get("X-RateLimit-Reset");
        if (rateLimitReset != null) {
            const reset = Number.parseInt(rateLimitReset, 10);
            if (Number.isFinite(reset)) {
                const dateMs = reset * 1000 - Date.now();
                if (dateMs > 0) {
                    return Math.min(applyJitter(dateMs, policy.jitter, true), policy.maxDelayMs);
                }
            }
        }
    }
    const exp = Math.min(policy.initialDelayMs * 2 ** attempt, policy.maxDelayMs);
    return applyJitter(exp, policy.jitter, false);
}

function applyJitter(delay: number, jitter: number, positiveOnly: boolean): number {
    if (jitter <= 0) return delay;
    if (positiveOnly) {
        return delay * (1 + Math.random() * jitter);
    }
    return delay * (1 + (Math.random() - 0.5) * jitter);
}

function sleep(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
    if (signal == null) return new Promise((resolve) => setTimeout(resolve, ms));
    // AbortSignal.reason is intentionally `unknown`: the public contract preserves
    // primitive reasons instead of wrapping them in an Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            signal.removeEventListener("abort", onAbort);
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(abortReason(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
    });
}

function abortReason(signal: AbortSignal): unknown {
    return signal.reason;
}

async function emitResponseMetrics(
    hooks: ComposedFetchHooks | undefined,
    ctx: RequestContext,
    response: Response,
    durationMs: number,
): Promise<void> {
    if (hooks?.onMetric == null) return;
    await safeHook(hooks.onMetric, {
        name: "request.duration",
        value: durationMs,
        attributes: {
            method: ctx.method,
            outcome: response.ok ? "success" : "http_error",
            status: response.status,
        },
    });
    const remaining = Number.parseInt(response.headers.get("X-RateLimit-Remaining") ?? "", 10);
    if (Number.isFinite(remaining)) {
        await safeHook(hooks.onMetric, {
            name: "rate_limit.remaining",
            value: remaining,
            attributes: { method: ctx.method },
        });
    }
}

async function emitErrorMetrics(
    hooks: ComposedFetchHooks | undefined,
    ctx: RequestContext,
    durationMs: number,
): Promise<void> {
    if (hooks?.onMetric == null) return;
    await safeHook(hooks.onMetric, {
        name: "request.duration",
        value: durationMs,
        attributes: { method: ctx.method, outcome: "error" },
    });
}

async function emitRetryMetric(
    hooks: ComposedFetchHooks | undefined,
    method: string,
    nextAttempt: number,
    reason: string,
): Promise<void> {
    if (hooks?.onMetric == null) return;
    await safeHook(hooks.onMetric, {
        name: "retry.count",
        value: nextAttempt,
        attributes: { method, reason },
    });
}

async function safeHook<T>(
    hook: ((arg: T) => void | Promise<void>) | undefined,
    arg: T,
): Promise<void> {
    if (hook == null) return;
    try {
        await hook(arg);
    } catch (err) {
        // Hooks are best-effort: log + continue.
        console.warn("clockify-sdk-ts-115 composedFetch hook failed:", err);
    }
}
