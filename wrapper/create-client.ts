/**
 * Recommended factory for `ClockifyApiClient`.
 *
 * Clockify exposes two mutually-exclusive auth schemes (`X-Api-Key`
 * and `X-Addon-Token`). The generated `BaseClientOptions` models
 * that as exactly-one auth; sending both headers makes Clockify
 * respond `HTTP 401 "Multiple or none auth tokens present"`.
 *
 * This factory accepts exactly one of `apiKey` or `addonToken`
 * (enforced at both compile time and runtime), falls back to env vars
 * when both are omitted, and always wraps the underlying `fetch` with
 * {@link composedFetch} so every constructed client gets a `User-Agent` and `X-Request-Id`
 * header by default. Opt-out + advanced configuration flow through
 * the same options object — see {@link CreateClockifyClientOptions}.
 */
import {
    composedFetch,
    type ComposedFetchHooks,
    type ErrorContext,
    type RequestContext,
    type ResponseContext,
    type RetryContext,
    type RetryPolicy,
} from "./composed-fetch.js";
import { clockifyHealth, type HealthCheckResult } from "./health.js";
import {
    authenticatedBoundaryFetch,
    classifyClockifyBaseUrl,
    validateClockifyBaseUrl,
    type ClockifyBaseUrlClassification,
} from "./internal/authenticated-boundary-fetch.js";
import { Workspace } from "./scoped-client.js";
import type { BaseClientOptions } from "./src/BaseClient.js";
import { ClockifyApiClient } from "./src/index.js";

export { classifyClockifyBaseUrl, validateClockifyBaseUrl };
export type { ClockifyBaseUrlClassification };

/** Mix debug logging into the user's hooks. Debug logs fire FIRST,
 *  then the user's hooks run — order chosen so the user's hook
 *  errors (which we already log via console.warn in composedFetch)
 *  don't suppress the debug line. */
function mixDebugHooks(userHooks: ComposedFetchHooks | undefined): ComposedFetchHooks {
    return {
        beforeRequest: async (ctx: RequestContext) => {
            console.debug(`[clockify] → ${ctx.method} ${ctx.url} [${ctx.requestId ?? "no-id"}]`);
            await userHooks?.beforeRequest?.(ctx);
        },
        afterResponse: async (ctx: ResponseContext) => {
            console.debug(
                `[clockify] ← ${ctx.response.status} (${ctx.durationMs}ms) [${ctx.requestId ?? "no-id"}]`,
            );
            await userHooks?.afterResponse?.(ctx);
        },
        onError: async (ctx: ErrorContext) => {
            const errLabel =
                ctx.error instanceof Error ? ctx.error.constructor.name : String(ctx.error);
            console.debug(
                `[clockify] ✘ ${errLabel} (${ctx.durationMs}ms) [${ctx.requestId ?? "no-id"}]`,
            );
            await userHooks?.onError?.(ctx);
        },
        onRetry: async (ctx: RetryContext) => {
            console.debug(
                `[clockify] ↺ retry attempt ${ctx.nextAttempt} (delay ${ctx.delayMs}ms) [${ctx.requestId ?? "no-id"}]`,
            );
            await userHooks?.onRetry?.(ctx);
        },
    };
}

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
     *  default `clockify-sdk-ts-115/<ver> (Node.js <ver>; <platform> <arch>)`
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
     *  retry loop replaces the generated client's retry layer — the
     *  factory automatically passes `maxRetries: 0` to that layer.
     *  Pass `false` to disable retries entirely. Omit to keep generated retry
     *  behavior (1s initial / 60s max / 20% jitter / 408+429+5xx). */
    retryPolicy?: RetryPolicy | false;
    /** Generated-client retry attempts (effective only when
     *  `retryPolicy` is omitted; ignored otherwise to avoid nested
     *  retry loops). Default `2`. */
    maxRetries?: number;
    /**
     * When `true`, the SDK auto-wires `console.debug` logging at
     * request/response/error/retry boundaries. Useful for local
     * development; turn off in production to avoid log noise (and
     * to avoid leaking URLs / request IDs into logs).
     *
     * Composes additively with user-provided `hooks` — both fire.
     * Off by default.
     */
    debug?: boolean;
    /**
     * Allow a non-Clockify base URL (`environment` / `baseUrl`).
     *
     * By default the factory only accepts the official Clockify API
     * hosts (`api.clockify.me`, `reports.api.clockify.me`,
     * `auditlog-api.api.clockify.me`, `pto.api.clockify.me`,
     * `developer.clockify.me`) and loopback hosts (`localhost`,
     * `127.0.0.1`, `::1`) for testing/mocking — every other host is
     * rejected so a tampered env var or config file cannot redirect
     * authenticated requests (and their `X-Api-Key` / `X-Addon-Token`
     * headers) to an attacker-controlled endpoint.
     *
     * Set `true` only when you intentionally point the SDK at a
     * Clockify-compatible proxy or self-hosted endpoint and accept the
     * risk. Plain `http://` is always rejected regardless of this flag.
     *
     * Off by default.
     */
    allowNonClockifyHttpsHost?: boolean;
    /** @deprecated Use `allowNonClockifyHttpsHost`. Removed in 1.0. */
    allowInsecureBaseUrl?: boolean;
}

