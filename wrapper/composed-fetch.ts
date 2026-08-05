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

/** The npm package name paired with the generated package-version constant
 *  in the default User-Agent string. `generate-package-versions.mjs` derives
 *  that constant from `wrapper/package.json`; do not hand-edit it. */
const PACKAGE_NAME = "clockify-sdk-ts-115" as const;

/** Header name carrying the per-request UUID. */
export const REQUEST_ID_HEADER = "X-Request-Id" as const;

/** Response-side fallback used when Clockify does not echo X-Request-Id. */
const SERVER_CORRELATION_ID_HEADER = "x-amz-cf-id" as const;

/** Header name carrying the SDK + runtime advertisement. */
export const USER_AGENT_HEADER = "User-Agent" as const;

/** Default retry behavior mirrors the generated client's retry layer:
 *  408/429/5xx retryable on read-only methods only, exponential
 *  backoff with ±10% jitter (factor 0.2), honors `Retry-After` and
 *  `X-RateLimit-Reset`, max delay 60s.
 *
 *  Mutation-safety model (RETRY-001): only read-only methods are retried
 *  by default. GET/HEAD/OPTIONS are retryable; PUT/DELETE/POST/PATCH are
 *  NOT, because a 5xx or transport timeout on a write is ambiguous -- the
 *  server may have already applied it, and a blind retry could
 *  double-apply it. Opt PUT/DELETE back in explicitly via
 *  `retryPolicy.retryableMethods`. POST/PATCH excluded from both the default
 *  and opt-in retry sets in 1.0 -- this
 *  mirrors the generated client's own `retryMutationMethods` opt-in. */
const DEFAULT_RETRY_POLICY: Required<Omit<RetryPolicy, "computeDelay">> = {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 60_000,
    jitter: 0.2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    retryableMethods: ["GET", "HEAD", "OPTIONS"],
};

/** Configurable retry behavior. Pass `false` to disable retries
 *  entirely. Omit to keep the generated client's retry layer untouched. */
export interface RetryPolicy {
    /** Max retry attempts in addition to the initial request. Default `2`. */
    maxRetries?: number;
    /** Initial backoff delay (ms). Default `1000`. */
    initialDelayMs?: number;
    /** Delay cap (ms). Applied to the exponential backoff BEFORE jitter and to
     *  the `Retry-After` / `X-RateLimit-Reset` delays AFTER it, so a jittered
     *  exponential delay may run up to `jitter/2` over this value (+10% at the
     *  default jitter). Default `60000`. */
    maxDelayMs?: number;
    /** Jitter factor `[0, 1]`. Default `0.2` — a symmetric ±(jitter/2)
     *  spread on backoff delays (±10% at the default); the
     *  `X-RateLimit-Reset` path applies up to +jitter (+20%). */
    jitter?: number;
    /** Status codes that trigger a retry. Default `[408, 429, 500, 502, 503, 504]`. */
    retryableStatusCodes?: readonly number[];
    /** HTTP methods that may be retried. Default read-only methods only
     *  (`GET`, `HEAD`, `OPTIONS`); `PUT`/`DELETE` are excluded by default
     *  (RETRY-001) -- add them here to opt in, mirroring the generated
     *  client's `retryMutationMethods` flag. `POST`/`PATCH` are rejected at
     *  construction time: a 5xx or transport error on either write is
     *  ambiguous -- the server may have already applied it, and neither
     *  method is idempotent enough to retry blindly in 1.0. */
    retryableMethods?: readonly string[];
    /** Custom delay calculator. Receives 0-indexed attempt + optional
     *  response (undefined on network errors). Return the wait time in
     *  ms. Default: exponential backoff whose BASE is capped at
     *  `maxDelayMs` and then jittered (the realised delay may exceed the
     *  cap by up to `jitter/2`), honoring `Retry-After` /
     *  `X-RateLimit-Reset` — those two are capped after jitter. */
    computeDelay?: (attempt: number, response: Response | undefined) => number;
}

