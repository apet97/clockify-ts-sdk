/**
 * Thin factory over `createClockifyClient` so every command shares
 * one configured SDK instance. Tests can substitute by passing a
 * pre-built client into the command functions directly.
 */
import type { createClockifyClient } from "clockify-sdk-ts-115";

import type { CliConfig } from "./config.js";
import { requireApiKey } from "./config.js";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

export async function buildClient(config: CliConfig): Promise<ClockifyClient> {
    const apiKey = requireApiKey(config);
    // Lazy-load the SDK root only for commands that actually build a client.
    // Cold paths like --version, --help, and completion do not need the SDK barrel.
    const { createClockifyClient } = await import("clockify-sdk-ts-115");
    // Strict by default: createClockifyClient enforces the Clockify host
    // allowlist (official Clockify API hosts + loopback) on `--base-url`
    // / CLOCKIFY_BASE_URL, so an arbitrary host is rejected with a clear
    // message rather than silently sending the API key off-host.
    return createClockifyClient({
        apiKey,
        allowNonClockifyHttpsHost: false,
        ...(config.baseUrl !== undefined ? { environment: config.baseUrl } : {}),
    });
}