/**
 * Options for {@link createClockifyClient}. Three valid shapes:
 *
 * - **Explicit `apiKey`** (personal-token auth via `X-Api-Key`).
 * - **Explicit `addonToken`** (marketplace-addon auth via
 *   `X-Addon-Token`).
 * - **Neither** — both keys omitted; the factory then reads
 *   `process.env.CLOCKIFY_API_KEY` (preferred) or
 *   `process.env.CLOCKIFY_ADDON_TOKEN` at construction time. Throws
 *   if both env vars are also absent.
 *
 * Providing both `apiKey` AND `addonToken` is rejected at the TS
 * type level AND at runtime (`HTTP 401 "Multiple or none auth
 * tokens present"` otherwise — Clockify enforces exclusivity).
 * Other `BaseClientOptions` fields (`environment`, `baseUrl`,
 * `headers`, `timeoutInSeconds`, `logging`, `auth`) flow through
 * unchanged.
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
          })
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements & {
              /** Both auth keys omitted — factory reads from env at
               *  construction time (CLOCKIFY_API_KEY preferred over
               *  CLOCKIFY_ADDON_TOKEN). */
              apiKey?: never;
              addonToken?: never;
          });

/** Env-var names the factory reads when neither auth option is
 *  passed explicitly. The naming mirrors Clockify's own documented
 *  shell-env conventions (used in their CLI examples) and matches
 *  the Stripe / OpenAI / Anthropic SDKs' precedent. */
const ENV_APIKEY = "CLOCKIFY_API_KEY";
const ENV_ADDON_TOKEN = "CLOCKIFY_ADDON_TOKEN";

/** Read a non-empty env-var value (returns `undefined` for absent
 *  or empty strings). Centralised so the factory's env-fallback
 *  logic is testable in isolation if it grows. */
function readEnv(name: string): string | undefined {
    const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
    return value != null && value !== "" ? value : undefined;
}

/**
 * Construct a `ClockifyApiClient` with the documented single-scheme
 * auth model and the SDK's default observability headers
 * (`User-Agent`, `X-Request-Id`) wired up. Opt out or configure
 * further via the {@link ClockifyClientEnhancements} fields.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts-115/create-client";
 *
 * // Simplest case — env-var driven. Reads CLOCKIFY_API_KEY
 * // (preferred) or CLOCKIFY_ADDON_TOKEN from the environment.
 * const client = createClockifyClient();
 *
 * // Explicit apiKey:
 * const explicit = createClockifyClient({ apiKey: "..." });
 *
 * // With observability hooks + custom retry policy:
 * const observed = createClockifyClient({
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
 * @throws TypeError if both `apiKey` AND `addonToken` are passed
 *   explicitly (the TS type also rejects this), or if neither is
 *   passed AND neither `CLOCKIFY_API_KEY` nor `CLOCKIFY_ADDON_TOKEN`
 *   is set in the environment.
 */
/** The type returned by {@link createClockifyClient}: a standard
 *  `ClockifyApiClient` extended with the `.workspace(id)` factory
 *  and the `.health()` preflight check. */
export type ClockifyClient = ClockifyApiClient & {
    workspace(id: string): Workspace;
    health(): Promise<HealthCheckResult>;
};

/** Attach `.workspace(id)` factory to a constructed `ClockifyApiClient`. */
function attachWorkspace(
    client: ClockifyApiClient,
): ClockifyApiClient & { workspace(id: string): Workspace } {
    (client as ClockifyApiClient & { workspace?: (id: string) => Workspace }).workspace = function (
        id: string,
    ): Workspace {
        return new Workspace(client, id);
    };
    return client as ClockifyApiClient & { workspace(id: string): Workspace };
}

/** Attach `.health()` preflight to a constructed `ClockifyApiClient`. */
function attachHealth<T extends ClockifyApiClient>(
    client: T,
): T & { health(): Promise<HealthCheckResult> } {
    (client as T & { health?: () => Promise<HealthCheckResult> }).health =
        function (): Promise<HealthCheckResult> {
            return clockifyHealth(client);
        };
    return client as T & { health(): Promise<HealthCheckResult> };
}

