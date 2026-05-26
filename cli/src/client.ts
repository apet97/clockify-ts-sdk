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
    return createClockifyClient({ apiKey });
}
