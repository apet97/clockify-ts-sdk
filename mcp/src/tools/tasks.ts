import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { errorResult, successResult } from "../result.js";

export function registerTasksTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_tasks_list",
        {
            title: "List tasks",
            description: "List tasks for a project in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                projectId: z.string().min(1),
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
                    projectId: args.projectId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.name) req.name = args.name;
                const tasks = (await ctx.client.tasks.list(req as never)) as unknown[];
                return successResult("clockify_tasks_list", tasks, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    count: tasks.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: tasks.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult("clockify_tasks_list", err, "Verify the projectId exists in this workspace.");
            }
        },
    );

    server.registerTool(
        "clockify_tasks_create",
        {
            title: "Create a task",
            description: "Create a task under one project with optional estimate and assignees.",
            inputSchema: {
                projectId: z.string().min(1),
                name: z.string().min(1),
                billable: z.boolean().optional(),
                estimate: z.string().optional().describe("ISO-8601 duration, e.g. PT8H."),
                assigneeIds: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { name: args.name };
                if (args.billable !== undefined) body.billable = args.billable;
                if (args.estimate) body.estimate = args.estimate;
                if (args.assigneeIds) body.assigneeIds = args.assigneeIds;
                const task = await ctx.client.tasks.create({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    ...body,
                } as never);
                return successResult("clockify_tasks_create", task, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                });
            } catch (err) {
                return errorResult("clockify_tasks_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_tasks_get",
        {
            title: "Get a task",
            description: "Fetch one task by project ID and task ID from the pinned workspace.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const task = await ctx.client.tasks.get({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                });
                return successResult("clockify_tasks_get", task, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                });
            } catch (err) {
                return errorResult("clockify_tasks_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_tasks_update",
        {
            title: "Update a task",
            description: "Update task metadata such as name, status, estimate, billing, or assignees.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
                name: z.string().optional(),
                billable: z.boolean().optional(),
                estimate: z.string().optional(),
                status: z.string().optional().describe("ACTIVE | DONE."),
                assigneeIds: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.billable !== undefined) body.billable = args.billable;
                if (args.estimate) body.estimate = args.estimate;
                if (args.status) body.status = args.status;
                if (args.assigneeIds) body.assigneeIds = args.assigneeIds;
                const updated = await ctx.client.tasks.update({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                    ...body,
                } as never);
                return successResult("clockify_tasks_update", updated, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                });
            } catch (err) {
                return errorResult("clockify_tasks_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_tasks_delete",
        {
            title: "Delete a task",
            description:
                "Permanently delete one task by project ID and task ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                const preview = { action: "delete", entity: "task", id: args.taskId, projectId: args.projectId };
                const confirmation = requireConfirmation(ctx, "clockify_tasks_delete", "task_delete", args, preview);
                if (confirmation) return confirmation;
                await ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                });
                return successResult(
                    "clockify_tasks_delete",
                    { deleted: true, projectId: args.projectId, taskId: args.taskId },
                    {
                        workspaceId: ctx.workspaceId,
                        projectId: args.projectId,
                        taskId: args.taskId,
                    },
                );
            } catch (err) {
                return errorResult("clockify_tasks_delete", err);
            }
        },
    );
}
