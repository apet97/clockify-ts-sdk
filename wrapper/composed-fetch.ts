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

/** The npm package version baked into the User-Agent string. Kept
 *  in sync with `package.json` `version` manually — when bumping the
 *  package version, update this constant too. (Phase 2 dual-build
 *  will substitute this at build time.) */
const PACKAGE_VERSION = "0.9.0" as const; // x-release-please-version
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

/** Lifecycle hook set. Hooks are best-effort: any rejection inside a
 *  hook is logged via `console.warn` but does NOT block the request. */
export interface ComposedFetchHooks {
    beforeRequest?: (ctx: RequestContext) => void | Promise<void>;
    afterResponse?: (ctx: ResponseContext) => void | Promise<void>;
    onError?: (ctx: ErrorContext) => void | Promise<void>;
    onRetry?: (ctx: RetryContext) => void | Promise<void>;
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

        const finalInit: RequestInit = { ...init, headers: initHeaders };

        if (retryPolicy == null) {
            // No wrapper-side retry — single shot.
            const ctx: RequestContext = {
                url,
                method,
                headers: initHeaders,
                attempt: 0,
                requestId,
            };
            return await runSingleAttempt(baseFetch, input, finalInit, ctx, hooks);
        }

        return await runWithRetries(baseFetch, input, finalInit, retryPolicy, hooks, {
            url,
            method,
            headers: initHeaders,
            requestId,
        });
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
        computeDelay: user.computeDelay,
    };
}

async function runSingleAttempt(
    baseFetch: typeof fetch,
    input: RequestInfo | URL,
    init: RequestInit,
    ctx: RequestContext,
    hooks: ComposedFetchHooks | undefined,
): Promise<Response> {
    const start = Date.now();
    await safeHook(hooks?.beforeRequest, ctx);
    try {
        const response = await baseFetch(input, init);
        await safeHook(hooks?.afterResponse, { ...ctx, response, durationMs: Date.now() - start });
        return response;
    } catch (error) {
        await safeHook(hooks?.onError, { ...ctx, error, durationMs: Date.now() - start });
        throw error;
    }
}

async function runWithRetries(
    baseFetch: typeof fetch,
    input: RequestInfo | URL,
    init: RequestInit,
    policy: ReturnType<typeof mergeRetryPolicy>,
    hooks: ComposedFetchHooks | undefined,
    base: Omit<RequestContext, "attempt">,
): Promise<Response> {
    let lastResponse: Response | undefined;
    let lastError: unknown;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
        const ctx: RequestContext = { ...base, attempt };
        const start = Date.now();
        let response: Response | undefined;
        let error: unknown;

        await safeHook(hooks?.beforeRequest, ctx);

        try {
            response = await baseFetch(input, init);
        } catch (e) {
            error = e;
        }

        const durationMs = Date.now() - start;

        if (error != null) {
            await safeHook(hooks?.onError, { ...ctx, error, durationMs });
            lastError = error;
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
            await sleep(delayMs);
            continue;
        }

        if (response != null) {
            await safeHook(hooks?.afterResponse, { ...ctx, response, durationMs });
            lastResponse = response;
            if (
                attempt >= policy.maxRetries ||
                !policy.retryableStatusCodes.includes(response.status) ||
                !policy.retryableMethods.includes(base.method)
            ) {
                return response;
            }
            const delayMs = computeRetryDelay(attempt, response, policy);
            await safeHook(hooks?.onRetry, {
                ...ctx,
                cause: { response },
                nextAttempt: attempt + 1,
                delayMs,
            });
            await sleep(delayMs);
        }
    }

    if (lastResponse != null) return lastResponse;
    throw lastError != null
        ? toError(lastError)
        : new Error("composedFetch: exhausted retries with no response and no error");
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
            if (Number.isFinite(seconds) && seconds > 0) {
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

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
