/**
 * Shared (public-link) reports: list/view/create/update/delete. These are the
 * shareable report links surfaced under the reports host. The view route is
 * keyed only by the shared-report id (no workspace scope); the others are
 * workspace-scoped. Delete is destructive and confirm-guarded.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../result.js";

const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "KIOSK_PIN_LIST",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "INVOICE_AMOUNT_LIST",
    "INVOICE_DETAILED",
    "TIMEOFF_DETAILED",
    "TIMEOFF_HOLIDAY",
    "TIMEOFF_BALANCE",
    "EXPENSE_SUMMARY",
] as const;

const containsSchema = z.enum(["CONTAINS", "DOES_NOT_CONTAIN", "CONTAINS_ONLY"]);
const sharedUsersFilterSchema = z
    .object({
        contains: containsSchema.optional(),
        ids: z.array(z.string()).optional(),
        status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
    })
    .strict();
const sharedAttendanceFilterSchema = z
    .object({
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).optional(),
        users: sharedUsersFilterSchema.optional(),
    })
    .strict();
const sharedDetailedFilterSchema = z
    .object({
        auditFilter: z.record(z.unknown()).optional(),
        options: z.record(z.unknown()).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).optional(),
        sortColumn: z.string().optional(),
        sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional(),
    })
    .strict();
const sharedSummaryFilterSchema = z
    .object({
        groups: z
            .array(
                z.enum([
                    "CLIENT",
                    "PROJECT",
                    "TASK",
                    "DATE",
                    "WEEK",
                    "MONTH",
                    "TIMEENTRY",
                    "USER",
                    "TAG",
                ]),
            )
            .min(1)
            .max(3),
        sortColumn: z.string().optional(),
    })
    .strict();
const sharedWeeklyFilterSchema = z
    .object({
        group: z.enum(["PROJECT", "USER"]),
        subgroup: z.literal("TIME"),
    })
    .strict();
const sharedReportFilterSchema = z
    .object({
        attendanceFilter: sharedAttendanceFilterSchema.optional(),
        dateRangeEnd: z.string(),
        dateRangeStart: z.string(),
        detailedFilter: sharedDetailedFilterSchema.optional(),
        exportType: z.enum(["JSON_V1", "JSON", "CSV", "XLSX", "PDF"]),
        summaryFilter: sharedSummaryFilterSchema.optional(),
        weeklyFilter: sharedWeeklyFilterSchema.optional(),
    })
    .strict();

function sharedReportFilter(
    value: z.infer<typeof sharedReportFilterSchema>,
): ClockifyApi.SharedReportFilter {
    return {
        dateRangeEnd: value.dateRangeEnd,
        dateRangeStart: value.dateRangeStart,
        exportType: value.exportType,
        ...(value.attendanceFilter !== undefined
            ? {
                  attendanceFilter: {
                      ...(value.attendanceFilter.page !== undefined
                          ? { page: value.attendanceFilter.page }
                          : {}),
                      ...(value.attendanceFilter.pageSize !== undefined
                          ? { pageSize: value.attendanceFilter.pageSize }
                          : {}),
                      ...(value.attendanceFilter.users !== undefined
                          ? { users: value.attendanceFilter.users }
                          : {}),
                  },
              }
            : {}),
        ...(value.detailedFilter !== undefined
            ? {
                  detailedFilter: {
                      ...(value.detailedFilter.auditFilter !== undefined
                          ? { auditFilter: value.detailedFilter.auditFilter }
                          : {}),
                      ...(value.detailedFilter.options !== undefined
                          ? { options: value.detailedFilter.options }
                          : {}),
                      ...(value.detailedFilter.page !== undefined
                          ? { page: value.detailedFilter.page }
                          : {}),
                      ...(value.detailedFilter.pageSize !== undefined
                          ? { pageSize: value.detailedFilter.pageSize }
                          : {}),
                      ...(value.detailedFilter.sortColumn !== undefined
                          ? { sortColumn: value.detailedFilter.sortColumn }
                          : {}),
                      ...(value.detailedFilter.sortOrder !== undefined
                          ? { sortOrder: value.detailedFilter.sortOrder }
                          : {}),
                  },
              }
            : {}),
        ...(value.summaryFilter !== undefined
            ? {
                  summaryFilter: {
                      groups: value.summaryFilter.groups,
                      ...(value.summaryFilter.sortColumn !== undefined
                          ? { sortColumn: value.summaryFilter.sortColumn }
                          : {}),
                  },
              }
            : {}),
        ...(value.weeklyFilter !== undefined
            ? {
                  weeklyFilter: {
                      group: value.weeklyFilter.group,
                      subgroup: value.weeklyFilter.subgroup,
                  },
              }
            : {}),
    };
}

export function registerSharedReportsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_shared_reports_list",
        {
            title: "List shared reports",
            description: "List the pinned workspace's shared (public-link) reports.",
            inputSchema: {},
            idempotent: true,
        },
        async () => {
            const result = await ctx.client.sharedReports.list({ workspaceId: ctx.workspaceId });
            return successResult("clockify_shared_reports_list", result, {
                workspaceId: ctx.workspaceId,
            });
        },
    );

    defineTool(
        server,
        "clockify_shared_reports_view",
        {
            title: "View a shared report",
            description:
                "Fetch one shared report's rendered data by its shared-report ID (reports host; not workspace-scoped). Optional export type.",
            inputSchema: {
                shared_report_id: z.string().min(1),
                export_type: z.enum(["JSON_V1", "JSON", "CSV", "XLSX", "PDF"]).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const result = await ctx.client.sharedReports.view({
                sharedReportId: args.shared_report_id,
                ...(args.export_type ? { exportType: args.export_type } : {}),
            });
            return successResult("clockify_shared_reports_view", result, {
                sharedReportId: args.shared_report_id,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_shared_reports_create",
        {
            title: "Create a shared report",
            description:
                "Create a shared (public-link) report from a name, report type, and a report filter object; optionally public.",
            inputSchema: {
                name: z.string().min(1),
                type: z.enum(SHARED_REPORT_TYPES),
                filter: sharedReportFilterSchema.describe(
                    "The report filter object (shape mirrors the reports API filter).",
                ),
                public: z.boolean().optional(),
            },
        },
        {
            preview: (args) => {
                const body: ClockifyRequestBody<ClockifyApi.SharedReportCreate> = {
                    name: args.name,
                    type: args.type,
                    filter: sharedReportFilter(args.filter),
                    ...(args.public !== undefined ? { isPublic: args.public } : {}),
                };
                return {
                    action: "create",
                    entity: "shared_report",
                    name: args.name,
                    request: {
                        workspaceId: ctx.workspaceId,
                        body,
                    } satisfies ClockifyApi.SharedReportCreate,
                };
            },
            execute: async (preview) => {
                const created = await ctx.client.sharedReports.create(preview.request);
                const id = String(entityId(created) ?? "");
                return successResult(
                    "clockify_shared_reports_create",
                    created,
                    { workspaceId: preview.request.workspaceId },
                    writeReceipt("created", "shared_report", { id, name: preview.name }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_shared_reports_update",
        {
            title: "Update a shared report",
            description:
                "Replace a shared report by ID with a new name, report type, and filter object (full replace); optionally public.",
            inputSchema: {
                shared_report_id: z.string().min(1),
                name: z.string().min(1),
                type: z.enum(SHARED_REPORT_TYPES),
                filter: sharedReportFilterSchema.describe(
                    "The report filter object (full replace).",
                ),
                public: z.boolean().optional(),
            },
            idempotent: true,
        },
        {
            preview: (args) => {
                const body: ClockifyRequestBody<ClockifyApi.UpdateSharedReportsRequest> = {
                    name: args.name,
                    type: args.type,
                    filter: sharedReportFilter(args.filter),
                    ...(args.public !== undefined ? { isPublic: args.public } : {}),
                };
                return {
                    action: "update",
                    entity: "shared_report",
                    id: args.shared_report_id,
                    name: args.name,
                    request: {
                        workspaceId: ctx.workspaceId,
                        sharedReportId: args.shared_report_id,
                        body,
                    } satisfies ClockifyApi.UpdateSharedReportsRequest,
                };
            },
            execute: async (preview) => {
                const updated = await ctx.client.sharedReports.update(preview.request);
                return successResult(
                    "clockify_shared_reports_update",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        sharedReportId: preview.id,
                    },
                    writeReceipt("updated", "shared_report", {
                        id: preview.id,
                        name: preview.name,
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_shared_reports_delete",
        {
            title: "Delete a shared report",
            description:
                "Permanently delete one shared report by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                shared_report_id: z.string().min(1),
            },
        },
        {
            preview: (args) => ({
                action: "delete",
                entity: "shared_report",
                id: args.shared_report_id,
                request: {
                    workspaceId: ctx.workspaceId,
                    sharedReportId: args.shared_report_id,
                } satisfies ClockifyApi.DeleteSharedReportsRequest,
            }),
            execute: async (preview) => {
                await ctx.client.sharedReports.delete(preview.request);
                return successResult(
                    "clockify_shared_reports_delete",
                    { deleted: true, sharedReportId: preview.id },
                    { workspaceId: preview.request.workspaceId, sharedReportId: preview.id },
                    writeReceipt("deleted", "shared_report", preview.id),
                );
            },
        },
    );
}
