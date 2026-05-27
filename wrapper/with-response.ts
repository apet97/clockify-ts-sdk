/**
 * Ergonomic wrapper around the synced SDK's
 * `HttpResponsePromise<T>.withRawResponse()` method.
 *
 * Every method on a `ClockifyApiClient` sub-client returns
 * `HttpResponsePromise<T>` — a thenable that resolves to just the
 * parsed body `T`. To get the response status, headers, or our
 * injected `X-Request-Id`, call `.withRawResponse()` which yields
 * `{ data, rawResponse }` where `rawResponse` is the
 * `RawResponse` shape (Response without body methods).
 *
 * `withResponse(promise)` is a thin shim that:
 *
 * - Awaits `.withRawResponse()`.
 * - Re-packages into a flatter `{ data, response, headers, requestId,
 *   status }` shape (matches the call sites a Stainless/Stripe SDK
 *   user expects).
 * - Extracts the `X-Request-Id` we injected via `composedFetch` as
 *   a top-level field for log correlation.
 *
 * Use this when you need response metadata. For the common case
 * (you only want the body), `await client.foo.bar(...)` is still
 * the right shape.
 */
import { REQUEST_ID_HEADER } from "./composed-fetch.js";
import type { RawResponse } from "./src/core/index.js";

/** Result of {@link withResponse} — the parsed body plus the
 *  response metadata. */
export interface WithResponseResult<T> {
    /** The parsed response body, exactly as the SDK method would
     *  resolve to. */
    data: T;
    /** The full raw response (without body methods — body has
     *  already been consumed during parsing). */
    response: RawResponse;
    /** Response headers, lifted to a top-level field for
     *  ergonomic access. Same object as `response.headers`. */
    headers: RawResponse["headers"];
    /** The `X-Request-Id` we injected via `composedFetch`, if
     *  present on the response. `undefined` when the upstream
     *  stripped it (e.g. proxies) or when `requestId: false` was
     *  passed to `createClockifyClient`. */
    requestId: string | undefined;
    /** HTTP status code (200, 201, etc.). Lifted from
     *  `response.status` for ergonomic access. */
    status: number;
}

/** Shape compatible with what every Fern-generated SDK method
 *  returns: a thenable that resolves to T and also exposes
 *  `.withRawResponse()`. */
export interface ResponseAwarePromise<T> extends PromiseLike<T> {
    withRawResponse(): Promise<{ readonly data: T; readonly rawResponse: RawResponse }>;
}

/**
 * Unwraps an `HttpResponsePromise<T>` into `{ data, response,
 * headers, requestId, status }`.
 *
 * Errors thrown by the underlying method (`ClockifyApiError`,
 * `ClockifyApiTimeoutError`, etc.) propagate unchanged — you can
 * still `catch` them and inspect `err.rawResponse` directly. The
 * helper only restructures the *success* path.
 *
 * @example
 * ```ts
 * import { createClockifyClient, withResponse } from "clockify-sdk-ts-115";
 *
 * const client = createClockifyClient({ apiKey: "..." });
 *
 * const { data: tags, requestId, status, headers } = await withResponse(
 *   client.tags.list({ workspaceId: "..." }),
 * );
 *
 * console.log(`request ${requestId} returned ${status} with ${tags.length} tags`);
 * console.log(`server rate-limit: ${headers.get("X-RateLimit-Remaining")}`);
 * ```
 *
 * @throws The same errors as the wrapped method (e.g.
 *   `NotFoundError`, `RateLimitError`, `ClockifyApiTimeoutError`,
 *   `ClockifyApiError`). Use `getRequestIdFromError(err)` to
 *   correlate failed requests with server traces.
 */
export async function withResponse<T>(
    promise: ResponseAwarePromise<T>,
): Promise<WithResponseResult<T>> {
    const { data, rawResponse } = await promise.withRawResponse();
    const requestId = rawResponse.headers.get(REQUEST_ID_HEADER) ?? undefined;
    return {
        data,
        response: rawResponse,
        headers: rawResponse.headers,
        requestId,
        status: rawResponse.status,
    };
}
