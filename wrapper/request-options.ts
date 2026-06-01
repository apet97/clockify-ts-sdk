/**
 * Public per-request options seam. Re-exposes the generated client's
 * per-call request behavior (timeout, retry, abort, query, headers) as a
 * stable type so callers never reach into `./src`. Auth is deliberately
 * excluded: it belongs on the client, not on individual calls.
 */
import type { BaseRequestOptions } from "./src/BaseClient.js";

/** Per-request options minus `addonToken`. */
export type ClockifyRequestOptions = Omit<BaseRequestOptions, "addonToken">;

/** Header value accepted by {@link withHeaders}; stringified on the way out. */
export type ClockifyHeaderValue = string | number | boolean;

export type ClockifyRequestHeaders = Record<string, ClockifyHeaderValue>;

/** Type a request-options literal without widening it. */
export function requestOptions(options: ClockifyRequestOptions): ClockifyRequestOptions {
    return options;
}

/** Request options carrying the given headers, with values stringified. */
export function withHeaders(headers: ClockifyRequestHeaders): ClockifyRequestOptions {
    const stringified: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
        stringified[key] = String(value);
    }
    return { headers: stringified };
}

/** Request options carrying an `Idempotency-Key` header. */
export function withIdempotencyKey(key: string): ClockifyRequestOptions {
    const trimmed = key.trim();
    if (!trimmed) {
        throw new TypeError("Idempotency key must be a non-empty string");
    }
    return { headers: { "Idempotency-Key": trimmed } };
}

/** Request options overriding the per-call timeout. */
export function withRequestTimeout(timeoutInSeconds: number): ClockifyRequestOptions {
    if (!Number.isFinite(timeoutInSeconds) || timeoutInSeconds <= 0) {
        throw new RangeError("timeoutInSeconds must be a positive finite number");
    }
    return { timeoutInSeconds };
}
