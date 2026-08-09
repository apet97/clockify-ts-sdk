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
import { hostEnvVar } from "./internal/host-env.js";
import {
    buildServiceBaseUrlOverrides,
    validateRoutingOptions,
    type ClockifyRegion,
    type ClockifyRoutingOptions,
    type ClockifyService,
    type ClockifyServiceBaseUrls,
} from "./internal/routing.js";
import { Workspace } from "./scoped-client.js";
import type { BaseClientOptions } from "./src/BaseClient.js";
import { ClockifyApiClient } from "./src/index.js";

export { classifyClockifyBaseUrl, validateClockifyBaseUrl };
export type {
    ClockifyBaseUrlClassification,
    ClockifyRegion,
    ClockifyRoutingOptions,
    ClockifyService,
    ClockifyServiceBaseUrls,
};

/** Mix debug logging into the user's hooks. Debug logs fire FIRST,
 *  then the user's hooks run — order chosen so the user's hook
 *  errors (which we already log via console.warn in composedFetch)
 *  don't suppress the debug line. */
function mixDebugHooks(userHooks: ComposedFetchHooks | undefined): ComposedFetchHooks {
    return {
        // Spread the user's hooks first so every key this function does NOT
        // wrap (`onMetric` today, any future key) still fires under `debug`.
        // The four explicit wrappers below override their copies, preserving
        // the documented "debug logs fire FIRST, then the user's hooks" order.
        ...userHooks,
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
    | "apiKey"
    | "addonToken"
    | "fetch"
    | "maxRetries"
    | "environment"
    | "baseUrl"
    | "serviceBaseUrls"
    | "auth"
>;

/**
 * Either the legacy blanket host override (`environment` / `baseUrl`) or the
 * new per-service {@link ClockifyRoutingOptions} — never both. Mixing them
 * has no well-defined precedence (which one wins?), so it is rejected at
 * both the type level (this union) and at runtime for plain-JS callers (see
 * {@link createClockifyClient}'s `hasRouting && hasLegacyHost` check).
 */
type ClockifyHostOrRouting =
    | {
          /** Legacy blanket base-URL override. Kept for one pre-1.0
           *  transition; prefer `routing` for new code. */
          environment?: BaseClientOptions["environment"];
          /** Alias for `environment`. */
          baseUrl?: BaseClientOptions["environment"];
          routing?: undefined;
      }
    | {
          environment?: never;
          baseUrl?: never;
          /** Per-service routing configuration. See {@link ClockifyRoutingOptions}. */
          routing: ClockifyRoutingOptions;
      };

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
     * `auditlog-api.api.clockify.me`, `developer.clockify.me`), the four
     * approved regional hosts (`euc1.clockify.me`, `use2.clockify.me`,
     * `euw2.clockify.me`, `apse2.clockify.me`), any well-formed
     * single-label workspace-subdomain host, and loopback hosts
     * (`localhost`, `127.0.0.1`, `::1`) for testing/mocking — every other
     * host is rejected so a tampered env var or config file cannot
     * redirect authenticated requests (and their `X-Api-Key` /
     * `X-Addon-Token` headers) to an attacker-controlled endpoint.
     *
     * Set `true` only when you intentionally point the SDK at a
     * Clockify-compatible proxy or self-hosted endpoint and accept the
     * risk. Plain `http://` is always rejected regardless of this flag.
     *
     * Off by default.
     */
    allowNonClockifyHttpsHost?: boolean;
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
 * Other safe `BaseClientOptions` fields (`environment`, `baseUrl`,
 * `headers`, `timeoutInSeconds`, `logging`) flow through unchanged.
 *
 * **`timeoutInSeconds` has no default: omit it and a request waits
 * until the socket itself gives up.** That is deliberate — Clockify's
 * detailed-report and export routes can legitimately run for minutes,
 * so the SDK will not pick a ceiling on your behalf. Any caller whose
 * recovery logic depends on a timeout firing must set one: pass
 * `timeoutInSeconds` here for every request, or `withRequestTimeout(n)`
 * for one call.
 * Advanced custom/no-auth providers remain available on the generated
 * `ClockifyApiClient` constructor; accepting `auth` here would create a
 * second credential source alongside this factory's exact-one model.
 */
export type CreateClockifyClientOptions =
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements &
          ClockifyHostOrRouting & {
              /** Personal-token auth header (`X-Api-Key`). */
              apiKey: BaseClientOptions["apiKey"];
              addonToken?: never;
          })
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements &
          ClockifyHostOrRouting & {
              /** Marketplace-addon auth header (`X-Addon-Token`). */
              addonToken: BaseClientOptions["addonToken"];
              apiKey?: never;
          })
    | (WithoutAuthOrEnhancements &
          ClockifyClientEnhancements &
          ClockifyHostOrRouting & {
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
    const value = hostEnvVar(name);
    return value != null && value !== "" ? value : undefined;
}

/** A blank explicit credential is "not supplied". The env path already treats
 *  `CLOCKIFY_API_KEY=""` as absent (see `readEnv`); an explicitly-passed "" (or
 *  whitespace) must reach the same TypeError instead of constructing a client
 *  that 401s ("Multiple or none auth tokens present") on its first call.
 *  Only a literal string is inspected — `Supplier` forms (a function or a
 *  promise, e.g. `apiKey: () => fetchKey()`) resolve later and pass through. */
function isBlankCredential(value: unknown): boolean {
    return typeof value === "string" && value.trim() === "";
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
        routing,
        serviceBaseUrls: rawServiceBaseUrls,
        auth: rawAuth,
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
            environment?: BaseClientOptions["environment"];
            baseUrl?: BaseClientOptions["environment"];
            routing?: ClockifyRoutingOptions;
            serviceBaseUrls?: BaseClientOptions["serviceBaseUrls"];
            auth?: BaseClientOptions["auth"];
        };

    // Enforce the Clockify host allowlist on any base-URL override
    // (`environment` and the `baseUrl` alias). A tampered env var or
    // config file must not be able to redirect authenticated requests
    // — and their auth headers — to an attacker-controlled host. String
    // suppliers resolve at request time and pass through unvalidated.
    const { environment: rawEnvironment, baseUrl: rawBaseUrl, ...basePassthrough } = passthrough;

    // `serviceBaseUrls` is the generated runtime's internal dispatch map.
    // Accepting it here would bypass the validation and acknowledgement gates
    // owned by the public `routing` option.
    if (rawServiceBaseUrls !== undefined) {
        throw new TypeError(
            "createClockifyClient: `serviceBaseUrls` is internal; use the validated `routing` option instead.",
        );
    }

    // This factory owns one credential source: its top-level `apiKey` /
    // `addonToken` pair (or the matching env fallback). Passing the generated
    // client's `auth` option as well would let a second provider replace those
    // credentials and reintroduce generated-only settings after validation.
    // Advanced auth belongs on ClockifyApiClient itself.
    if (rawAuth !== undefined) {
        throw new TypeError(
            "createClockifyClient: `auth` is not accepted; construct `ClockifyApiClient` directly for custom or disabled authentication.",
        );
    }

    // `routing` and the legacy `environment`/`baseUrl` override have no
    // well-defined precedence together (which one wins?), so they are
    // mutually exclusive. The TS type already rejects this for a
    // TypeScript caller; this is the runtime backstop for a plain-JS one.
    if (routing !== undefined && (rawEnvironment !== undefined || rawBaseUrl !== undefined)) {
        throw new TypeError(
            "createClockifyClient: pass either `routing` or `environment`/`baseUrl`, not both.",
        );
    }
    validateRoutingOptions(routing);
    const serviceBaseUrls = buildServiceBaseUrlOverrides(routing);

    // A `custom` routing profile already validated its own service URLs
    // (HTTPS, no embedded credentials) in validateRoutingOptions above via
    // its required `allowCustomHttpsHosts: true` opt-in. Requiring the
    // separate `allowNonClockifyHttpsHost` flag too, just for the final
    // dispatch boundary to also trust those same URLs, would be a
    // redundant second opt-in for a decision the caller already made
    // explicitly -- so selecting `custom` satisfies both.
    const allowAlternateHost = routing?.profile === "custom" || allowNonClockifyHttpsHost === true;
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

    if (
        (effectiveApiKey == null || isBlankCredential(effectiveApiKey)) &&
        (effectiveAddonToken == null || isBlankCredential(effectiveAddonToken))
    ) {
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
        ...(Object.keys(serviceBaseUrls).length > 0 ? { serviceBaseUrls } : {}),
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
