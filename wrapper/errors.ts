/**
 * Status-specific subclasses of `ClockifyApiError` + helpers.
 *
 * Lets callers narrow on `instanceof RateLimitError` (etc.) with
 * structured fields like `retryAfterMs`, instead of digging into
 * `err.statusCode === 429 && err.rawResponse.headers.get("retry-after")`.
 *
 * The Fern-generated client throws the base `ClockifyApiError` for any
 * status code that isn't documented in the OpenAPI spec for that
 * endpoint. To get the typed subclass, call `promoteApiError(err)` at
 * the catch site:
 *
 * ```ts
 * try { await client.tags.create(...); }
 * catch (err) {
 *     const e = promoteApiError(err);
 *     if (e instanceof RateLimitError) {
 *         await sleep(e.retryAfterMs ?? 1000);
 *         // retry
 *     } else { throw e; }
 * }
 * ```
 *
 * The subclasses extend `ClockifyApiError`, so existing
 * `catch (err) { if (err instanceof ClockifyApiError) ... }` patterns
 * keep working unchanged.
 */
import type { RawResponse } from "./src/core/index.js";
import { ClockifyApiError } from "./src/errors/index.js";

interface SubclassOpts {
    /** HTTP status code. Optional for the non-status-code subclasses
     *  (`ClockifyConnectionError`, `ClockifyAbortError`); required in
     *  spirit for every other subclass (`RateLimitError`, `ConflictError`,
     *  etc.) but typed as optional so the non-status branch in
     *  `promoteApiError` can construct cleanly. */
    statusCode?: number;
    body?: unknown;
    rawResponse?: RawResponse;
    cause?: unknown;
    message?: string;
}

/**
 * Thrown / promoted when the server replies `429 Too Many Requests`.
 *
 * Parses `Retry-After` (seconds or HTTP-date) and `X-RateLimit-Reset`
 * (epoch seconds) into structured fields. `retryAfterMs` is the
 * ms-until-retry; `rateLimitResetAt` is the absolute reset time.
 */
export class RateLimitError extends ClockifyApiError {
    /** Time to wait before retrying, in ms. Parsed from `Retry-After`
     *  (seconds or HTTP-date) or `X-RateLimit-Reset` (epoch seconds).
     *  `undefined` if neither header was present or parseable. */
    public readonly retryAfterMs: number | undefined;
    /** Absolute time when the rate-limit window resets. Parsed from
     *  `X-RateLimit-Reset` (epoch seconds) or `Retry-After` (HTTP-date,
     *  or "now + N seconds" for the seconds form). `undefined` if
     *  neither header was present or parseable. */
    public readonly rateLimitResetAt: Date | undefined;

    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "RateLimitError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "RateLimitError";
        const headers = opts.rawResponse?.headers;
        this.retryAfterMs = parseRetryAfterMs(headers);
        this.rateLimitResetAt = parseRateLimitResetAt(headers);
    }
}

/** Thrown / promoted when the server replies `409 Conflict`. */
export class ConflictError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "ConflictError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ConflictError";
    }
}

/** Thrown / promoted when the server replies `500 Internal Server Error`. */
export class InternalServerError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "InternalServerError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "InternalServerError";
    }
}

/** Thrown / promoted when the server replies `503 Service Unavailable`. */
export class ServiceUnavailableError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "ServiceUnavailableError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ServiceUnavailableError";
    }
}

/**
 * Thrown / promoted when the underlying `fetch` reports a network
 * failure with no HTTP response (e.g. DNS failure, connection
 * reset, TLS handshake failure, `TypeError: fetch failed` in
 * Node's built-in fetch).
 *
 * The Fern-generated client wraps these as a base
 * `ClockifyApiError` with `statusCode == null` and `cause` set to
 * the underlying `TypeError` / `Error`. `promoteApiError(err)`
 * detects this shape and returns a `ClockifyConnectionError` so
 * callers can do `if (err instanceof ClockifyConnectionError)`
 * instead of inspecting `err.cause?.name`.
 *
 * @example
 * ```ts
 * import { isConnectionError, createClockifyClient } from "clockify-sdk-ts";
 *
 * try { await client.tags.list({...}); }
 * catch (err) {
 *   if (isConnectionError(err)) {
 *     // retry with exponential backoff, or fail fast and surface
 *     // a user-facing "offline?" message
 *   } else { throw err; }
 * }
 * ```
 */
