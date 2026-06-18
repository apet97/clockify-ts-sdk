/**
 * `clk115 reports {summary,detailed,weekly,attendance}` — read-only Clockify
 * reports over a date range. The range comes from a named `--period` (default
 * `this_month`) with explicit `--from` / `--to` overrides, resolved through the
 * SDK's `dates` subpath; the per-report filter is built with the `reports`
 * subpath builders. Reports POST to the reports host automatically (the
 * generated method carries the per-operation baseUrl). All four are read-only
 * (no receipt, no write-safety entry).
 */
import { REPORT_PERIODS, type ReportPeriod, resolveInstant, resolvePeriod } from "clockify-sdk-ts-115/dates";
import { detailedFilter, summaryFilter, weeklyFilter } from "clockify-sdk-ts-115/reports";
import type { Command } from "commander";

import { printObject } from "../output.js";

import { resolveContext } from "./helpers.js";
import { resolveClientId, resolveProjectId } from "./resolve-refs.js";
import type { Registrar } from "./types.js";

interface RangeOpts {
    period?: string;
    from?: string;
    to?: string;
}

/** Resolve a {dateRangeStart,dateRangeEnd} from --period (default this_month) + --from/--to overrides. */
function resolveRange(opts: RangeOpts): { dateRangeStart: string; dateRangeEnd: string } {
    const now = new Date();
    const periodInput = (opts.period ?? "this_month").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!(REPORT_PERIODS as readonly string[]).includes(periodInput)) {
        throw new Error(`Unknown --period "${opts.period}". Use one of: ${REPORT_PERIODS.join(", ")}.`);
    }
    const range = resolvePeriod(now, periodInput as ReportPeriod);
    let { dateRangeStart, dateRangeEnd } = range;
    if (opts.from) {
        const start = resolveInstant(now, opts.from, "start");
        if (!start) throw new Error(`--from "${opts.from}" is not a valid date, ISO timestamp, or period.`);
        dateRangeStart = start;
    }
    if (opts.to) {
        const end = resolveInstant(now, opts.to, "end");
        if (!end) throw new Error(`--to "${opts.to}" is not a valid date, ISO timestamp, or period.`);
        dateRangeEnd = end;
    }
    return { dateRangeStart, dateRangeEnd };
}

/** A Clockify report id-filter (`{ ids, contains }`) — used for project/client scoping. */
function idFilter(ids: string[]): { ids: string[]; contains: "CONTAINS" } {
    return { ids, contains: "CONTAINS" };
}

const PERIOD_HELP = `Named period: ${REPORT_PERIODS.join(", ")} (default this_month).`;

export const registerReportsCommand: Registrar = (program, services) => {
    const reports = program.command("reports").description("Run Clockify reports (read-only).");

    reports
        .command("summary")
        .description("Summary report totals over a date range, grouped per --groups.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start (YYYY-MM-DD, ISO, or a period); overrides --period.")
        .option("--to <date>", "Range end (YYYY-MM-DD, ISO, or a period); overrides --period.")
        .option("--groups <list>", "Comma-separated summary groups (e.g. PROJECT,TASK,CLIENT).", "PROJECT")
        .option("--billable", "Only billable time.", false)
        .option("--project <name|id...>", "Scope to one or more project names or ids.")
        .option("--client <name|id...>", "Scope to one or more client names or ids.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const groups = String(opts.groups)
                .split(",")
                .map((g) => g.trim().toUpperCase())
                .filter(Boolean);
            const req: Record<string, unknown> = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                summaryFilter: summaryFilter(groups as Parameters<typeof summaryFilter>[0]),
            };
            if (opts.billable) req.billable = true;
            if (Array.isArray(opts.project) && opts.project.length > 0) {
                const ids = await Promise.all(opts.project.map((p: string) => resolveProjectId(client, workspaceId, p)));
                req.projects = idFilter(ids);
            }
            if (Array.isArray(opts.client) && opts.client.length > 0) {
                const ids = await Promise.all(opts.client.map((c: string) => resolveClientId(client, workspaceId, c)));
                req.clients = idFilter(ids);
            }
            // KEEP as never: report request uses validated passthrough fields the generated request type cannot express.
            const data = await client.reports.summary(req as never);
            printObject(data as Record<string, unknown>, output);
        });

    reports
        .command("detailed")
        .description("Detailed report listing individual time entries over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--page-size <n>", "Entries per page (max 1000).", (v) => Number.parseInt(v, 10), 50)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const req: Record<string, unknown> = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                detailedFilter: detailedFilter({ page: opts.page, pageSize: Math.min(Math.max(1, opts.pageSize), 1000) }),
            };
            // KEEP as never: report request uses validated passthrough fields the generated request type cannot express.
            const data = await client.reports.detailed(req as never);
            printObject(data as Record<string, unknown>, output);
        });

    reports
        .command("weekly")
        .description("Weekly report aggregating tracked time per week over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .option("--group <group>", "Top grouping: USER or PROJECT.", "USER")
        .option("--subgroup <subgroup>", "Subgrouping (TIME).", "TIME")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const req: Record<string, unknown> = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                weeklyFilter: weeklyFilter(
                    String(opts.group).toUpperCase() as Parameters<typeof weeklyFilter>[0],
                    String(opts.subgroup).toUpperCase() as Parameters<typeof weeklyFilter>[1],
                ),
            };
            // KEEP as never: report request uses validated passthrough fields the generated request type cannot express.
            const data = await client.reports.weekly(req as never);
            printObject(data as Record<string, unknown>, output);
        });

    reports
        .command("attendance")
        .description("Attendance report of clock-in/out activity over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            // KEEP as never: report request uses validated passthrough fields the generated request type cannot express.
            const data = await client.reports.attendance({ workspaceId, dateRangeStart, dateRangeEnd } as never);
            printObject(data as Record<string, unknown>, output);
        });
};
