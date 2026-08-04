#!/usr/bin/env node
/**
 * @apet97/clockify-cli-115 entrypoint. Wires every command, parses global
 * flags, and routes errors through a single exit handler so the
 * process exit code reflects success or failure consistently.
 * Unknown commands (commander.unknownCommand) and unknown options
 * return exit code 2 to match the documented usage-error contract.
 */
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { Command, InvalidArgumentError } from "commander";

import { buildClient } from "./client.js";
import { registerApiCommand } from "./commands/api.js";
import { registerAuditLogCommand } from "./commands/auditlog.js";
import { registerClientsCommand } from "./commands/clients.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerEntriesCommand } from "./commands/entries.js";
import { registerExpensesCommand } from "./commands/expenses.js";
import { registerInvoicesCommand } from "./commands/invoices.js";
import { leafCommand } from "./commands/leaf-command.js";
import { registerLogCommand } from "./commands/log.js";
import { registerProjectsCommand } from "./commands/projects.js";
import { registerReportsCommand } from "./commands/reports.js";
import { registerSchedulingCommand } from "./commands/scheduling.js";
import { registerSharedReportsCommand } from "./commands/sharedReports.js";
import { registerStartCommand } from "./commands/start.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerStopCommand } from "./commands/stop.js";
import { registerTagsCommand } from "./commands/tags.js";
import { registerTasksCommand } from "./commands/tasks.js";
import { registerTimeOffCommand } from "./commands/timeoff.js";
import type { Services } from "./commands/types.js";
import { registerUsersCommand } from "./commands/users.js";
import { registerWebhooksCommand } from "./commands/webhooks.js";
import { parseCompletionShell, renderCompletion } from "./completions.js";
import type { GlobalFlags } from "./config.js";
import { loadConfig } from "./config.js";
import { PACKAGE_VERSION } from "./generated/version.js";
import { printError, type OutputMode, type OutputOptions } from "./output.js";

type ResolvedFlags = OutputOptions;

const defaultServices: Services = {
    loadConfig,
    buildClient,
};

/**
 * Build the commander program. Exposed for tests; the real binary
 * just calls `main(process.argv)`.
 */
export function buildProgram(services: Services = defaultServices): Command {
    const program = new Command();
    program
        .name("clockify115")
        .description("Clockify CLI from @apet97/clockify-cli-115, built on clockify-sdk-ts-115.")
        .version(PACKAGE_VERSION)
        .option("--workspace <id>", "Clockify workspace ID (or CLOCKIFY_WORKSPACE_ID env var).")
        .option(
            "--base-url <url>",
            "Override Clockify API base URL (or CLOCKIFY_BASE_URL env var). Only a Clockify host or a loopback host is accepted; arbitrary hosts are rejected.",
        )
        .option(
            "--region <name>",
            "Clockify routing region: global, eu, us, uk, au, or developer (or CLOCKIFY_REGION env var). Mutually exclusive with --base-url.",
        )
        .option(
            "--subdomain <label>",
            "Workspace subdomain for reports routing; requires --region eu/us/uk/au (or CLOCKIFY_SUBDOMAIN env var).",
        )
        .option("--json", "Emit machine-readable JSON instead of human-friendly tables.", false)
        .option("--output <mode>", "Output mode: table, json, or ndjson.", parseOutputMode)
        .option("--compact", "Print compact JSON without indentation.", false)
        .option("--select <path>", "Select a dot-path before printing JSON or NDJSON.")
        .option("--no-color", "Disable ANSI color output.")
        .showHelpAfterError(true);

    registerApiCommand(program, services);
    registerStatusCommand(program, services);
    registerDoctorCommand(program, services);
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
    registerReportsCommand(program, services);
    registerSharedReportsCommand(program, services);
    registerUsersCommand(program, services);

    leafCommand(program, "completion", "read")
        .argument("[shell]", "Shell to generate completion for: zsh, bash, or fish.", "zsh")
        .description("Print shell completion script for zsh, bash, or fish.")
        .action((shell: string) => {
            console.log(renderCompletion(parseCompletionShell(shell)));
        });

    return program;
}

/**
 * Resolve the global --json / --no-color flags into the shared
 * OutputOptions shape. Used by every command's handler.
 */
