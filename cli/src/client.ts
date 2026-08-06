/**
 * Thin factory over `createClockifyClient` so every command shares
 * one configured SDK instance. Tests can substitute by passing a
 * pre-built client into the command functions directly.
 */
import type { createClockifyClient } from "clockify-sdk-ts-115";
import type { ClockifyRegion, ClockifyRoutingOptions } from "clockify-sdk-ts-115/create-client";

import type { CliConfig } from "./config.js";
import { requireApiKey } from "./config.js";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

const REGIONAL_PREFIXES = ["eu", "us", "uk", "au"] as const;
const KNOWN_REGIONS = ["global", ...REGIONAL_PREFIXES, "developer"] as const;

/**
 * Build a `ClockifyRoutingOptions` from `--region`/`--subdomain` (or their
 * env-var/rc-file equivalents). Explicitly naming a non-global region on the
 * command line is itself the deliberate act ROUTE-002's
 * `acknowledgeUnconfirmedRegion` flag exists to require -- the CLI supplies
 * it automatically rather than asking for a second confirmation flag.
 */
export function buildRoutingOptions(
    region: string | undefined,
    subdomain: string | undefined,
): ClockifyRoutingOptions | undefined {
    if (region === undefined && subdomain === undefined) return undefined;

    if (subdomain !== undefined) {
        if (region === undefined || !(REGIONAL_PREFIXES as readonly string[]).includes(region)) {
            throw new Error(
                `--subdomain requires --region (got ${JSON.stringify(region)}). Provide one of: ${REGIONAL_PREFIXES.join(", ")}.`,
            );
        }
        return {
            profile: "subdomain",
            region: region as (typeof REGIONAL_PREFIXES)[number],
            subdomain,
            acknowledgeUnconfirmedRegion: true,
        };
    }

    if (region === "global") return { profile: "global" };

    if (region === undefined || !(KNOWN_REGIONS as readonly string[]).includes(region)) {
        throw new Error(
            `Unrecognized Clockify region ${JSON.stringify(region)}. Provide one of ${KNOWN_REGIONS.join(", ")}.`,
        );
    }
    return {
        profile: region as Exclude<ClockifyRegion, "global">,
        acknowledgeUnconfirmedRegion: true,
    };
}

/**
 * Describe the routing the CLI resolved when it is not the live-confirmed
 * `global` profile. `buildRoutingOptions` supplies
 * `acknowledgeUnconfirmedRegion` on the operator's behalf, and `region` can
 * arrive from `~/.clockifyrc.json` or `CLOCKIFY_REGION` rather than an
 * explicit `--region`, so without this line a shared config could send
 * authenticated traffic to an unproven host with nothing on the record.
 * Returns `undefined` for `global` and for unrouted defaults.
 */
export function unconfirmedRegionNotice(
    routing: ClockifyRoutingOptions | undefined,
): string | undefined {
    if (routing === undefined || routing.profile === "global") return undefined;
    const host =
        routing.profile === "subdomain" ? `${routing.subdomain} (${routing.region})` : routing.profile;
    return `clk115: using the unconfirmed "${host}" Clockify profile. Only the global profile is live-confirmed; drop --region/--subdomain (and CLOCKIFY_REGION/CLOCKIFY_SUBDOMAIN or the rc-file entry) to route to api.clockify.me.`;
}

export async function buildClient(config: CliConfig): Promise<ClockifyClient> {
    const apiKey = requireApiKey(config);
    const routing = buildRoutingOptions(config.region, config.subdomain);
    if (routing !== undefined && config.baseUrl !== undefined) {
        throw new Error(
            "clk115: --region/--subdomain and --base-url configure the same thing two different ways; provide only one of them.",
        );
    }
    const notice = unconfirmedRegionNotice(routing);
    if (notice !== undefined) process.stderr.write(`${notice}\n`);
    // Lazy-load the SDK root only for commands that actually build a client.
    // Cold paths like --version, --help, and completion do not need the SDK barrel.
    const { createClockifyClient } = await import("clockify-sdk-ts-115");
    // Strict by default: createClockifyClient enforces the Clockify host
    // allowlist (official Clockify API hosts + loopback) on `--base-url`
    // / CLOCKIFY_BASE_URL, so an arbitrary host is rejected with a clear
    // message rather than silently sending the API key off-host. `routing`
    // and `baseUrl` are mutually exclusive at the type level, so build
    // whichever arm applies rather than spreading both into one literal.
    if (routing !== undefined) {
        return createClockifyClient({ apiKey, allowNonClockifyHttpsHost: false, routing });
    }
    return createClockifyClient({
        apiKey,
        allowNonClockifyHttpsHost: false,
        ...(config.baseUrl !== undefined ? { environment: config.baseUrl } : {}),
    });
}
