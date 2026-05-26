#!/usr/bin/env node
/**
 * @clockify115/cli entrypoint. Wires every command, parses global
 * flags, and routes errors through a single exit handler so the
 * process exit code reflects success or failure consistently.
 */
import { Command } from "commander";

import { buildClient } from "./client.js";
import type { GlobalFlags } from "./config.js";
import { loadConfig } from "./config.js";
import { printError, type OutputMode } from "./output.js";

import { registerStatusCommand } from "./commands/status.js";
import { registerStartCommand } from "./commands/start.js";
import { registerStopCommand } from "./commands/stop.js";
import { registerLogCommand } from "./commands/log.js";
import { registerEntriesCommand } from "./commands/entries.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerClientsCommand } from "./commands/clients.js";
import { registerTasksCommand } from "./commands/tasks.js";
import { registerTagsCommand } from "./commands/tags.js";
import { registerWebhooksCommand } from "./commands/webhooks.js";
import { registerInvoicesCommand } from "./commands/invoices.js";
import { registerExpensesCommand } from "./commands/expenses.js";
import { registerTimeOffCommand } from "./commands/timeoff.js";
import { registerSchedulingCommand } from "./commands/scheduling.js";
import { registerAuditLogCommand } from "./commands/auditlog.js";

export interface ResolvedFlags {
    mode: OutputMode;
    color: boolean;
}

/**
 * Build the commander program. Exposed for tests; the real binary
 * just calls `main(process.argv)`.
 */
export function buildProgram(): Command {
    const program = new Command();
    program
        .name("clockify115")
        .description("Clockify CLI from @clockify115/cli, built on clockify-sdk-ts-115.")
        .version("0.1.0")
        .option("--api-key <key>", "Clockify personal API key (or CLOCKIFY_API_KEY env var).")
        .option("--workspace <id>", "Clockify workspace ID (or CLOCKIFY_WORKSPACE_ID env var).")
        .option("--json", "Emit machine-readable JSON instead of human-friendly tables.", false)
        .option("--no-color", "Disable ANSI color output.")
        .showHelpAfterError(true);

    const services = {
        loadConfig,
        buildClient,
    };

    registerStatusCommand(program, services);
    registerStartCommand(program, services);
    registerStopCommand(program, services);
    registerLogCommand(program, services);
    registerEntriesCommand(program, services);
    registerProjectsCommand(program, services);
    registerClientsCommand(program, services);
    registerTasksCommand(program, services);
    registerTagsCommand(program, services);
    registerWebhooksCommand(program, services);
    registerInvoicesCommand(program, services);
    registerExpensesCommand(program, services);
    registerTimeOffCommand(program, services);
    registerSchedulingCommand(program, services);
    registerAuditLogCommand(program, services);

    return program;
}

/**
 * Resolve the global --json / --no-color flags into the shared
 * OutputOptions shape. Used by every command's handler.
 */
export function resolveFlags(program: Command): ResolvedFlags {
    const opts = program.opts<{ json?: boolean; color?: boolean }>();
    return {
        mode: opts.json ? "json" : "table",
        color: opts.color !== false && process.stdout.isTTY === true,
    };
}

export function globalFlags(program: Command): GlobalFlags {
    const opts = program.opts<{ apiKey?: string; workspace?: string }>();
    const out: GlobalFlags = {};
    if (opts.apiKey) out.apiKey = opts.apiKey;
    if (opts.workspace) out.workspace = opts.workspace;
    return out;
}

export async function main(argv: string[]): Promise<number> {
    const program = buildProgram();
    program.exitOverride();
    try {
        await program.parseAsync(argv);
        return 0;
    } catch (err) {
        if (isCommanderHelpError(err)) {
            return Number(err.exitCode ?? 0);
        }
        const message = err instanceof Error ? err.message : String(err);
        const flags = resolveFlags(program);
        printError(message, { mode: flags.mode, color: flags.color });
        return 1;
    }
}

function isCommanderHelpError(err: unknown): err is { exitCode?: number; code?: string } {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as { code?: unknown }).code === "string" &&
        ((err as { code: string }).code === "commander.helpDisplayed" ||
            (err as { code: string }).code === "commander.help" ||
            (err as { code: string }).code === "commander.version")
    );
}

// Run when invoked directly (not when imported by tests).
const invokedDirectly =
    typeof process !== "undefined" &&
    Array.isArray(process.argv) &&
    process.argv[1] !== undefined &&
    /(?:^|\/)(?:clockify115|clk115|index\.[jt]s)$/.test(process.argv[1]);

if (invokedDirectly) {
    main(process.argv).then(
        (code) => process.exit(code),
        (err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`fatal: ${message}`);
            process.exit(1);
        },
    );
}
