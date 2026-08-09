/**
 * Typed per-service Clockify routing configuration (ROUTE-002, P02-05).
 *
 * This resolves a caller's {@link ClockifyRoutingOptions} into a base URL
 * for one {@link ClockifyService}, following the fixed precedence: an
 * explicit per-service URL wins outright, then an approved region/subdomain
 * profile row, then whatever base URL the caller already resolved (the
 * generated per-operation default). `createClockifyClient` applies the
 * resolved map at request dispatch (see `buildServiceBaseUrlOverrides` and
 * the `serviceBaseUrls` client option), so the full dispatch precedence is
 * suppliedBaseUrl > suppliedEnvironment > serviceBaseUrl > operationBaseUrl.
 *
 * The region/subdomain URL templates below are a hand-written copy of the
 * H02-ROUTING-approved `docs/service-routing-matrix.json` global/regional
 * rows (that file is evidence tooling, not something wrapper runtime code
 * imports). `wrapper/tests/routing-matrix-equality.test.ts` fails closed if
 * the two drift, mirroring how `authenticated-boundary-fetch.ts`'s
 * `CLOCKIFY_PROD_HOSTS` keeps its own hand-written copy in sync.
 */
import { LOOPBACK_HOSTS } from "./authenticated-boundary-fetch.js";
import { isValidSubdomainLabel } from "./subdomain-label.js";

/** A Clockify service family with at least one live-proven operation
 *  routed to it. "pto" is intentionally excluded: the approved routing
 *  matrix confirms zero operations resolve there (dead/speculative host). */
export type ClockifyService = "regular" | "reports" | "audit";

/** A regional prefix with an approved (though not yet live-confirmed)
 *  routing template -- the set a workspace subdomain can attach to. */
type ClockifyRegionalPrefix = "eu" | "us" | "uk" | "au";

/** Every profile documented by Clockify. Only `"global"` is live-confirmed;
 *  every other value requires `acknowledgeUnconfirmedRegion: true`. */
export type ClockifyRegion = "global" | ClockifyRegionalPrefix | "developer";

export type ClockifyServiceBaseUrls = { readonly [K in ClockifyService]?: string };

/**
 * Routing configuration for one {@link createClockifyClient} call.
 * Mutually exclusive with the legacy `environment` / `baseUrl` options.
 */
export type ClockifyRoutingOptions =
    | { readonly profile: "global" }
    | {
          readonly profile: Exclude<ClockifyRegion, "global">;
          /** Required: this profile is documented but not yet live-confirmed
           *  against a real regional/subdomain workspace. See
           *  `docs/service-routing-matrix.json` `nonGoals`. */
          readonly acknowledgeUnconfirmedRegion: true;
      }
    | {
          readonly profile: "subdomain";
          /** A workspace subdomain changes only `reports` routing; `regular`
           *  stays on this region's own prefix host. */
          readonly region: ClockifyRegionalPrefix;
          readonly subdomain: string;
          readonly acknowledgeUnconfirmedRegion: true;
      }
    | {
          readonly profile: "custom";
          readonly services: ClockifyServiceBaseUrls;
          readonly allowCustomHttpsHosts: true;
      };

const REGIONAL_PREFIX_HOST: Readonly<Record<ClockifyRegionalPrefix, string>> = {
    eu: "euc1",
    us: "use2",
    uk: "euw2",
    au: "apse2",
};

/** Hand-written copy of `docs/service-routing-matrix.json`'s approved
 *  `profiles.<region>.{regular,reports}` rows (`audit`/`pto` are null for
 *  every non-global profile, so they are omitted here -- absence means
 *  "no override", not "unsupported service"). */
function regionalServiceUrl(service: ClockifyService, region: ClockifyRegion): string | undefined {
    if (region === "global") return undefined;
    if (region === "developer") {
        if (service === "regular") return "https://developer.clockify.me/api/v1";
        if (service === "reports") return "https://developer.clockify.me/report/v1";
        return undefined;
    }
    const prefix = REGIONAL_PREFIX_HOST[region];
    if (service === "regular") return `https://${prefix}.clockify.me/api/v1`;
    if (service === "reports") return `https://${prefix}.clockify.me/report/v1`;
    return undefined;
}

/**
 * Validate a routing configuration synchronously, before client
 * construction. Throws `TypeError` for anything the type system already
 * rejects for a TypeScript caller, so a plain-JS caller gets the same
 * defense-in-depth as the rest of `createClockifyClient`'s auth/host
 * validation.
 */
