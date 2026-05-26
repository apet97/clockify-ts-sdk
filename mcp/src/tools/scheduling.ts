/**
 * Scheduling assignments. The Clockify scheduling addon needs to be
 * enabled and the user typically needs admin/manager role; both
 * preconditions surface as upstream 403/404 which we expose verbatim
 * through errorResult.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerSchedulingTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_scheduling_assignments_list",
        {
            title: "List scheduling assignments",
            description: "List scheduling assignments in the workspace.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.name) req.name = args.name;
                const items = (await ctx.client.scheduling.list(req as never)) as unknown[];
                return successResult("clockify_scheduling_assignments_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_scheduling_assignments_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_scheduling_assignments_list_per_project",
        {
            title: "List scheduling assignments per project",
            description: "List scheduling assignments grouped by project.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.scheduling.listPerProject({
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                } as never)) as unknown[];
                return successResult("clockify_scheduling_assignments_list_per_project", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_scheduling_assignments_list_per_project", err);
            }
        },
    );

    server.registerTool(
        "clockify_scheduling_assignments_create",
        {
            title: "Create a scheduling assignment",
            description: "Create a scheduling assignment. Defaults to draft (published:false) to avoid notifying other users.",
            inputSchema: {
                userId: z.string().min(1),
                projectId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
                hoursPerDay: z.number(),
                taskId: z.string().optional(),
                note: z.string().optional(),
                billable: z.boolean().optional(),
                includeNonWorkingDays: z.boolean().optional(),
                published: z.boolean().optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    userId: args.userId,
                    projectId: args.projectId,
                    hoursPerDay: args.hoursPerDay,
                    period: { start: args.start, end: args.end },
                    published: args.published === true,
                };
                if (args.taskId) body.taskId = args.taskId;
                if (args.note) body.note = args.note;
                if (args.billable !== undefined) body.billable = args.billable;
                if (args.includeNonWorkingDays !== undefined)
                    body.includeNonWorkingDays = args.includeNonWorkingDays;
                const created = await ctx.client.scheduling.create({
                    workspaceId: ctx.workspaceId,
                    ...body,
                } as never);
                return successResult("clockify_scheduling_assignments_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_scheduling_assignments_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_scheduling_assignments_update",
        {
            title: "Update a scheduling assignment",
            description: "Update a scheduling assignment by ID.",
            inputSchema: {
                assignmentId: z.string().min(1),
                userId: z.string().optional(),
                projectId: z.string().optional(),
                start: z.string().optional(),
                end: z.string().optional(),
                hoursPerDay: z.number().optional(),
                taskId: z.string().optional(),
                note: z.string().optional(),
                billable: z.boolean().optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.userId) body.userId = args.userId;
                if (args.projectId) body.projectId = args.projectId;
                if (args.start && args.end) body.period = { start: args.start, end: args.end };
                if (args.hoursPerDay !== undefined) body.hoursPerDay = args.hoursPerDay;
                if (args.taskId) body.taskId = args.taskId;
                if (args.note) body.note = args.note;
                if (args.billable !== undefined) body.billable = args.billable;
                const updated = await ctx.client.scheduling.update({
                    workspaceId: ctx.workspaceId,
                    assignmentId: args.assignmentId,
                    body,
                } as never);
                return successResult("clockify_scheduling_assignments_update", updated, {
                    workspaceId: ctx.workspaceId,
                    assignmentId: args.assignmentId,
                });
            } catch (err) {
                return errorResult("clockify_scheduling_assignments_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_scheduling_assignments_delete",
        {
            title: "Delete a scheduling assignment",
            description: "Permanently delete a scheduling assignment.",
            inputSchema: { assignmentId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.scheduling.delete({
                    workspaceId: ctx.workspaceId,
                    assignmentId: args.assignmentId,
                });
                return successResult(
                    "clockify_scheduling_assignments_delete",
                    { deleted: true, assignmentId: args.assignmentId },
                    { workspaceId: ctx.workspaceId, assignmentId: args.assignmentId },
                );
            } catch (err) {
                return errorResult("clockify_scheduling_assignments_delete", err);
            }
        },
    );
}