/** Per-request lifecycle context passed to hooks. */
export interface RequestContext {
    /** Final URL after any wrapping. */
    url: string;
    /** Uppercased HTTP method. */
    method: string;
    /** Request headers as a `Headers` instance. Without a `retryPolicy`
     *  this is the live request-header object — `beforeRequest` mutations
     *  reach the wire. With a `retryPolicy` configured, headers are
     *  snapshotted into the retry template before hooks run: mutations
     *  here are visible to later hooks but are NOT reflected in the
     *  dispatched request. */
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
    /** The response or error that triggered the retry. On the response branch
     *  the body stream has already been released before this hook runs, so
     *  `cause.response` is no longer readable — `.text()`/`.json()` will reject
     *  or resolve empty. Only status/headers are usable here; read the body in
     *  an `afterResponse` hook, which runs before the release. */
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
        const template = buildRequestTemplate(input, finalInit);
        assertSignalNotAborted(template.signal);
        // Eager clone: fail closed before hooks/dispatch when a retryable
        // body cannot be replayed (Request.clone() throws; result unused).
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
 * Utility: extracts the request or server correlation ID from a thrown
 * `ClockifyApiError`'s raw response headers (or `undefined` if the error
 * doesn't carry one). Clockify currently does not echo `X-Request-Id`; the
 * CloudFront `x-amz-cf-id` fallback is therefore the useful live response ID.
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
        return headers.get(REQUEST_ID_HEADER) ?? headers.get(SERVER_CORRELATION_ID_HEADER) ?? undefined;
    }
    for (const wanted of [REQUEST_ID_HEADER, SERVER_CORRELATION_ID_HEADER]) {
        for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === wanted.toLowerCase() && typeof v === "string") {
                return v;
            }
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
        // Nothing downstream can reach this body: RedirectNotAllowedError does
        // not carry the Response, the onError context has no `response` field,
        // and runWithRetries drops its reference in the catch. Release the
        // stream now instead of at GC — this is the only Response here that is
        // neither returned to the caller nor cancelled.
        // `void` + `.catch`, never `await`: assertNotRedirect must stay
        // synchronous, or both call sites would reorder their hook sequence.
        void response.body?.cancel().catch(() => undefined);
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
    user: RetryPolicy,
): Required<Omit<RetryPolicy, "computeDelay">> & Pick<RetryPolicy, "computeDelay"> {
    const retryableMethods = (
        user.retryableMethods ?? DEFAULT_RETRY_POLICY.retryableMethods
    ).map((method) => method.toUpperCase());
    const unsafeMethod = retryableMethods.find(
        (method) => method === "POST" || method === "PATCH",
    );
    if (unsafeMethod !== undefined) {
        throw new TypeError(
            `composedFetch: retryableMethods cannot include ${unsafeMethod}; POST and PATCH retries are not supported because their outcome may be ambiguous.`,
        );
    }

    return {
        maxRetries: user.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
        initialDelayMs: user.initialDelayMs ?? DEFAULT_RETRY_POLICY.initialDelayMs,
        maxDelayMs: user.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs,
        jitter: user.jitter ?? DEFAULT_RETRY_POLICY.jitter,
        retryableStatusCodes:
            user.retryableStatusCodes ?? DEFAULT_RETRY_POLICY.retryableStatusCodes,
        retryableMethods,
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

        try {
            // Inside the try on purpose: an abort that lands WHILE an async
            // `beforeRequest` hook is awaited must still route through the
            // `onError` path (otel-hooks.ts ends its span there), matching the
            // single-shot path. `abortable`'s own pre-check keeps the
            // zero-dispatch guarantee, and the post-loop
            // `if (template.signal.aborted) throw abortReason(...)` rethrows the
            // identical reason object, so the rejection value is unchanged.
            assertSignalNotAborted(template.signal);
            response = await abortable(template.signal, () => baseFetch(template.clone()));
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
            // do not carry an AbortError name (e.g. controller.abort(new Error())).
            if (template.signal.aborted) throw abortReason(template.signal);
            if (isAbortError(error)) {
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
            // Body cancellation is best-effort cleanup: an `afterResponse` hook
            // that read the body (e.g. `await ctx.response.json()`) leaves the
            // stream locked, and letting that TypeError escape would abort the
            // whole request instead of retrying — contradicting the
            // "hooks never block the request" contract above. An abort that
            // raced the cancel is still surfaced by the next line, which
            // rethrows the identical `signal.reason` object.
            await abortable(template.signal, () => response.body?.cancel()).catch(() => undefined);
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
    if (!Number.isInteger(policy.maxRetries) || policy.maxRetries < 0) {
        throw new TypeError("composedFetch: maxRetries must be a finite integer greater than or equal to zero");
    }
}

function assertSignalNotAborted(signal: AbortSignal): void {
    if (signal.aborted) throw abortReason(signal);
}

function abortable<T>(signal: AbortSignal, start: () => T | PromiseLike<T>): Promise<T> {
    // AbortSignal.reason is intentionally `unknown`: the public contract preserves
    // primitive reasons instead of wrapping them in an Error.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const finish = (complete: () => void): void => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", onAbort);
            complete();
        };
        const onAbort = (): void => {
            finish(() => {
                // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                reject(abortReason(signal));
            });
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
            onAbort();
            return;
        }
        let started: T | PromiseLike<T>;
        try {
            started = start();
        } catch (cause) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            finish(() => { reject(cause); });
            return;
        }
        Promise.resolve(started).then(
            (value) => {
                finish(() => {
                    resolve(value);
                });
            },
            (cause: unknown) => {
                finish(() => {
                    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                    reject(cause);
                });
            },
        );
    });
}

function toError(value: unknown): Error {
    // Keep the original rejection reachable as `cause`: without a retryPolicy,
    // runSingleAttempt rethrows a structured non-Error value untouched, so
    // rebuilding it as `Error(String(value))` here would make the SAME custom
    // fetch lose its diagnostic payload to "[object Object]" on the retry path.
    return value instanceof Error ? value : new Error(String(value), { cause: value });
}

function isAbortError(value: unknown): boolean {
    // Constructor identity is not stable across realms or fetch polyfills.
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { name?: unknown }).name === "AbortError"
    );
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

function sleep(ms: number, signal: AbortSignal): Promise<void> {
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
