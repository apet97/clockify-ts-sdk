/**
 * Status-specific subclasses of `ClockifyApiError` + helpers.
 *
 * Lets callers narrow on `instanceof RateLimitError` (etc.) with
 * structured fields like `retryAfterMs`, instead of digging into
 * `err.statusCode === 429 && err.rawResponse.headers.get("retry-after")`.
 *
 * The generated client throws the base `ClockifyApiError` for any
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
import {
    CLOCKIFY_ERROR_CODES,
    errorCodeForMessage,
    recoveryForCode,
    retryableForCode,
    type ClockifyErrorCode,
} from "./error-codes.js";
import type { RawResponse } from "./src/core/index.js";
import { ClockifyApiError } from "./src/errors/index.js";

export {
    BadRequestError,
    ForbiddenError,
    MethodNotAllowedError,
    NotFoundError,
    UnauthorizedError,
} from "./src/api/errors/index.js";
export {
    CLOCKIFY_ERROR_CODES,
    errorCodeEntry,
    errorCodeForMessage,
    errorCodeForStatus,
    recoveryForCode,
    retryableForCode,
    type ClockifyErrorCode,
    type ClockifyErrorCodeEntry,
} from "./error-codes.js";

interface SubclassOpts {
    /** HTTP status code. Optional for the non-status-code subclasses
     *  (`ClockifyConnectionError`, `ClockifyAbortError`); required in
     *  spirit for every other subclass (`RateLimitError`, `ConflictError`,
     *  etc.) but typed as optional so the non-status branch in
     *  `promoteApiError` can construct cleanly. */
    statusCode?: number | undefined;
    body?: unknown;
    rawResponse?: RawResponse | undefined;
    cause?: unknown;
    message?: string | undefined;
}

function generatedErrorOptions(
    opts: SubclassOpts,
    message: string,
): {
    message: string;
    statusCode?: number;
    body?: unknown;
    rawResponse?: RawResponse;
    cause?: unknown;
} {
    return {
        message,
        ...(opts.statusCode !== undefined ? { statusCode: opts.statusCode } : {}),
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.rawResponse !== undefined ? { rawResponse: opts.rawResponse } : {}),
        ...(opts.cause !== undefined ? { cause: opts.cause } : {}),
    };
}

export interface ClockifyErrorClassification {
    /** Stable cross-surface recovery code from `docs/error-codes.json`. */
    code: ClockifyErrorCode;
    /** Human/actionable recovery hint for `code`. */
    recovery: string;
    /** Whether the failure is generally safe to retry with backoff. */
    retryable: boolean;
    /** HTTP status when Clockify returned one. */
    statusCode?: number;
    /** Clockify/server-specific body code, when present. */
    serverCode?: string;
    /** Error message preserved for logs and user-facing reports. */
    message: string;
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
        super(generatedErrorOptions(opts, opts.message ?? "RateLimitError"));
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
        super(generatedErrorOptions(opts, opts.message ?? "ConflictError"));
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ConflictError";
    }
}

/** Thrown / promoted when the server replies `500 Internal Server Error`. */
export class InternalServerError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super(generatedErrorOptions(opts, opts.message ?? "InternalServerError"));
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "InternalServerError";
    }
}

