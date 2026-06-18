import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, successResult, writeReceipt } from "../result.js";

export function registerTasksTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
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
            const req: Record<string, unknown> = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.name) req.name = args.name;
            const tasks = await ctx.client.tasks.list(req as never);
            return successResult("clockify_tasks_list", tasks, {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                count: tasks.length,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
                hasMore: tasks.length === (args.pageSize ?? 50),
            });
        },
        "Verify the projectId exists in this workspace.",
    );

    defineTool(
        server,
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
            }, writeReceipt("created", "task", { id: (task as { id?: string }).id, name: args.name }));
        },
    );

    defineTool(
        server,
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
        },
    );

    defineTool(
        server,
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
            }, writeReceipt("updated", "task", args.taskId));
        },
    );

    defineTool(
        server,
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
            const preview = { action: "delete", entity: "task", id: args.taskId, projectId: args.projectId };
            const confirmation = requireConfirmation(ctx, "clockify_tasks_delete", "task_delete", args, preview);
            if (confirmation) return confirmation;
            // Clockify rejects DELETE of an ACTIVE task (400 "Cannot delete an
            // active task", live-verified 2026-06-15) — mark it DONE first via
            // GET-then-PUT, carrying the name the replace-PUT requires.
            const current = (await ctx.client.tasks.get({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
            })) as { name?: string };
            await ctx.client.tasks.update({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
                name: String(current.name ?? ""),
                status: "DONE",
            } as never);
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
                writeReceipt("deleted", "task", args.taskId),
            );
        },
    );

    defineTool(
        server,
        "clockify_tasks_set_rate",
        {
            title: "Set a task's rate",
            description:
                "Set a task's hourly (billable) or cost rate. Amount is in MAJOR units (e.g. 75 = $75.00); Clockify stores integer minor units.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
                rateKind: z.enum(["HOURLY", "COST"]).describe("HOURLY = billable rate; COST = internal cost rate."),
                amount: z.number().describe("Rate in major units, e.g. 75 for $75/hr."),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const amountMinor = toMinor(args.amount, "major");
            const req: Record<string, unknown> = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
                amount: amountMinor,
            };
            if (args.since) req.since = args.since;
            const updated =
                args.rateKind === "COST"
                    ? await ctx.client.tasks.updateCostRate(req as never)
                    : await ctx.client.tasks.updateBillableRate(req as never);
            return successResult("clockify_tasks_set_rate", updated, {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
                rateKind: args.rateKind,
                amountMajor: args.amount,
                amountMinor,
            }, writeReceipt("updated", "task", args.taskId));
        },
    );
}
