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
 * Strict numeric parse shared by every `--limit`/`--amount`/`--balance`-style
 * flag. `Number.parseInt`/`Number.parseFloat` only consume a *leading*
 * numeric run, so `"1abc"` silently becomes `1` instead of being rejected —
 * a pasted value with trailing garbage would reach the wire truncated,
 * not refused. `Number(value)` requires the whole trimmed string to be
 * numeric, so `"1abc"` is `NaN`.
 *
 * Two `Number()` quirks would otherwise widen what a bare-decimal flag
 * accepts, so both are excluded explicitly: an empty/whitespace-only string
 * is `0` (a value the user never typed), and `"0x10"`/`"0o17"`/`"0b101"` are
 * ES2015 numeric-literal syntax that `Number` parses but `parseInt`/
 * `parseFloat` (radix 10) do not — a CLI user typing a decimal flag has no
 * reason to type hex/octal/binary, and the old parsers rejected it.
 * Ordinary decimals (`".5"`, `"1e3"`, `" 1 "`) are unaffected.
 */
function parseStrictNumber(value: string): number {
    const trimmed = value.trim();
    if (trimmed === "" || /^[+-]?0[xXoObB]/.test(trimmed)) {
        return Number.NaN;
    }
    return Number(trimmed);
}

/**
 * Commander option parser for integer flags like `--limit` / `--page`.
 * A non-numeric, non-integer, or non-positive value previously flowed
 * straight to the wire — `Math.max(1, NaN)` is `NaN`, so `page-size: NaN`
 * reached Clockify. Reject it at parse time, raising
 * `commander.InvalidArgumentError` so commander reports a clean usage
 * error (exit code 2) instead of an opaque downstream failure.
 */
export function parseIntArg(value: string): number {
    const parsed = parseStrictNumber(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new InvalidArgumentError("must be a positive integer.");
    }
    return parsed;
}

/**
 * Commander option parser for positive decimal flags like `--amount` /
 * `--hours-per-day`. Mirrors {@link parseIntArg}: a non-numeric value
 * would otherwise serialize to `null` on the wire and 400 opaquely, so
 * reject it at parse time with `commander.InvalidArgumentError` (exit code 2).
 */
export function parseFloatArg(value: string): number {
    const parsed = parseStrictNumber(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new InvalidArgumentError("must be a positive number.");
    }
    return parsed;
}

/**
 * Commander option parser for signed decimal flags like `--balance` /
 * `--change`. Unlike {@link parseFloatArg} a negative value is valid: a
 * balance-assignment change of `-4` withdraws four days. Only a
 * non-numeric value is rejected, at parse time, with
 * `commander.InvalidArgumentError` (exit code 2).
 */
export function parseSignedFloatArg(value: string): number {
    const parsed = parseStrictNumber(value);
    if (!Number.isFinite(parsed)) {
        throw new InvalidArgumentError("must be a number.");
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
    return value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

const BARE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_TIMESTAMP_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;

function hasValidCalendarDate(
    yearText: string | undefined,
    monthText: string | undefined,
    dayText: string | undefined,
): boolean {
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const probe = new Date(0);
    probe.setUTCFullYear(year, month - 1, day);
    probe.setUTCHours(0, 0, 0, 0);
    return (
        probe.getUTCFullYear() === year &&
        probe.getUTCMonth() === month - 1 &&
        probe.getUTCDate() === day
    );
}

function isRfc3339Timestamp(value: string): boolean {
    const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
    if (match === null || !hasValidCalendarDate(match[1], match[2], match[3])) {
        return false;
    }
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6]);
    const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
    const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
    return (
        hour <= 23 &&
        minute <= 59 &&
        second <= 59 &&
        offsetHour <= 23 &&
        offsetMinute <= 59 &&
        !Number.isNaN(Date.parse(value))
    );
}

/** Validate one date-only calendar value and return it unchanged. */
export function requireCalendarDate(value: string, flag: string): string {
    const match = BARE_DATE_PATTERN.exec(value);
    if (match === null || !hasValidCalendarDate(match[1], match[2], match[3])) {
        throw new Error(
            `--${flag} ${JSON.stringify(value)} is not a valid calendar date (YYYY-MM-DD); provide a real calendar date`,
        );
    }
    return value;
}

/** Validate one RFC3339 timestamp and return it unchanged. */
export function requireRfc3339Timestamp(value: string, flag: string): string {
    if (!isRfc3339Timestamp(value)) {
        throw new Error(
            `--${flag} ${JSON.stringify(value)} is not a valid RFC3339 timestamp; provide a value such as 2026-06-22T09:30:00Z`,
        );
    }
    return value;
}

/** Validate a calendar date or RFC3339 timestamp and return it unchanged. */
export function requireDateOrRfc3339(value: string, flag: string): string {
    if (BARE_DATE_PATTERN.test(value)) {
        return requireCalendarDate(value, flag);
    }
    if (!isRfc3339Timestamp(value)) {
        throw new Error(
            `--${flag} ${JSON.stringify(value)} is not a valid date (YYYY-MM-DD) or RFC3339 timestamp; provide YYYY-MM-DD or an RFC3339 timestamp`,
        );
    }
    return value;
}

/**
 * Normalize a `--from` / `--to` date-range value. A bare `YYYY-MM-DD` is
 * promoted to the day's start (`T00:00:00Z`) or end (`T23:59:59Z`) edge; any
 * other value must be a valid RFC3339 timestamp and is returned unchanged.
 * Invalid syntax and impossible calendar values throw a clear local error.
 * Shared by `entries` and `scheduling` range filters.
 */
export function promoteDateBoundary(value: string, flag: string, edge: "start" | "end"): string {
    const validValue = requireDateOrRfc3339(value, flag);
    if (BARE_DATE_PATTERN.test(validValue)) {
        return edge === "start" ? `${value}T00:00:00Z` : `${value}T23:59:59Z`;
    }
    return validValue;
}

interface BaseContext {
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