/** Thrown / promoted when the server replies `503 Service Unavailable`. */
export class ServiceUnavailableError extends ClockifyApiError {
    constructor(opts: SubclassOpts) {
        super(generatedErrorOptions(opts, opts.message ?? "ServiceUnavailableError"));
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
 * The generated client wraps these as a base
 * `ClockifyApiError` with `statusCode == null` and `cause` set to
 * the underlying `TypeError` / `Error`. `promoteApiError(err)`
 * detects this shape and returns a `ClockifyConnectionError` so
 * callers can do `if (err instanceof ClockifyConnectionError)`
 * instead of inspecting `err.cause?.name`.
 *
 * @example
 * ```ts
 * import { isConnectionError, createClockifyClient } from "clockify-sdk-ts-115";
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
        super(generatedErrorOptions(opts, opts.message ?? "ClockifyConnectionError"));
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
 * The generated client wraps these as a base
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
 * import { isAbortError, createClockifyClient } from "clockify-sdk-ts-115";
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
        super(generatedErrorOptions(opts, opts.message ?? "ClockifyAbortError"));
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "ClockifyAbortError";
    }
}

/**
 * Thrown by {@link mapAddonTokenRestriction} when an `X-Addon-Token` request
 * gets a 401 whose body says the endpoint is not accessible to add-ons.
 *
 * Clockify refuses some endpoint FAMILIES for add-on tokens regardless of
 * manifest scopes — no scope exists to grant them (live-probed: webhooks,
 * custom-field management, account-level `GET /workspaces`). This names the
 * restriction instead of surfacing a bare 401, so an addon backend can tell a
 * genuine auth failure (bad/expired token) apart from a structural "add-ons
 * can never call this" wall. Subclasses `ClockifyApiError` so existing
 * `catch (err) { if (err instanceof ClockifyApiError) ... }` sites still match.
 */
export class AddonTokenRestrictionError extends ClockifyApiError {
    /** HTTP method of the refused request (e.g. `"GET"`). */
    public readonly method: string;
    /** Request path of the refused request (e.g. `"/v1/workspaces"`). */
    public readonly path: string;
    /** Stable cross-surface code for addon-token endpoint walls. */
    public readonly code: ClockifyErrorCode = "addon_token_restricted";
    constructor(opts: SubclassOpts & { method: string; path: string }) {
        super(
            generatedErrorOptions(
                opts,
                opts.message ??
                    `Clockify does not allow add-ons to call ${opts.method} ${opts.path} — this endpoint is outside the add-on token's reach regardless of manifest scopes.`,
            ),
        );
        Object.setPrototypeOf(this, new.target.prototype);
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
        this.name = "AddonTokenRestrictionError";
        this.method = opts.method;
        this.path = opts.path;
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
 * The generated client already throws typed subclasses for status
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
    if (err instanceof ClockifyConnectionError || err instanceof ClockifyAbortError) {
        return err;
    }
    // Destructure up front: `err instanceof Ctor` below narrows `err`'s
    // type and TS would otherwise widen the trailing field access to
    // `never`. The fields are inherent to `ClockifyApiError`.
    const { statusCode, body, rawResponse, cause, message } = err;

    // Non-status-code branch: inspect `cause` to differentiate
    // AbortSignal cancellations from generic network failures.
    // The generated runtime wraps underlying fetch failures as
    // `ClockifyApiError({ cause, statusCode: undefined })`.
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

/**
 * Classify a Clockify SDK error into the shared recovery vocabulary
 * generated from `docs/error-codes.json`.
 *
 * This is the SDK counterpart to the CLI JSON errors and MCP recovery
 * envelopes. It intentionally returns a small receipt instead of
 * throwing a new error:
 *
 * - `code` is the stable, cross-surface code (`rate_limited`,
 *   `not_found`, `connection_error`, etc.).
 * - `serverCode` preserves Clockify's body-level code when present
 *   (`tag_already_exists`, `validation_error`, etc.).
 * - `recovery` and `retryable` come from the generated registry.
 *
 * Non-SDK errors return `undefined`, so callers can rethrow them.
 */
export function classifyClockifyError(err: unknown): ClockifyErrorClassification | undefined {
    const promoted = promoteApiError(err);
    if (!(promoted instanceof ClockifyApiError)) return undefined;

    const code = stableCodeForClockifyError(promoted);
    const classification: ClockifyErrorClassification = {
        code,
        recovery: recoveryForCode(code),
        retryable: retryableForCode(code),
        message: promoted.message,
    };

    if (promoted.statusCode != null) classification.statusCode = promoted.statusCode;

    const serverCode = getErrorCode(promoted);
    if (serverCode != null) classification.serverCode = serverCode;

    return classification;
}

/** Convenience wrapper when only the shared stable code is needed. */
export function getStableErrorCode(err: unknown): ClockifyErrorCode | undefined {
    return classifyClockifyError(err)?.code;
}