export function createClockifyClient(options: CreateClockifyClientOptions = {}): ClockifyClient {
    const hasExplicitApiKey = "apiKey" in options && options.apiKey != null;
    const hasExplicitAddonToken = "addonToken" in options && options.addonToken != null;

    if (hasExplicitApiKey && hasExplicitAddonToken) {
        // Callers must provide exactly one of `apiKey` or `addonToken`.
        throw new TypeError(
            "createClockifyClient: pass only one of `apiKey` or `addonToken`, not both.",
        );
    }

    const {
        fetch: rawFetch,
        userAgent,
        requestId,
        hooks,
        retryPolicy,
        maxRetries,
        debug,
        allowNonClockifyHttpsHost,
        allowInsecureBaseUrl,
        // Pull auth fields off the rest spread so `passthrough` only
        // carries the non-auth BaseClientOptions fields (environment,
        // headers, etc.) — we re-add the resolved auth below.
        apiKey: _explicitApiKey,
        addonToken: _explicitAddonToken,
        ...passthrough
    } = options as ClockifyClientEnhancements &
        WithoutAuthOrEnhancements & {
            apiKey?: BaseClientOptions["apiKey"];
            addonToken?: BaseClientOptions["addonToken"];
            baseUrl?: BaseClientOptions["environment"];
        };

    // Enforce the Clockify host allowlist on any base-URL override
    // (`environment` and the `baseUrl` alias). A tampered env var or
    // config file must not be able to redirect authenticated requests
    // — and their auth headers — to an attacker-controlled host. String
    // suppliers resolve at request time and pass through unvalidated.
    const { environment: rawEnvironment, baseUrl: rawBaseUrl, ...basePassthrough } = passthrough;
    const allowAlternateHost = allowNonClockifyHttpsHost ?? allowInsecureBaseUrl ?? false;
    const validatedEnvironment = validateClockifyBaseUrl(rawEnvironment, allowAlternateHost);
    const validatedBaseUrl = validateClockifyBaseUrl(rawBaseUrl, allowAlternateHost);
    const sanitizedPassthrough = {
        ...basePassthrough,
        ...(validatedEnvironment !== undefined ? { environment: validatedEnvironment } : {}),
        ...(validatedBaseUrl !== undefined ? { baseUrl: validatedBaseUrl } : {}),
    };

    // Resolve effective auth. Explicit options always win over env
    // vars; among env vars, CLOCKIFY_API_KEY is preferred over
    // CLOCKIFY_ADDON_TOKEN (matches Clockify's own docs which lead
    // with personal-API-key auth). The Stripe / OpenAI / Anthropic
    // SDK convention is the same shape: implicit env-var fallback
    // with explicit options taking precedence.
    let effectiveApiKey: BaseClientOptions["apiKey"] | undefined;
    let effectiveAddonToken: BaseClientOptions["addonToken"] | undefined;
    if (hasExplicitApiKey) {
        effectiveApiKey = _explicitApiKey;
    } else if (hasExplicitAddonToken) {
        effectiveAddonToken = _explicitAddonToken;
    } else {
        const envApiKey = readEnv(ENV_APIKEY);
        const envAddonToken = readEnv(ENV_ADDON_TOKEN);
        if (envApiKey != null) {
            effectiveApiKey = envApiKey;
        } else if (envAddonToken != null) {
            effectiveAddonToken = envAddonToken;
        }
    }

    if (effectiveApiKey == null && effectiveAddonToken == null) {
        throw new TypeError(
            `createClockifyClient: must provide exactly one of \`apiKey\` or \`addonToken\` (or set ${ENV_APIKEY} / ${ENV_ADDON_TOKEN} in the environment).`,
        );
    }

    // Build the effective hooks: debug logs ⊕ user hooks
    const effectiveHooks = debug ? mixDebugHooks(hooks) : hooks;

    const wrappedFetch = composedFetch({
        fetch: authenticatedBoundaryFetch(rawFetch, allowAlternateHost),
        ...(userAgent !== undefined ? { userAgent } : {}),
        ...(requestId !== undefined ? { requestId } : {}),
        ...(effectiveHooks !== undefined ? { hooks: effectiveHooks } : {}),
        ...(retryPolicy !== undefined ? { retryPolicy } : {}),
    });

    // When the user supplies a retry policy, our composed-fetch is
    // the retry layer — disable the generated client's retry layer to
    // avoid nested loops. Otherwise honor whatever maxRetries the user
    // passed (or the generated client's default of 2).
    const effectiveMaxRetries = retryPolicy !== undefined ? 0 : maxRetries;

    const base = {
        ...sanitizedPassthrough,
        allowNonClockifyHttpsHost: allowAlternateHost,
        fetch: wrappedFetch,
        ...(effectiveMaxRetries !== undefined ? { maxRetries: effectiveMaxRetries } : {}),
    };

    if (effectiveApiKey != null) {
        return attachHealth(
            attachWorkspace(
                new ClockifyApiClient({
                    ...base,
                    apiKey: effectiveApiKey,
                }),
            ),
        );
    }

    return attachHealth(
        attachWorkspace(
            new ClockifyApiClient({
                ...base,
                addonToken: effectiveAddonToken!,
            }),
        ),
    );
}
