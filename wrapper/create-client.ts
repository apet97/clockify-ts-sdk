/**
 * Recommended factory for `ClockifyApiClient`.
 *
 * Clockify exposes two mutually-exclusive auth schemes (`X-Api-Key`
 * and `X-Addon-Token`). The Fern-generated `BaseClientOptions`
 * types both fields as required even though the OpenAPI security
 * block is an OR — sending both headers makes Clockify respond
 * `HTTP 401 "Multiple or none auth tokens present"`. Tracked as
 * `fern.sdk.auth.addonToken-typed-required-but-mutually-exclusive`
 * in `spec/evidence/discrepancies.md`.
 *
 * This factory accepts exactly one of `apiKey` or `addonToken`
 * (enforced at both compile time and runtime), nulls the other
 * field via the documented supplier-returns-undefined pattern, and
 * always wraps the underlying `fetch` with {@link composedFetch} so
 * every constructed client gets a `User-Agent` and `X-Request-Id`
 * header by default. Opt-out + advanced configuration flow through
 * the same options object — see {@link CreateClockifyClientOptions}.
 */
import type { BaseClientOptions } from "./src/BaseClient.js";
import { ClockifyApiClient } from "./src/index.js";
import { composedFetch, type ComposedFetchHooks, type RetryPolicy } from "./composed-fetch.js";

type WithoutAuthOrEnhancements = Omit<
    BaseClientOptions,
    "apiKey" | "addonToken" | "fetch" | "maxRetries"
>;

/** Extra knobs the factory understands beyond raw `BaseClientOptions`.
 *  Every field is optional; defaults are documented per-field below. */
export interface ClockifyClientEnhancements {
    /** Custom underlying `fetch`. Default `globalThis.fetch`. */
    fetch?: typeof fetch;
    /** `User-Agent` header injection. `true` (default): inject the
     *  default `clockify-sdk-ts/<ver> (Node.js <ver>; <platform> <arch>)`
     *  string. `false`: leave the header alone. string: use as-is. */
    userAgent?: boolean | string;
    /** `X-Request-Id` header injection. `true` (default): inject a
     *  UUID v4 per request. `false`: leave alone. function: call to
     *  generate the ID per request. If the caller already set the
     *  header on the request, that value is preserved. */
    requestId?: boolean | (() => string);
    /** Lifecycle hooks (`beforeRequest`, `afterResponse`, `onError`,
     *  `onRetry`). Hooks are best-effort — rejections are logged via
     *  `console.warn` but never block the request. */
    hooks?: ComposedFetchHooks;
    /** Override the retry policy. When set (truthy), the wrapper's
     *  retry loop replaces Fern's internal retry — the factory
     *  automatically passes `maxRetries: 0` to Fern. Pass `false` to
     *  disable retries entirely. Omit to keep Fern's default retry
     *  behavior (1s initial / 60s max / 20% jitter / 408+429+5xx). */
    retryPolicy?: RetryPolicy | false;
    /** Fern's internal retry attempts (effective only when
     *  `retryPolicy` is omitted; ignored otherwise to avoid nested
     *  retry loops). Default `2`. */
    maxRetries?: number;
}

/**
 * Options for {@link createClockifyClient}. Discriminated union: pass
 * `apiKey` XOR `addonToken`, never both. Other `BaseClientOptions`
 * fields (`environment`, `baseUrl`, `headers`, `timeoutInSeconds`,
 * `logging`, `auth`) flow through unchanged.
 */
export type CreateClockifyClientOptions =
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements & {
              /** Personal-token auth header (`X-Api-Key`). */
              apiKey: BaseClientOptions["apiKey"];
              addonToken?: never;
          })
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements & {
              /** Marketplace-addon auth header (`X-Addon-Token`). */
              addonToken: BaseClientOptions["addonToken"];
              apiKey?: never;
          });

const NULL_SUPPLIER = (() => undefined) as unknown as () => string;

/**
 * Construct a `ClockifyApiClient` with the documented single-scheme
 * auth model and the SDK's default observability headers
 * (`User-Agent`, `X-Request-Id`) wired up. Opt out or configure
 * further via the {@link ClockifyClientEnhancements} fields.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts/create-client";
 *
 * // Simplest case — apiKey only; UA + req-id auto-injected.
 * const client = createClockifyClient({
 *   apiKey: process.env.CLOCKIFY_API_KEY!,
 * });
 *
 * // With observability hooks + custom retry policy:
 * const observed = createClockifyClient({
 *   apiKey: process.env.CLOCKIFY_API_KEY!,
 *   hooks: {
 *     beforeRequest: ({ method, url, requestId }) =>
 *       console.log(`→ ${method} ${url} [${requestId}]`),
 *     afterResponse: ({ response, durationMs }) =>
 *       console.log(`← ${response.status} (${durationMs}ms)`),
 *   },
 *   retryPolicy: { maxRetries: 5, retryableStatusCodes: [500, 502, 503] },
 * });
 * ```
 *
 * @throws TypeError if neither `apiKey` nor `addonToken` is provided,
 *   or if both are provided. Both conditions are also rejected at
 *   the TS type level via the discriminated-union options shape.
 */
export function createClockifyClient(options: CreateClockifyClientOptions): ClockifyApiClient {
    const hasApiKey = "apiKey" in options && options.apiKey != null;
    const hasAddonToken = "addonToken" in options && options.addonToken != null;

    if (hasApiKey && hasAddonToken) {
        throw new TypeError(
            "createClockifyClient: pass only one of `apiKey` or `addonToken`, not both.",
        );
    }
    if (!hasApiKey && !hasAddonToken) {
        throw new TypeError(
            "createClockifyClient: must provide exactly one of `apiKey` or `addonToken`.",
        );
    }

    const {
        fetch: rawFetch,
        userAgent,
        requestId,
        hooks,
        retryPolicy,
        maxRetries,
        ...auth
    } = options as ClockifyClientEnhancements &
        WithoutAuthOrEnhancements & {
            apiKey?: BaseClientOptions["apiKey"];
            addonToken?: BaseClientOptions["addonToken"];
        };

    const wrappedFetch = composedFetch({
        fetch: rawFetch,
        userAgent,
        requestId,
        hooks,
        retryPolicy,
    });

    // When the user supplies a retry policy, our composed-fetch is
    // the retry layer — disable Fern's internal retry to avoid
    // nested loops. Otherwise honor whatever maxRetries the user
    // passed (or Fern's default of 2).
    const effectiveMaxRetries = retryPolicy !== undefined ? 0 : maxRetries;

    const base = {
        ...auth,
        fetch: wrappedFetch,
        ...(effectiveMaxRetries !== undefined ? { maxRetries: effectiveMaxRetries } : {}),
    };

    if (hasApiKey) {
        return new ClockifyApiClient({
            ...base,
            apiKey: (auth as { apiKey: BaseClientOptions["apiKey"] }).apiKey,
            addonToken: NULL_SUPPLIER,
        });
    }

    return new ClockifyApiClient({
        ...base,
        addonToken: (auth as { addonToken: BaseClientOptions["addonToken"] }).addonToken,
        apiKey: NULL_SUPPLIER,
    });
}