function stableCodeForClockifyError(err: ClockifyApiError): ClockifyErrorCode {
    if (err instanceof ClockifyAbortError || (err.statusCode == null && isAbortCause(err.cause))) {
        return "aborted";
    }
    if (err instanceof ClockifyConnectionError || (err.statusCode == null && err.cause != null)) {
        return "connection_error";
    }

    if (err instanceof AddonTokenRestrictionError) return "addon_token_restricted";
    if (err.statusCode === 401 && bodyMentionsAddonRestriction(err.body)) {
        return "addon_token_restricted";
    }

    if (err.statusCode === 429 && parseRetryAfterMs(err.rawResponse?.headers) != null) {
        return "rate_limited_retry_after";
    }

    if (err.statusCode === 400 && mentionsActiveDeleteBlock(err.message, err.body)) {
        return "active_resource_delete_blocked";
    }

    // A wrong/missing id 400s with a code:501 "X doesn't belong to Workspace" /
    // "... doesn't exist" body — semantically a not_found, classified before the
    // generic 400 -> invalid_request status mapping so agents get the right hint.
    if (err.statusCode === 400 && mentionsResourceNotFound(err.message, err.body)) {
        return "not_found";
    }

    const byStatus = errorCodeForSdkStatus(err.statusCode);
    if (byStatus != null) return byStatus;

    return errorCodeForMessage(err.message);
}

/**
 * Combine an error's thrown `message` with its response-body message so a
 * single regex test covers both. Clockify sometimes surfaces the meaningful
 * text only in the JSON body (`{ "message": "...", "code": 501 }`) while
 * `err.message` is a generic "HTTP 400".
 */
function errorText(message: string, body: unknown): string {
    if (typeof body === "string") return `${message}\n${body}`;
    if (body != null && typeof body === "object") {
        const bodyMessage = (body as { message?: unknown }).message;
        if (typeof bodyMessage === "string") return `${message}\n${bodyMessage}`;
    }
    return message;
}

function mentionsActiveDeleteBlock(message: string, body: unknown): boolean {
    return /cannot delete an active (project|task|client)/i.test(errorText(message, body));
}

function mentionsResourceNotFound(message: string, body: unknown): boolean {
    return /does(?:n'?t| not) (?:belong to|exist)/i.test(errorText(message, body));
}

function errorCodeForSdkStatus(status: number | undefined): ClockifyErrorCode | undefined {
    if (status == null) return undefined;
    return CLOCKIFY_ERROR_CODES.find(
        (entry) =>
            (entry.surfaces as readonly string[]).includes("sdk") &&
            (entry.httpStatus as readonly number[]).includes(status),
    )?.code;
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
        // Retry-After: 0 (RFC 9110 delay-seconds=0) means retry immediately → 0ms.
        if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
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
        if (Number.isFinite(seconds)) {
            // Retry-After: 0 (RFC 9110 delay-seconds=0) means retry immediately → now.
            // Negative delay-seconds are invalid; fall through to undefined (matches parseRetryAfterMs).
            if (seconds >= 0) return new Date(Date.now() + seconds * 1000);
        } else {
            const date = new Date(retryAfter);
            if (Number.isFinite(date.getTime())) return date;
        }
    }
    return undefined;
}

/**
 * Extract a stable `code` string from a `ClockifyApiError`'s body
 * (Stripe / OpenAI / Anthropic SDK convention — server-side error
 * codes that survive translation regardless of locale).
 *
 * Probes the body in this order:
 *
 * 1. `body.code` (string) — Clockify's documented top-level shape
 *    for validation errors.
 * 2. `body.error.code` (string) — nested-envelope shape used by
 *    some endpoints.
 *
 * Returns `undefined` when:
 *
 * - `err` is not a `ClockifyApiError`.
 * - The body is null / undefined / not an object.
 * - Neither shape matched (the body has no `code` field).
 *
 * Codes are useful for branch-style error handling without
 * pattern-matching on `error.message` (which is locale-dependent
 * and may change wording across server versions).
 *
 * @example
 * ```ts
 * import { getErrorCode, isClockifyApiError } from "clockify-sdk-ts-115";
 *
 * try { await client.tags.create({ workspaceId, name: "" }); }
 * catch (err) {
 *   if (isClockifyApiError(err) && getErrorCode(err) === "tag_already_exists") {
 *     // dedupe — the tag is already there
 *     return existing;
 *   }
 *   throw err;
 * }
 * ```
 */
