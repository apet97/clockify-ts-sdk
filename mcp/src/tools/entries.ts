import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, errorResult, successResult, writeReceipt } from "../result.js";

export function registerEntriesTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_entries_list",
        {
            title: "List time entries (current user)",
            description:
                "List the current user's time entries in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                start: z.string().optional().describe("ISO 8601 lower bound (inclusive)."),
                end: z.string().optional().describe("ISO 8601 upper bound (inclusive)."),
                description: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const user = await ctx.client.users.getCurrentUser();
            const userId = entityId(user);
            if (!userId) {
                return errorResult(
                    "clockify_entries_list",
                    new Error("could not determine user ID from getCurrentUser response"),
                );
            }
            const req: ClockifyApi.ListForUserTimeEntriesRequest = {
                workspaceId: ctx.workspaceId,
                userId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.start) req.start = args.start;
            if (args.end) req.end = args.end;
            if (args.description) req.description = args.description;
            const entries = await ctx.client.timeEntries.listForUser(req);
            return successResult("clockify_entries_list", entries, {
                workspaceId: ctx.workspaceId,
                userId,
                count: entries.length,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
                hasMore: entries.length === (args.pageSize ?? 50),
            });
        },
    );

    defineTool(
        server,
        "clockify_entries_log",
        {
            title: "Log a finished time entry",
            description:
                "Create a finished time entry from an explicit start + end, or duration + end.",
            inputSchema: {
                description: z.string().min(1),
                start: z.string().describe("ISO 8601 start timestamp.").optional(),
                end: z.string().describe("ISO 8601 end timestamp (defaults to now).").optional(),
                durationSeconds: z
                    .number()
                    .int()
                    .min(1)
                    .describe("If set with `end`, computes start = end - durationSeconds.")
                    .optional(),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                tagIds: z.array(z.string()).optional(),
                billable: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            let start = args.start;
            const endIso = args.end ?? new Date().toISOString();
            if (!start) {
                if (args.durationSeconds === undefined) {
                    return errorResult(
                        "clockify_entries_log",
                        new Error(
                            "provide either `start` or `durationSeconds` (with optional `end`)",
                        ),
                        "Pass start as an ISO 8601 string, or durationSeconds to anchor against end (defaults to now).",
                    );
                }
                const endMs = Date.parse(endIso);
                if (Number.isNaN(endMs)) {
                    return errorResult(
                        "clockify_entries_log",
                        new Error(
                            `end ${JSON.stringify(args.end)} is not a valid ISO 8601 timestamp`,
                        ),
                    );
                }
                start = new Date(endMs - args.durationSeconds * 1000).toISOString();
            }
            const body: ClockifyRequestBody<ClockifyApi.CreateTimeEntryRequest> = {
                start,
                end: endIso,
                description: args.description,
            };
            if (args.projectId) body.projectId = args.projectId;
            if (args.taskId) body.taskId = args.taskId;
            if (args.tagIds && args.tagIds.length > 0) body.tagIds = args.tagIds;
            if (args.billable !== undefined) body.billable = args.billable;
            const req: ClockifyApi.CreateTimeEntryRequest = { workspaceId: ctx.workspaceId, body };
            const entry = await ctx.client.timeEntries.create(req);
            return successResult(
                "clockify_entries_log",
                { ...(entry && typeof entry === "object" ? entry : {}), ...body },
                undefined,
                writeReceipt("created", "time_entry", {
                    id: entityId(entry),
                    name: args.description,
                }),
            );
        },
    );

    defineTool(
        server,
        "clockify_entries_delete",
        {
            title: "Delete a time entry",
            description:
                "Permanently delete one time entry by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                timeEntryId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "time_entry", id: args.timeEntryId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_entries_delete",
                "entry_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.timeEntries.delete({
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
            });
            return successResult(
                "clockify_entries_delete",
                { deleted: true, timeEntryId: args.timeEntryId },
                undefined,
                writeReceipt("deleted", "time_entry", args.timeEntryId),
            );
        },
    );

    defineTool(
        server,
        "clockify_entries_get",
        {
            title: "Get a time entry",
            description: "Fetch one time entry by ID from the pinned Clockify workspace.",
            inputSchema: { timeEntryId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const entry = await ctx.client.timeEntries.get({
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
            });
            return successResult("clockify_entries_get", entry, {
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
            });
        },
    );

    defineTool(
        server,
        "clockify_entries_update",
        {
            title: "Update a time entry",
            description:
                "Update a time entry's metadata. Required fields must all be supplied to satisfy the upstream contract.",
            inputSchema: {
                timeEntryId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().optional(),
                description: z.string().optional(),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                tagIds: z.array(z.string()).optional(),
                billable: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.UpdateTimeEntriesRequest> = {
                start: args.start,
            };
            if (args.end) body.end = args.end;
            if (args.description !== undefined) body.description = args.description;
            if (args.projectId) body.projectId = args.projectId;
            if (args.taskId) body.taskId = args.taskId;
            if (args.tagIds) body.tagIds = args.tagIds;
            if (args.billable !== undefined) body.billable = args.billable;
            const updated = await ctx.client.timeEntries.update({
                workspaceId: ctx.workspaceId,
                timeEntryId: args.timeEntryId,
                body,
            });
            return successResult(
                "clockify_entries_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    timeEntryId: args.timeEntryId,
                },
                writeReceipt("updated", "time_entry", args.timeEntryId),
            );
        },
    );

    defineTool(
        server,
        "clockify_entries_mark_invoiced",
        {
            title: "Mark time entries invoiced",
            description:
                "Mark the given time entries as invoiced (or clear the flag with invoiced:false) in the pinned workspace.",
            inputSchema: {
                timeEntryIds: z.array(z.string().min(1)).min(1),
                invoiced: z.boolean().default(true).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const invoiced = args.invoiced ?? true;
            await ctx.client.timeEntries.markInvoiced({
                workspaceId: ctx.workspaceId,
                timeEntryIds: args.timeEntryIds,
                invoiced,
            });
            return successResult(
                "clockify_entries_mark_invoiced",
                { invoiced, timeEntryIds: args.timeEntryIds },
                { workspaceId: ctx.workspaceId, count: args.timeEntryIds.length },
                writeReceipt("updated", "time_entry", args.timeEntryIds.join(",")),
            );
        },
    );
}
