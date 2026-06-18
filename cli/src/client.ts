/**
 * Thin factory over `createClockifyClient` so every command shares
 * one configured SDK instance. Tests can substitute by passing a
 * pre-built client into the command functions directly.
 */
import { createClockifyClient } from "clockify-sdk-ts-115";

import type { CliConfig } from "./config.js";
import { requireApiKey } from "./config.js";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

export function buildClient(config: CliConfig): ClockifyClient {
    const apiKey = requireApiKey(config);
    // Strict by default: createClockifyClient enforces the Clockify host
    // allowlist (official Clockify API hosts + loopback) on `--base-url`
    // / CLOCKIFY_BASE_URL, so an arbitrary host is rejected with a clear
    // message rather than silently sending the API key off-host.
    return createClockifyClient({
        apiKey,
        allowInsecureBaseUrl: false,
        ...(config.baseUrl !== undefined ? { environment: config.baseUrl } : {}),
    });
}
