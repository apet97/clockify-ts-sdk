import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";

type TaskUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateTasksRequest>;

function taskUpdateBody(current: unknown): TaskUpdateBody {
    if (current == null || typeof current !== "object") {
        throw new TypeError("Cannot update task: current task state is unavailable.");
    }
    const value = current as Record<string, unknown>;
    if (typeof value.name !== "string" || value.name.length === 0) {
        throw new TypeError("Cannot update task: current task name is missing.");
    }
    const body: TaskUpdateBody = { name: value.name };
    if (value.assigneeId !== undefined && value.assigneeId !== null) {
        if (typeof value.assigneeId !== "string") {
            throw new TypeError("Cannot update task: current assigneeId is invalid.");
        }
        body.assigneeId = value.assigneeId;
    }
    if (value.billable !== undefined) {
        if (typeof value.billable !== "boolean") {
            throw new TypeError("Cannot update task: current billable state is invalid.");
        }
        body.billable = value.billable;
    }
    for (const field of ["estimate"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`Cannot update task: current ${field} is invalid.`);
        }
        body[field] = fieldValue;
    }
    for (const field of ["assigneeIds", "userGroupIds"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (!Array.isArray(fieldValue) || fieldValue.some((item) => typeof item !== "string")) {
            throw new TypeError(`Cannot update task: current ${field} is invalid.`);
        }
        body[field] = [...fieldValue];
    }
    if (value.budgetEstimate !== undefined && value.budgetEstimate !== null) {
        if (typeof value.budgetEstimate !== "number" || !Number.isFinite(value.budgetEstimate)) {
            throw new TypeError("Cannot update task: current budgetEstimate is invalid.");
        }
        body.budgetEstimate = value.budgetEstimate;
    }
    if (value.status !== undefined && value.status !== null) {
        if (value.status !== "ACTIVE" && value.status !== "DONE" && value.status !== "ALL") {
            throw new TypeError("Cannot update task: current status is invalid.");
        }
        body.status = value.status;
    }
    return body;
}

