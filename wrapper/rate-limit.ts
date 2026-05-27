/**
 * Rate-limit header parsing helpers.
 *
 * Clockify exposes `X-RateLimit-Remaining`, `X-RateLimit-Limit`, and
 * `X-RateLimit-Reset` headers on every API response. These helpers
 * parse them into a typed snapshot so callers don't have to deal
 * with case-insensitive lookups + numeric parsing + epoch-second-vs-
 * HTTP-date Reset decoding by hand.
 *
 * @example
 * ```ts
 * import { createClockifyClient, withResponse, getRateLimit } from "clockify-sdk-ts-115";
 *
 * const client = createClockifyClient();
 * const result = await withResponse(client.tags.list({ workspaceId }));
 * const rl = getRateLimit(result.headers);
 *
 * console.log(`${rl.remaining}/${rl.limit} requests remaining; resets at ${rl.resetAt}`);
 * ```
 */

/** Parsed `X-RateLimit-*` snapshot from a response or error. */
export interface RateLimitSnapshot {
    /** Requests left in the current window. Undefined when the
     *  header was absent or non-numeric. */
    remaining: number | undefined;
    /** Total request budget for the window. Undefined when the
     *  header was absent or non-numeric. */
    limit: number | undefined;
    /** When the window resets. Parsed from epoch-seconds (Stripe
     *  convention) or an HTTP-date string. Undefined when the
     *  header was absent or unparseable. */
    resetAt: Date | undefined;
}

/** Minimal Headers shape — compatible with Web `Headers`, Node's
 *  `IncomingHttpHeaders` after a wrapping, and Fern's
 *  `RawResponse.headers`. */
interface HeaderReader {
    get(name: string): string | null;
}

/**
 * Parse a response/error headers object into a {@link RateLimitSnapshot}.
 * Header names are matched case-insensitively (per HTTP spec).
 */
export function getRateLimit(headers: HeaderReader): RateLimitSnapshot {
    return {
        remaining: parseIntHeader(
            headers.get("X-RateLimit-Remaining") ?? headers.get("x-ratelimit-remaining"),
        ),
        limit: parseIntHeader(headers.get("X-RateLimit-Limit") ?? headers.get("x-ratelimit-limit")),
        resetAt: parseResetHeader(
            headers.get("X-RateLimit-Reset") ?? headers.get("x-ratelimit-reset"),
        ),
    };
}

/**
 * Compute milliseconds until the rate-limit window resets. Returns
 * `undefined` when {@link RateLimitSnapshot.resetAt} is unset. Useful
 * for backoff loops: `setTimeout(retry, retryAfterMs(snapshot) ?? 0)`.
 */
export function retryAfterMs(snapshot: RateLimitSnapshot, now: Date = new Date()): number | undefined {
    if (snapshot.resetAt == null) return undefined;
    const ms = snapshot.resetAt.getTime() - now.getTime();
    return ms > 0 ? ms : 0;
}

/**
 * Extract a {@link RateLimitSnapshot} from a thrown error. Returns
 * `undefined` when `err` is not a `ClockifyApiError` or has no
 * `rawResponse.headers`. Useful for backoff logic at catch sites:
 *
 * @example
 * ```ts
 * try { await client.tags.list({ workspaceId }); }
 * catch (err) {
 *   const rl = getRateLimitFromError(err);
 *   if (rl?.remaining === 0 && rl.resetAt != null) {
 *     await sleep(rl.resetAt.getTime() - Date.now());
 *     // retry
 *   }
 *   throw err;
 * }
 * ```
 */
export function getRateLimitFromError(err: unknown): RateLimitSnapshot | undefined {
    if (err == null || typeof err !== "object") return undefined;
    const raw = (err as { rawResponse?: { headers?: HeaderReader } }).rawResponse;
    if (raw == null || raw.headers == null) return undefined;
    return getRateLimit(raw.headers);
}

function parseIntHeader(value: string | null): number | undefined {
    if (value == null || value === "") return undefined;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
}

function parseResetHeader(value: string | null): Date | undefined {
    if (value == null || value === "") return undefined;
    // Try epoch seconds first (Stripe / GitHub convention).
    const seconds = Number.parseInt(value, 10);
    if (Number.isFinite(seconds) && String(seconds) === value.trim()) {
        return new Date(seconds * 1000);
    }
    // Fall back to HTTP-date.
    const date = Date.parse(value);
    return Number.isFinite(date) ? new Date(date) : undefined;
}
