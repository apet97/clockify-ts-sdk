/**
 * `clk115 reports {summary,detailed,weekly,attendance}` — read-only Clockify
 * reports over a date range. The range comes from a named `--period` (default
 * `this_month`) with explicit `--from` / `--to` overrides, resolved through the
 * SDK's `dates` subpath; the per-report filter is built with the `reports`
 * subpath builders. Reports POST to the reports host automatically (the
 * generated method carries the per-operation baseUrl). All four are read-only
 * (no receipt, no write-safety entry).
 */
import {
    REPORT_PERIODS,
    type ReportPeriod,
    resolveInstant,
    resolvePeriod,
} from "clockify-sdk-ts-115/dates";
import { detailedFilter, summaryFilter, weeklyFilter } from "clockify-sdk-ts-115/reports";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject } from "../output.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
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
    const periodInput = (opts.period ?? "this_month")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!(REPORT_PERIODS as readonly string[]).includes(periodInput)) {
        throw new Error(
            `Unknown --period "${opts.period}". Use one of: ${REPORT_PERIODS.join(", ")}.`,
        );
    }
    const range = resolvePeriod(now, periodInput as ReportPeriod);
    let { dateRangeStart, dateRangeEnd } = range;
    if (opts.from) {
        const start = resolveInstant(now, opts.from, "start");
        if (!start)
            throw new Error(`--from "${opts.from}" is not a valid date, ISO timestamp, or period.`);
        dateRangeStart = start;
    }
    if (opts.to) {
        const end = resolveInstant(now, opts.to, "end");
        if (!end)
            throw new Error(`--to "${opts.to}" is not a valid date, ISO timestamp, or period.`);
        dateRangeEnd = end;
    }
    return { dateRangeStart, dateRangeEnd };
}

/** A Clockify report id-filter (`{ ids, contains }`) — used for project/client scoping. */
function idFilter(ids: string[]): { ids: string[]; contains: "CONTAINS" } {
    return { ids, contains: "CONTAINS" };
}

type SummaryGroup = Parameters<typeof summaryFilter>[0][number];
const SUMMARY_GROUPS = [
    "CLIENT",
    "PROJECT",
    "USER",
    "WEEK",
    "DATE",
    "MONTH",
    "TIMEENTRY",
    "TASK",
] as const satisfies readonly SummaryGroup[];

function parseSummaryGroups(raw: unknown): SummaryGroup[] {
    const groups = String(raw)
        .split(",")
        .map((group) => group.trim().toUpperCase())
        .filter(Boolean);
    if (groups.length === 0 || groups.length > 3) {
        throw new Error("--groups must contain between one and three summary groups.");
    }
    const unknown = groups.find(
        (group) => !SUMMARY_GROUPS.includes(group as (typeof SUMMARY_GROUPS)[number]),
    );
    if (unknown) {
        throw new Error(`Unknown summary group: ${unknown}. Use one of: ${SUMMARY_GROUPS.join(", ")}.`);
    }
    return groups as SummaryGroup[];
}

type WeeklyGroup = Parameters<typeof weeklyFilter>[0];
type WeeklySubgroup = Parameters<typeof weeklyFilter>[1];

function parseWeeklyGroup(raw: unknown): WeeklyGroup {
    const group = String(raw).toUpperCase();
    if (group !== "USER" && group !== "PROJECT") {
        throw new Error("Weekly group must be USER or PROJECT.");
    }
    return group;
}

function parseWeeklySubgroup(raw: unknown): WeeklySubgroup {
    const subgroup = String(raw).toUpperCase();
    if (subgroup !== "TIME") {
        throw new Error("Weekly subgroup must be TIME.");
    }
    return subgroup;
}

const PERIOD_HELP = `Named period: ${REPORT_PERIODS.join(", ")} (default this_month).`;

export const registerReportsCommand: Registrar = (program, services) => {
    const reports = program.command("reports").description("Run Clockify reports (read-only).");

    leafCommand(reports, "summary", "read")
        .description("Summary report totals over a date range, grouped per --groups.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start (YYYY-MM-DD, ISO, or a period); overrides --period.")
        .option("--to <date>", "Range end (YYYY-MM-DD, ISO, or a period); overrides --period.")
        .option(
            "--groups <list>",
            "Comma-separated summary groups (e.g. PROJECT,TASK,CLIENT).",
            "PROJECT",
        )
        .option("--billable", "Only billable time.", false)
        .option("--project <name|id...>", "Scope to one or more project names or ids.")
        .option("--client <name|id...>", "Scope to one or more client names or ids.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const groups = parseSummaryGroups(opts.groups);
            // Bind the generated union directly through its flattened arm so
            // later billable/projects/clients assignments stay strictly typed.
            const req: ClockifyApi.SummaryReportsRequest = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                summaryFilter: summaryFilter(groups),
            };
            if (opts.billable) req.billable = true;
            if (Array.isArray(opts.project) && opts.project.length > 0) {
                const ids = await Promise.all(
                    opts.project.map((p: string) => resolveProjectId(client, workspaceId, p)),
                );
                req.projects = idFilter(ids);
            }
            if (Array.isArray(opts.client) && opts.client.length > 0) {
                const ids = await Promise.all(
                    opts.client.map((c: string) => resolveClientId(client, workspaceId, c)),
                );
                req.clients = idFilter(ids);
            }
            const data = await client.reports.summary(req);
            printObject(data, output);
        });

    leafCommand(reports, "detailed", "read")
        .description("Detailed report listing individual time entries over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option(
            "--page-size <n>",
            "Entries per page (max 1000).",
            parseIntArg,
            50,
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const req: ClockifyApi.DetailedReportsRequest = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                detailedFilter: detailedFilter({
                    page: opts.page,
                    pageSize: clampPageSize(opts.pageSize, 1000),
                }),
            };
            const data = await client.reports.detailed(req);
            printObject(data, output);
        });

    leafCommand(reports, "weekly", "read")
        .description("Weekly report aggregating tracked time per week over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .option("--group <group>", "Top grouping: USER or PROJECT.", "USER")
        .option("--subgroup <subgroup>", "Subgrouping (TIME).", "TIME")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            const req: ClockifyApi.WeeklyReportsRequest = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                weeklyFilter: weeklyFilter(
                    parseWeeklyGroup(opts.group),
                    parseWeeklySubgroup(opts.subgroup),
                ),
            };
            const data = await client.reports.weekly(req);
            printObject(data, output);
        });

    leafCommand(reports, "attendance", "read")
        .description("Attendance report of clock-in/out activity over a date range.")
        .option("--period <p>", PERIOD_HELP)
        .option("--from <date>", "Range start; overrides --period.")
        .option("--to <date>", "Range end; overrides --period.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const { dateRangeStart, dateRangeEnd } = resolveRange(opts);
            // attendanceFilter is REQUIRED on the wire: without it the report
            // 400s "Please provide filters." (live-verified). An empty filter
            // (all sub-fields optional) is accepted and returns 200, so send {}
            // — every other report command scopes via its own filters.
            const req: ClockifyApi.AttendanceReportsRequest = {
                workspaceId,
                dateRangeStart,
                dateRangeEnd,
                attendanceFilter: {},
            };
            const data = await client.reports.attendance(req);
            printObject(data, output);
        });
};
