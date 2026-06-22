/**
 * Helpers shared by command modules: resolves the workspace + client
 * + output options in one call, so each handler is a short orchestration.
 */
import { InvalidArgumentError, type Command } from "commander";

import type { ClockifyClient } from "../client.js";
import { requireWorkspaceId } from "../config.js";
import type { CliConfig } from "../config.js";
import { globalFlags, resolveFlags } from "../index.js";
import type { OutputOptions } from "../output.js";

import type { Services } from "./types.js";

/**
 * Commander option parser for integer flags like `--limit` / `--page`.
 * A non-numeric or non-positive value (`Number.parseInt("abc", 10)` is
 * `NaN`) previously flowed straight to the wire — `Math.max(1, NaN)` is
 * `NaN`, so `page-size: NaN` reached Clockify. Reject it at parse time
 * with the same contract as `api.ts`'s `parsePositiveInteger`, raising
 * `commander.InvalidArgumentError` so commander reports a clean usage
 * error (exit code 2) instead of an opaque downstream failure.
 */
export function parseIntArg(value: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new InvalidArgumentError("must be a positive integer.");
    }
    return parsed;
}

/**
 * Commander option parser for positive decimal flags like `--amount` /
 * `--hours-per-day`. Mirrors {@link parseIntArg}: a non-numeric value
 * (`Number.parseFloat("abc")` is `NaN`) would otherwise serialize to `null`
 * on the wire and 400 opaquely, so reject it at parse time with
 * `commander.InvalidArgumentError` (exit code 2).
 */
export function parseFloatArg(value: string): number {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new InvalidArgumentError("must be a positive number.");
    }
    return parsed;
}

/**
 * Clamp a parsed `--limit` / `--page-size` to the endpoint's upper bound.
 * `parseIntArg` already rejects `<= 0` at parse time, so the lower edge is
 * fixed at 1 — the former `Math.max(1, …)` lower-clamp was dead. `max` is
 * the per-endpoint ceiling (200 for most list ops, 1000 for the detailed
 * report). Shared by every paged list command.
 */
export function clampPageSize(value: number, max: number): number {
    return Math.min(value, max);
}

/**
 * Split a comma-separated CLI option value into a trimmed, non-empty list.
 * Shared by the filter-list flags (`--status`, `--user`, `--actions`,
 * `--authors`, `--trigger-source`).
 */
export function splitList(value: string): string[] {
    return String(value)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Normalize a `--from` / `--to` date-range value. A bare `YYYY-MM-DD` is
 * promoted to the day's start (`T00:00:00Z`) or end (`T23:59:59Z`) edge; any
 * other value must be a valid RFC3339 timestamp and is returned unchanged.
 * Anything `Date.parse` rejects throws a clear local error so the bad value
 * never reaches the wire. Shared by `entries` and `scheduling` range filters.
 */
export function promoteDateBoundary(value: string, flag: string, edge: "start" | "end"): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        // Validate the bare date before promoting it: reject impossible months/days
        // (2026-13-45) and silent-rollover dates (2026-02-30 -> 2026-03-02) that the
        // regex alone lets through to the wire.
        const probe = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== value) {
            throw new Error(
                `--${flag} ${JSON.stringify(value)} is not a valid calendar date (YYYY-MM-DD)`,
            );
        }
        return edge === "start" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
    }
    if (Number.isNaN(Date.parse(value))) {
        throw new Error(
            `--${flag} ${JSON.stringify(value)} is not a valid date (YYYY-MM-DD) or RFC3339 timestamp`,
        );
    }
    return value;
}

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
export function rootProgram(cmd: Command): Command {
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