export function resolveFlags(program: Command): ResolvedFlags {
    const opts = program.opts<{
        json?: boolean;
        color?: boolean;
        output?: string;
        compact?: boolean;
        select?: string;
    }>();
    const mode = resolveMode(opts.output, opts.json);
    const resolved: ResolvedFlags = {
        mode,
        color: opts.color !== false && process.stdout.isTTY === true,
    };
    if (opts.compact) resolved.compact = true;
    if (opts.select !== undefined) resolved.select = opts.select;
    return resolved;
}

/**
 * Like {@link resolveFlags} but never throws: an invalid `--output` in the
 * error path falls back to a plain `{ mode: "table", color }` reporter.
 * Unreachable from argv since {@link parseOutputMode} rejects at parse time;
 * retained as defence-in-depth for programmatic callers that set the option
 * value directly.
 */
function resolveFlagsSafe(program: Command): ResolvedFlags {
    try {
        return resolveFlags(program);
    } catch {
        const opts = program.opts<{ color?: boolean }>();
        return {
            mode: "table",
            color: opts.color !== false && process.stdout.isTTY === true,
        };
    }
}

/**
 * Commander option parser for the global `--output` flag. Mirrors
 * {@link parseIntArg}: reject an unsupported mode at PARSE time with
 * `commander.InvalidArgumentError` so the process exits 2 (the documented
 * usage-error code in docs/cli-contract.json) instead of 1 from the
 * action-site {@link resolveMode} throw.
 */
function parseOutputMode(value: string): OutputMode {
    const modes: OutputMode[] = ["table", "json", "ndjson"];
    const match = modes.find((mode) => mode === value);
    if (!match) {
        throw new InvalidArgumentError("Provide one of: table, json, ndjson.");
    }
    return match;
}

function resolveMode(output: string | undefined, json: boolean | undefined): OutputMode {
    if (output === undefined) {
        return json ? "json" : "table";
    }
    const modes: OutputMode[] = ["table", "json", "ndjson"];
    const match = modes.find((mode) => mode === output);
    if (!match) {
        throw new Error(
            `Unsupported output mode "${output}". Provide one of: table, json, ndjson.`,
        );
    }
    return match;
}

export function globalFlags(program: Command): GlobalFlags {
    const opts = program.opts<{
        workspace?: string;
        baseUrl?: string;
        region?: string;
        subdomain?: string;
    }>();
    const out: GlobalFlags = {};
    if (opts.workspace) out.workspace = opts.workspace;
    if (opts.baseUrl) out.baseUrl = opts.baseUrl;
    if (opts.region) out.region = opts.region;
    if (opts.subdomain) out.subdomain = opts.subdomain;
    return out;
}

export async function main(argv: string[], services: Services = defaultServices): Promise<number> {
    const program = buildProgram(services);
    // exitOverride() must reach every subcommand (commander copies _exitCallback into
    // children at .command() time) or a usage error in a child calls process.exit() raw.
    const applyExitOverride = (cmd: Command): void => {
        cmd.exitOverride();
        for (const sub of cmd.commands) applyExitOverride(sub);
    };
    applyExitOverride(program);
    try {
        await program.parseAsync(argv);
        return 0;
    } catch (err) {
        if (isCommanderHelpError(err)) {
            return Number(err.exitCode ?? 0);
        }
        const message = err instanceof Error ? err.message : String(err);
        const statusCode = (err as { statusCode?: number }).statusCode;
        const flags = resolveFlagsSafe(program);
        printError(message, { mode: flags.mode, color: flags.color }, statusCode);
        return isCommanderUsageError(err) ? 2 : 1;
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

function isCommanderUsageError(err: unknown): err is { code?: string } {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        typeof (err as { code?: unknown }).code === "string" &&
        (err as { code: string }).code.startsWith("commander.")
    );
}

function isDirectInvocation(argv1: string | undefined): boolean {
    if (argv1 === undefined) return false;
    try {
        // npm bins are symlinks to dist/index.js, so compare their real target
        // instead of treating every consumer file named index.js as this CLI.
        return pathToFileURL(realpathSync(argv1)).href === import.meta.url;
    } catch {
        return false;
    }
}

// Run only when this exact module is the resolved process entrypoint.
const invokedDirectly =
    typeof process !== "undefined" &&
    Array.isArray(process.argv) &&
    isDirectInvocation(process.argv[1]);

if (invokedDirectly) {
    main(process.argv).then(
        (code) => {
            process.exitCode = code;
        },
        (err) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error(`fatal: ${message}`);
            process.exitCode = 1;
        },
    );
}