export function getErrorCode(err: unknown): string | undefined {
    if (!(err instanceof ClockifyApiError)) return undefined;
    const body = err.body;
    if (body == null || typeof body !== "object") return undefined;
    const direct = (body as { code?: unknown }).code;
    if (typeof direct === "string" && direct.length > 0) return direct;
    const nested = (body as { error?: { code?: unknown } }).error?.code;
    if (typeof nested === "string" && nested.length > 0) return nested;
    return undefined;
}

/** The marker phrase Clockify returns when an endpoint family is structurally
 *  off-limits to add-on tokens (vs. a generic bad/expired-token 401). */
const ADDON_RESTRICTION_MARKER = "API is not accessible" as const;

/** True if the error's body (string OR object `message`/`error`/`code`) contains
 *  the add-on-restriction marker phrase. */
function bodyMentionsAddonRestriction(body: unknown): boolean {
    if (typeof body === "string") return body.includes(ADDON_RESTRICTION_MARKER);
    if (body != null && typeof body === "object") {
        const b = body as { message?: unknown; error?: unknown; code?: unknown };
        for (const v of [b.message, b.error, b.code]) {
            if (typeof v === "string" && v.includes(ADDON_RESTRICTION_MARKER)) return true;
        }
    }
    return false;
}

/**
 * Map an `X-Addon-Token` 401 whose body says the endpoint is not accessible to
 * add-ons into a named {@link AddonTokenRestrictionError}; otherwise return the
 * error UNCHANGED.
 *
 * Clockify walls off some endpoint families from add-on tokens regardless of
 * manifest scopes (live-probed: webhooks, custom-field management, account-level
 * `GET /workspaces`). A bare 401 reads like a bad token; this names the
 * structural restriction so an addon backend stops retrying / re-issuing the
 * token. **API-key auth keeps the raw 401** (so dev scripts and personal-token
 * callers see the unmapped truth) — pass `authScheme: "apiKey"` and the input
 * is returned as-is.
 *
 * The SDK error does not record which auth header it sent, so the caller — which
 * constructed the client and therefore knows — must pass `authScheme`. Use it at
 * a catch site (it is pure / non-throwing; it RETURNS the error to throw):
 *
 * @example
 * ```ts
 * import { createClockifyClient, mapAddonTokenRestriction } from "clockify-sdk-ts-115";
 * const client = createClockifyClient({ addonToken });
 * try {
 *   await client.workspaces.list();
 * } catch (err) {
 *   throw mapAddonTokenRestriction(err, {
 *     authScheme: "addonToken",
 *     method: "GET",
 *     path: "/v1/workspaces",
 *   });
 * }
 * ```
 *
 * @param err the caught error (any value; non-`ClockifyApiError` values pass through).
 * @param opts.authScheme which header the client used (`"addonToken"` or `"apiKey"`).
 *   Only `"addonToken"` triggers mapping.
 * @param opts.method optional HTTP method for the message; defaults to `"?"`.
 * @param opts.path optional request path for the message; defaults to `"?"`.
 * @returns an {@link AddonTokenRestrictionError} when (and only when) the error is
 *   a 401 `ClockifyApiError`, `authScheme === "addonToken"`, and the body carries
 *   the marker phrase; otherwise `err` unchanged.
 */
export function mapAddonTokenRestriction(
    err: unknown,
    opts: { authScheme: "addonToken" | "apiKey"; method?: string; path?: string },
): unknown {
    if (opts.authScheme !== "addonToken") return err;
    if (!(err instanceof ClockifyApiError)) return err;
    if (err.statusCode !== 401) return err;
    if (!bodyMentionsAddonRestriction(err.body)) return err;
    return new AddonTokenRestrictionError({
        method: opts.method ?? "?",
        path: opts.path ?? "?",
        statusCode: err.statusCode,
        body: err.body,
        rawResponse: err.rawResponse,
        cause: err.cause,
    });
}