export class ClockifyConnectionError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "ClockifyConnectionError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ClockifyConnectionError";
    }
}

/**
 * Thrown / promoted when the underlying `fetch` is aborted by an
 * `AbortSignal` (caller-initiated cancellation, not server-side
 * timeout).
 *
 * The Fern-generated client wraps these as a base
 * `ClockifyApiError` with `statusCode == null` and `cause.name`
 * set to `"AbortError"` (DOMException convention).
 * `promoteApiError(err)` detects this shape and returns a
 * `ClockifyAbortError`.
 *
 * Distinguishing aborts from timeouts:
 * - `ClockifyAbortError` — caller called `controller.abort()`.
 *   Do NOT retry — the user explicitly cancelled.
 * - `ClockifyApiTimeoutError` — request exceeded `timeoutInSeconds`.
 *   Retry may be appropriate (with backoff).
 *
 * @example
 * ```ts
 * import { isAbortError, createClockifyClient } from "clockify-sdk-ts";
 *
 * const controller = new AbortController();
 * setTimeout(() => controller.abort(), 100);
 *
 * try {
 *   await client.tags.list({ workspaceId }, { abortSignal: controller.signal });
 * } catch (err) {
 *   if (isAbortError(err)) {
 *     // user/code cancelled — don't retry
 *     return;
 *   }
 *   throw err;
 * }
 * ```
 */
export class ClockifyAbortError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super({ message: opts.message ?? "ClockifyAbortError", ...opts });
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ClockifyAbortError";
    }
}

const STATUS_TO_CTOR = new Map<number, new (o: SubclassOpts) => ClockifyApiError>([
    [409, ConflictError],
    [429, RateLimitError],
    [500, InternalServerError],
    [503, ServiceUnavailableError],
]);

/**
 * If `err` is a base `ClockifyApiError` and its `statusCode` matches a
 * known subclass, return a new instance of that subclass (preserving
 * `body`, `rawResponse`, `cause`). Otherwise return `err` unchanged.
 *
 * The Fern-generated client already throws typed subclasses for status
 * codes documented in the OpenAPI spec (e.g., 400 BadRequestError,
 * 401 UnauthorizedError). This helper fills the gaps for codes the
 * spec didn't document — currently 409, 429, 500, 503 — plus the
 * non-status-code cases:
 *
 * - `cause.name === "AbortError"` → promoted to `ClockifyAbortError`
 * - any other non-null `cause` with no status code → promoted to
 *   `ClockifyConnectionError` (DNS failure, TCP reset, TLS error, etc.)
 *
 * Existing subclass instances pass through unchanged (idempotent).
 */
export function promoteApiError(err: unknown): unknown {
    if (!(err instanceof ClockifyApiError)) return err;
    // Pre-promoted instances pass through (idempotent).
    if (
        err instanceof ClockifyConnectionError ||
        err instanceof ClockifyAbortError
    ) {
        return err;
    }
    // Destructure up front: `err instanceof Ctor` below narrows `err`'s
    // type and TS would otherwise widen the trailing field access to
    // `never`. The fields are inherent to `ClockifyApiError`.
    const { statusCode, body, rawResponse, cause, message } = err;

    // Non-status-code branch: inspect `cause` to differentiate
    // AbortSignal cancellations from generic network failures.
    // Fern's `handleNonStatusCodeError` wraps the underlying
    // `TypeError: fetch failed` / `DOMException("…", "AbortError")`
    // as `ClockifyApiError({ cause, statusCode: undefined })` —
    // see `src/errors/handleNonStatusCodeError.ts` case "unknown".
    if (statusCode == null) {
        if (isAbortCause(cause)) {
            return new ClockifyAbortError({ statusCode, body, rawResponse, cause, message });
        }
        if (cause != null) {
            return new ClockifyConnectionError({ statusCode, body, rawResponse, cause, message });
        }
        return err;
    }

    const Ctor = STATUS_TO_CTOR.get(statusCode);
    if (Ctor == null) return err;
    if (err instanceof Ctor) return err;
    return new Ctor({ statusCode, body, rawResponse, cause, message });
}

