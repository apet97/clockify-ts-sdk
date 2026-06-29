/**
 * Shared (public-link) reports: list/view/create/update/delete. These are the
 * shareable report links surfaced under the reports host. The view route is
 * keyed only by the shared-report id (no workspace scope); the others are
 * workspace-scoped. Delete is destructive and confirm-guarded.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

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

export function registerSharedReportsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_shared_reports_list",
        {
            title: "List shared reports",
            description: "List the pinned workspace's shared (public-link) reports.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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

    defineTool(
        server,
        "clockify_shared_reports_create",
        {
            title: "Create a shared report",
            description:
                "Create a shared (public-link) report from a name, report type, and a report filter object; optionally public.",
            inputSchema: {
                name: z.string().min(1),
                type: z.enum(SHARED_REPORT_TYPES),
                filter: z
                    .record(z.unknown())
                    .describe("The report filter object (shape mirrors the reports API filter)."),
                public: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const body: Record<string, unknown> = {
                name: args.name,
                type: args.type,
                filter: args.filter,
            };
            // Wire field is `isPublic` (live-verified); sending `public` is a no-op.
            if (args.public !== undefined) body.isPublic = args.public;
            const created = await ctx.client.sharedReports.create(
                wireBody<ClockifyApi.SharedReportCreate>({ workspaceId: ctx.workspaceId, body }),
            );
            const id = String(entityId(created) ?? "");
            return successResult(
                "clockify_shared_reports_create",
                created,
                { workspaceId: ctx.workspaceId },
                writeReceipt("created", "shared_report", { id, name: args.name }),
            );
        },
    );

    defineTool(
        server,
        "clockify_shared_reports_update",
        {
            title: "Update a shared report",
            description:
                "Replace a shared report by ID with a new name, report type, and filter object (full replace); optionally public.",
            inputSchema: {
                shared_report_id: z.string().min(1),
                name: z.string().min(1),
                type: z.enum(SHARED_REPORT_TYPES),
                filter: z.record(z.unknown()).describe("The report filter object (full replace)."),
                public: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: Record<string, unknown> = {
                name: args.name,
                type: args.type,
                filter: args.filter,
            };
            // Wire field is `isPublic` (live-verified); sending `public` is a no-op.
            if (args.public !== undefined) body.isPublic = args.public;
            const updated = await ctx.client.sharedReports.update(
                wireBody<ClockifyApi.UpdateSharedReportsRequest>({
                    workspaceId: ctx.workspaceId,
                    sharedReportId: args.shared_report_id,
                    body,
                }),
            );
            return successResult(
                "clockify_shared_reports_update",
                updated,
                { workspaceId: ctx.workspaceId, sharedReportId: args.shared_report_id },
                writeReceipt("updated", "shared_report", {
                    id: args.shared_report_id,
                    name: args.name,
                }),
            );
        },
    );

    defineTool(
        server,
        "clockify_shared_reports_delete",
        {
            title: "Delete a shared report",
            description:
                "Permanently delete one shared report by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                shared_report_id: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = {
                action: "delete",
                entity: "shared_report",
                id: args.shared_report_id,
            };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_shared_reports_delete",
                "shared_report_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.sharedReports.delete({
                workspaceId: ctx.workspaceId,
                sharedReportId: args.shared_report_id,
            });
            return successResult(
                "clockify_shared_reports_delete",
                { deleted: true, sharedReportId: args.shared_report_id },
                { workspaceId: ctx.workspaceId, sharedReportId: args.shared_report_id },
                writeReceipt("deleted", "shared_report", args.shared_report_id),
            );
        },
    );
}
