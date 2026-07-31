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
                `--subdomain requires --region to be one of ${REGIONAL_PREFIXES.join(", ")} (got ${JSON.stringify(region)}).`,
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

    if (!(KNOWN_REGIONS as readonly string[]).includes(region!)) {
        throw new Error(
            `Unrecognized Clockify region ${JSON.stringify(region)}. Provide one of ${KNOWN_REGIONS.join(", ")}.`,
        );
    }
    return {
        profile: region as Exclude<ClockifyRegion, "global">,
        acknowledgeUnconfirmedRegion: true,
    };
}

export async function buildClient(config: CliConfig): Promise<ClockifyClient> {
    const apiKey = requireApiKey(config);
    const routing = buildRoutingOptions(config.region, config.subdomain);
    if (routing !== undefined && config.baseUrl !== undefined) {
        throw new Error(
            "clk115: pass either --region/--subdomain or --base-url, not both -- they configure the same thing two different ways.",
        );
    }
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