export function validateRoutingOptions(routing: ClockifyRoutingOptions | undefined): void {
    if (routing === undefined) return;

    // The declared parameter type is a promise TypeScript makes to TypeScript
    // callers only; it is erased at runtime and this validator exists precisely
    // because a plain-JS caller can pass anything. Read the flags through an
    // untrusted view so every check below is necessary by its own types, and so
    // `!== true` keeps rejecting truthy non-booleans such as 1 or "yes".
    const raw = routing as Record<string, unknown>;

    const profile = routing.profile;

    if (profile === "global") return;

    if (profile === "custom") {
        if (raw.allowCustomHttpsHosts !== true) {
            throw new TypeError(
                "createClockifyClient: routing.allowCustomHttpsHosts must be true to use a custom service map.",
            );
        }
        if (raw.services == null || typeof raw.services !== "object") {
            throw new TypeError(
                "createClockifyClient: routing.services must be an object naming at least one Clockify service (regular, reports, or audit) for a custom profile.",
            );
        }
        // Object.entries drops the `| undefined` an optional property carries,
        // so restore it: a JS caller can set `services.reports = undefined`.
        const services = Object.entries(routing.services) as Array<[string, string | undefined]>;
        let definedServiceCount = 0;
        for (const [service, url] of services) {
            if (service !== "regular" && service !== "reports" && service !== "audit") {
                throw new TypeError(
                    `createClockifyClient: routing.services.${service} is not a Clockify service (expected regular, reports, or audit).`,
                );
            }
            if (url === undefined) continue;
            definedServiceCount += 1;
            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                throw new TypeError(
                    `createClockifyClient: routing.services.${service} is not a parseable absolute URL.`,
                );
            }
            const isLoopback =
                LOOPBACK_HOSTS.has(parsed.hostname) ||
                LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
            const allowedProtocol =
                parsed.protocol === "https:" || (isLoopback && parsed.protocol === "http:");
            if (!allowedProtocol) {
                throw new TypeError(
                    `createClockifyClient: routing.services.${service} must use https:// (or http:// on a loopback host for testing); got ${parsed.protocol}`,
                );
            }
            if (parsed.username || parsed.password) {
                throw new TypeError(
                    `createClockifyClient: routing.services.${service} must not embed credentials in the URL.`,
                );
            }
        }
        if (definedServiceCount === 0) {
            throw new TypeError(
                "createClockifyClient: routing.services must name at least one Clockify service URL (regular, reports, or audit) for a custom profile.",
            );
        }
        return;
    }

    if (profile === "subdomain") {
        const region = (routing as { region?: unknown }).region;
        if (typeof region !== "string" || !(region in REGIONAL_PREFIX_HOST)) {
            throw new TypeError(
                `createClockifyClient: routing.region ${JSON.stringify(region)} has no regional prefix for a subdomain profile to attach to (expected one of ${Object.keys(REGIONAL_PREFIX_HOST).join(", ")}).`,
            );
        }
        if (raw.acknowledgeUnconfirmedRegion !== true) {
            throw new TypeError(
                "createClockifyClient: routing.acknowledgeUnconfirmedRegion must be true -- subdomain routing is documented but not yet live-confirmed.",
            );
        }
        if (!isValidSubdomainLabel(routing.subdomain)) {
            throw new TypeError(
                `createClockifyClient: routing.subdomain ${JSON.stringify(routing.subdomain)} is not a valid Clockify workspace-subdomain label.`,
            );
        }
        return;
    }

    const knownRegions: readonly string[] = ["global", "eu", "us", "uk", "au", "developer"];
    if (!knownRegions.includes(profile)) {
        throw new TypeError(
            `createClockifyClient: routing.profile ${JSON.stringify(profile)} is not a recognized Clockify routing profile (expected one of ${knownRegions.join(", ")}, "subdomain", or "custom").`,
        );
    }
    if (raw.acknowledgeUnconfirmedRegion !== true) {
        throw new TypeError(
            `createClockifyClient: routing.acknowledgeUnconfirmedRegion must be true to select the ${JSON.stringify(profile)} profile -- it is documented but not yet live-confirmed. See docs/service-routing-matrix.json.`,
        );
    }
}

const ALL_SERVICES: readonly ClockifyService[] = ["regular", "reports", "audit"];

/**
 * Resolve the routing override for one service, or `undefined` if `routing`
 * selects nothing for it (the caller's own default/fallback applies). This
 * is the override-only core: no fallback baked in, so both
 * {@link resolveServiceBaseUrl} (fallback applied per call) and
 * {@link buildServiceBaseUrlOverrides} (fallback applied once, per operation,
 * downstream in the generated request runtime) can share it.
 */
function resolveServiceOverride(
    service: ClockifyService,
    routing: ClockifyRoutingOptions | undefined,
): string | undefined {
    if (routing === undefined || routing.profile === "global") return undefined;

    if (routing.profile === "custom") {
        return routing.services[service];
    }

    if (routing.profile === "subdomain") {
        if (service === "reports") return `https://${routing.subdomain}.clockify.me/report/v1`;
        return regionalServiceUrl(service, routing.region);
    }

    return regionalServiceUrl(service, routing.profile);
}

/**
 * Resolve the effective base URL for one service. Precedence: (1) an
 * explicit per-service URL in a `custom` profile; (2) an approved
 * region/subdomain profile row; (3) `fallbackUrl` -- whatever the caller
 * already resolved as the default for this service (e.g. the generated
 * per-operation `baseUrl`).
 */
export function resolveServiceBaseUrl(
    service: ClockifyService,
    routing: ClockifyRoutingOptions | undefined,
    fallbackUrl: string,
): string {
    return resolveServiceOverride(service, routing) ?? fallbackUrl;
}

/**
 * Build the sparse per-service override map a constructed client carries
 * (only services `routing` actually names an override for -- a per-operation
 * service with no entry here keeps its own default/fallback host, which is
 * how a `custom` profile naming only `regular` leaves `reports`/`audit`
 * routed normally rather than erasing them). Returns `{}` for `undefined` or
 * the `global` profile (no overrides).
 */
export function buildServiceBaseUrlOverrides(
    routing: ClockifyRoutingOptions | undefined,
): Partial<Record<ClockifyService, string>> {
    const overrides: Partial<Record<ClockifyService, string>> = {};
    for (const service of ALL_SERVICES) {
        const override = resolveServiceOverride(service, routing);
        if (override !== undefined) overrides[service] = override;
    }
    return overrides;
}