function isAbortCause(cause: unknown): boolean {
    if (cause == null) return false;
    if (typeof cause !== "object") return false;
    const name = (cause as { name?: unknown }).name;
    return name === "AbortError";
}

/**
 * Type guard: `true` if `err` is any `ClockifyApiError` (base or any
 * subclass — `RateLimitError`, `NotFoundError`, etc.). The widest of
 * the type-guard family; useful at the outer edge of a `catch` where
 * you want one check that covers everything the SDK throws.
 *
 * @example
 * ```ts
 * try { await client.tags.list({...}); }
 * catch (err) {
 *     if (!isClockifyApiError(err)) throw err;  // non-API failure
 *     logger.error({ status: err.statusCode, requestId: getRequestIdFromError(err) });
 * }
 * ```
 */
export function isClockifyApiError(err: unknown): err is ClockifyApiError {
    return err instanceof ClockifyApiError;
}

/** Type guard: `true` if `err` is a `ClockifyApiError` with status 429. */
export function isRateLimitError(err: unknown): err is RateLimitError {
    return err instanceof ClockifyApiError && err.statusCode === 429;
}

/** Type guard: `true` if `err` is a `ClockifyApiError` with status 409. */
export function isConflictError(err: unknown): err is ConflictError {
    return err instanceof ClockifyApiError && err.statusCode === 409;
}

/** Type guard: `true` if `err` is a `ClockifyApiError` with status 500. */
export function isInternalServerError(err: unknown): err is InternalServerError {
    return err instanceof ClockifyApiError && err.statusCode === 500;
}

/** Type guard: `true` if `err` is a `ClockifyApiError` with status 503. */
export function isServiceUnavailableError(err: unknown): err is ServiceUnavailableError {
    return err instanceof ClockifyApiError && err.statusCode === 503;
}

/**
 * Type guard: `true` if `err` is a `ClockifyConnectionError`
 * (network failure with no HTTP response). Use this at catch
 * sites where you want to differentiate "couldn't reach the
 * server" from "server returned an error status".
 */
export function isConnectionError(err: unknown): err is ClockifyConnectionError {
    return err instanceof ClockifyConnectionError;
}

/**
 * Type guard: `true` if `err` is a `ClockifyAbortError` (caller
 * cancelled via `AbortSignal`). Returns `false` for server-side
 * timeouts — use `instanceof ClockifyApiTimeoutError` for that.
 */
export function isAbortError(err: unknown): err is ClockifyAbortError {
    return err instanceof ClockifyAbortError;
}

// ---------- header parsers ----------

interface HeaderReader {
    get(name: string): string | null;
}

function parseRetryAfterMs(headers: HeaderReader | undefined): number | undefined {
    if (headers == null) return undefined;
    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
        const dateMs = new Date(retryAfter).getTime() - Date.now();
        if (Number.isFinite(dateMs) && dateMs > 0) return dateMs;
    }
    const reset = headers.get("X-RateLimit-Reset") ?? headers.get("x-ratelimit-reset");
    if (reset != null) {
        const epochSec = Number.parseInt(reset, 10);
        if (Number.isFinite(epochSec)) {
            const dateMs = epochSec * 1000 - Date.now();
            if (dateMs > 0) return dateMs;
        }
    }
    return undefined;
}

function parseRateLimitResetAt(headers: HeaderReader | undefined): Date | undefined {
    if (headers == null) return undefined;
    const reset = headers.get("X-RateLimit-Reset") ?? headers.get("x-ratelimit-reset");
    if (reset != null) {
        const epochSec = Number.parseInt(reset, 10);
        if (Number.isFinite(epochSec)) {
            return new Date(epochSec * 1000);
        }
    }
    const retryAfter = headers.get("Retry-After") ?? headers.get("retry-after");
    if (retryAfter != null) {
        const seconds = Number.parseInt(retryAfter, 10);
        if (Number.isFinite(seconds) && seconds > 0) {
            return new Date(Date.now() + seconds * 1000);
        }
        const date = new Date(retryAfter);
        if (Number.isFinite(date.getTime())) return date;
    }
    return undefined;
}
