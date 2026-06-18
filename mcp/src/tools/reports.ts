/**
 * Reports domain. Each report POSTs a date range plus a required filter and
 * returns aggregated totals or rows. The generated request types carry 25+
 * optional filter fields, so the tools expose the always-required core and pass
 * anything else through `extra` rather than re-typing the whole surface.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineTool, successResult } from "../result.js";

const reportCore = {
    dateRangeStart: z.string().describe("ISO start, e.g. 2026-06-01T00:00:00Z"),
    dateRangeEnd: z.string().describe("ISO end, e.g. 2026-06-30T23:59:59Z"),
    dateRangeType: z.string().optional(),
    exportType: z.enum(["JSON", "CSV", "PDF", "XLSX"]).optional(),
    extra: z.record(z.unknown()).optional().describe("Any additional Clockify report filter field"),
};

type ReportPayload = Record<string, unknown>;

function reportRequest(
    ctx: Context,
    args: { extra?: ReportPayload | undefined } & ReportPayload,
): ReportPayload {
    const { extra, ...rest } = args;
    // workspaceId is written last so neither `rest` nor `extra` can unpin it.
    return { ...rest, ...(extra ?? {}), workspaceId: ctx.workspaceId };
}

export function registerReportsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_reports_summary",
        {
            title: "Summary report",
            description:
                "Run a summary report over a date range, grouped per summaryFilter.groups (e.g. PROJECT, CLIENT).",
            inputSchema: {
                ...reportCore,
                summaryFilter: z
                    .record(z.unknown())
                    .describe('e.g. { "groups": ["PROJECT", "TASK"] }'),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const data = await ctx.client.reports.summary(
                wireBody<ClockifyApi.SummaryReportsRequest>(reportRequest(ctx, args)),
            );
            return successResult("clockify_reports_summary", data, undefined, {
                entity: "report",
                next: [
                    {
                        tool: "clockify_reports_detailed",
                        reason: "Drill into the time entries behind these totals.",
                    },
                ],
            });
        },
        "Confirm the date range and that summaryFilter.groups is set.",
    );

    defineTool(
        server,
        "clockify_reports_detailed",
        {
            title: "Detailed report",
            description:
                "Run a detailed report listing individual time entries over a date range, paginated via detailedFilter.",
            inputSchema: {
                ...reportCore,
                detailedFilter: z
                    .record(z.unknown())
                    .describe('e.g. { "page": 1, "pageSize": 50 }'),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const data = await ctx.client.reports.detailed(
                wireBody<ClockifyApi.DetailedReportsRequest>(reportRequest(ctx, args)),
            );
            return successResult("clockify_reports_detailed", data, undefined, {
                entity: "report",
            });
        },
        "Confirm the date range and that detailedFilter is set.",
    );

    defineTool(
        server,
        "clockify_reports_weekly",
        {
            title: "Weekly report",
            description:
                "Run a weekly report aggregating tracked time per week over a date range, grouped per weeklyFilter.",
            inputSchema: {
                ...reportCore,
                weeklyFilter: z
                    .record(z.unknown())
                    .describe('e.g. { "group": "USER", "subgroup": "PROJECT" }'),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const data = await ctx.client.reports.weekly(
                wireBody<ClockifyApi.WeeklyReportsRequest>(reportRequest(ctx, args)),
            );
            return successResult("clockify_reports_weekly", data, undefined, { entity: "report" });
        },
        "Confirm the date range and that weeklyFilter is set.",
    );

    defineTool(
        server,
        "clockify_reports_attendance",
        {
            title: "Attendance report",
            description:
                "Run an attendance report of clock-in/out and break activity over a date range, scoped by attendanceFilter.",
            inputSchema: {
                ...reportCore,
                attendanceFilter: z
                    .record(z.unknown())
                    .describe('e.g. { "users": { "ids": ["user-id"], "contains": "CONTAINS" } }'),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const data = await ctx.client.reports.attendance(
                wireBody<ClockifyApi.AttendanceReportsRequest>(reportRequest(ctx, args)),
            );
            return successResult("clockify_reports_attendance", data, undefined, {
                entity: "report",
            });
        },
        "Confirm the date range and that attendanceFilter is set.",
    );
}
