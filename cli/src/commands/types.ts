/**
 * Shared types used by every command module. Centralised so the
 * top-level wiring in index.ts can pass one `Services` bag and the
 * individual command files declare what they consume.
 */
import type { Command } from "commander";

import type { ClockifyClient } from "../client.js";
import type { CliConfig, GlobalFlags } from "../config.js";

export interface Services {
    loadConfig: (flags?: GlobalFlags, env?: NodeJS.ProcessEnv) => CliConfig;
    buildClient: (config: CliConfig) => ClockifyClient | Promise<ClockifyClient>;
}

export type Registrar = (program: Command, services: Services) => void;
