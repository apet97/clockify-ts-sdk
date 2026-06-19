/**
 * Helpers shared by command modules: resolves the workspace + client
 * + output options in one call, so each handler is a short orchestration.
 */
import type { Command } from "commander";

import type { ClockifyClient } from "../client.js";
import { requireWorkspaceId } from "../config.js";
import type { CliConfig } from "../config.js";
import { globalFlags, resolveFlags } from "../index.js";
import type { OutputOptions } from "../output.js";

import type { Services } from "./types.js";

export interface BaseContext {
    client: ClockifyClient;
    config: CliConfig;
    output: OutputOptions;
}

export interface ResolvedContext {
    client: ClockifyClient;
    workspaceId: string;
    output: OutputOptions;
}

/**
 * Walk the commander tree to find the root program (where the global
 * flags live). Subcommands are nested via `addCommand`, so we hop
 * up parents until parent is null.
 */
function rootProgram(cmd: Command): Command {
    let current: Command = cmd;
    while (current.parent != null) {
        current = current.parent;
    }
    return current;
}

/**
 * Resolve client, config, and output without requiring a workspace.
 * Used by commands (like `api`) that only need a workspace for some paths.
 */
export async function resolveBaseContext(cmd: Command, services: Services): Promise<BaseContext> {
    const program = rootProgram(cmd);
    const config = services.loadConfig(globalFlags(program));
    const client = await services.buildClient(config);
    const output = resolveFlags(program);
    return { client, config, output };
}

export async function resolveContext(cmd: Command, services: Services): Promise<ResolvedContext> {
    const { client, config, output } = await resolveBaseContext(cmd, services);
    return { client, workspaceId: requireWorkspaceId(config), output };
}