function equalTaskField(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function registerTasksTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_tasks_list",
        {
            title: "List tasks",
            description:
                "List tasks for a project in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                projectId: z.string().min(1),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const page = args.page ?? 1;
            const pageSize = args.pageSize ?? 50;
            const req: ClockifyApi.ListTasksRequest = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                page,
                "page-size": pageSize,
            };
            if (args.name) req.name = args.name;
            const { items: tasks, meta } = await pageWithMeta(ctx.client.tasks.list(req), {
                workspaceId: ctx.workspaceId,
                page,
                pageSize,
            });
            return successResult("clockify_tasks_list", tasks, {
                ...meta,
                projectId: args.projectId,
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
                estimate: z.string().optional().describe("ISO-8601 duration, e.g. PT8H."),
                assigneeIds: z.array(z.string()).optional(),
            },
        },
        async (args) => {
            const req: ClockifyApi.TaskCreateRequest = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                body: {
                    name: args.name,
                    ...(args.estimate ? { estimate: args.estimate } : {}),
                    ...(args.assigneeIds ? { assigneeIds: args.assigneeIds } : {}),
                },
            };
            const task = await ctx.client.tasks.create(req);
            const taskId = entityId(task);
            return successResult(
                "clockify_tasks_create",
                task,
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                },
                writeReceipt(
                    "created",
                    "task",
                    { id: taskId, name: args.name },
                    {
                        next: [
                            {
                                tool: "clockify_log_work",
                                args: {
                                    project_id: args.projectId,
                                    ...(taskId ? { task_id: taskId } : {}),
                                },
                                reason: "Log finished work against the new task.",
                            },
                        ],
                    },
                ),
            );
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
            idempotent: true,
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
            description:
                "Update task metadata such as name, status, estimate, billing, or assignees.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
                name: z.string().min(1).optional(),
                billable: z.boolean().optional(),
                estimate: z.string().optional(),
                status: z.enum(["ACTIVE", "DONE"]).optional().describe("ACTIVE | DONE."),
                assigneeIds: z.array(z.string()).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const current = await ctx.client.tasks.get({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
            });
            const body = taskUpdateBody(current);
            let changed = false;
            if (args.name !== undefined) {
                changed ||= !equalTaskField(body.name, args.name);
                body.name = args.name;
            }
            if (args.billable !== undefined) {
                changed ||= !equalTaskField(body.billable, args.billable);
                body.billable = args.billable;
            }
            if (args.estimate !== undefined) {
                changed ||= !equalTaskField(body.estimate, args.estimate);
                body.estimate = args.estimate;
            }
            if (args.status !== undefined) {
                changed ||= !equalTaskField(body.status, args.status);
                body.status = args.status;
            }
            if (args.assigneeIds !== undefined) {
                changed ||= !equalTaskField(body.assigneeIds, args.assigneeIds);
                body.assigneeIds = args.assigneeIds;
            }
            if (!changed) {
                throw new TypeError("Task update is a no-op; supply at least one changed field.");
            }
            const req: ClockifyApi.UpdateTasksRequest = {
                body,
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                taskId: args.taskId,
            };
            const updated = await ctx.client.tasks.update(req);
            return successResult(
                "clockify_tasks_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                },
                writeReceipt("updated", "task", args.taskId),
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_tasks_delete",
        {
            title: "Delete a task",
            description:
                "Permanently delete one task by project ID and task ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
            },
        },
        {
            preview: async (args) => {
                const deleteRequest = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    taskId: args.taskId,
                };
                const current = await ctx.client.tasks.get(deleteRequest);
                const body = taskUpdateBody(current);
                const archiveRequest =
                    body.status === "DONE"
                        ? undefined
                        : ({
                              ...deleteRequest,
                              body: { ...body, status: "DONE" },
                          } satisfies ClockifyApi.UpdateTasksRequest);
                return {
                    action: "delete",
                    entity: "task",
                    id: args.taskId,
                    projectId: args.projectId,
                    deleteRequest,
                    ...(archiveRequest ? { archiveRequest } : {}),
                };
            },
            execute: async (preview) => {
                if (preview.archiveRequest) {
                    await ctx.client.tasks.update(preview.archiveRequest);
                }
                await ctx.client.tasks.delete(preview.deleteRequest);
                return successResult(
                    "clockify_tasks_delete",
                    {
                        deleted: true,
                        projectId: preview.projectId,
                        taskId: preview.id,
                    },
                    {
                        workspaceId: preview.deleteRequest.workspaceId,
                        projectId: preview.projectId,
                        taskId: preview.id,
                    },
                    writeReceipt("deleted", "task", preview.id, {
                        next: [
                            {
                                tool: "clockify_tasks_list",
                                args: { projectId: preview.projectId },
                                reason: "Verify the task no longer appears.",
                            },
                        ],
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_tasks_set_rate",
        {
            title: "Set a task's rate",
            description:
                "Set a task's hourly (billable) or cost rate. Amount is in MAJOR units (e.g. 75 = $75.00); Clockify stores integer minor units.",
            inputSchema: {
                projectId: z.string().min(1),
                taskId: z.string().min(1),
                rateKind: z
                    .enum(["HOURLY", "COST"])
                    .describe("HOURLY = billable rate; COST = internal cost rate."),
                amount: zNumberLike(z.number()).describe(
                    "Rate in major units, e.g. 75 for $75/hr.",
                ),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            idempotent: true,
        },
        {
            preview: (args) => {
                const amountMinor = toMinor(args.amount, "major");
                return {
                    rateKind: args.rateKind,
                    amountMajor: args.amount,
                    amountMinor,
                    request: {
                        amount: amountMinor,
                        ...(args.since !== undefined ? { since: args.since } : {}),
                        workspaceId: ctx.workspaceId,
                        projectId: args.projectId,
                        taskId: args.taskId,
                    },
                };
            },
            execute: async (preview) => {
                const updated =
                    preview.rateKind === "COST"
                        ? await ctx.client.tasks.updateCostRate(
                              preview.request satisfies ClockifyApi.UpdateCostRateTasksRequest,
                          )
                        : await ctx.client.tasks.updateBillableRate(
                              preview.request satisfies ClockifyApi.UpdateBillableRateTasksRequest,
                          );
                return successResult(
                    "clockify_tasks_set_rate",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        projectId: preview.request.projectId,
                        taskId: preview.request.taskId,
                        rateKind: preview.rateKind,
                        amountMajor: preview.amountMajor,
                        amountMinor: preview.amountMinor,
                    },
                    writeReceipt("updated", "task", preview.request.taskId),
                );
            },
        },
    );
}
