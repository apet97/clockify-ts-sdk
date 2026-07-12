/**
 * `clk115 tasks {list,create,get,update,delete}` — tasks are project-scoped,
 * so every subcommand takes a `<projectId>` first.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

type TaskUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateTasksRequest>;

function requireTaskName(value: unknown, source: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${source} is missing the required task name; refusing to mutate.`);
    }
    return value;
}

function taskStatus(value: unknown, source: string): ClockifyApi.TaskStatus {
    const status = String(value).toUpperCase();
    if (status !== "ACTIVE" && status !== "DONE") {
        throw new Error(`${source} has unknown task status: ${String(value)}`);
    }
    return status;
}

function stringList(value: unknown, field: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`Current task has invalid ${field}; refusing to mutate.`);
    }
    return [...value];
}

function optionalTaskString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
        throw new Error(`Current task has invalid ${field}; refusing to mutate.`);
    }
    return value;
}

function requiredTaskBoolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
        throw new Error(`Current task has invalid or missing ${field}; refusing to mutate.`);
    }
    return value;
}

function optionalTaskInteger(value: unknown, field: string): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`Current task has invalid ${field}; refusing to mutate.`);
    }
    return value;
}

function sameStringList(left: readonly string[] | undefined, right: readonly string[]): boolean {
    return left !== undefined && left.length === right.length && left.every((item, i) => item === right[i]);
}

function reconstructTaskBody(
    current: Partial<ClockifyApi.Task>,
    suppliedName?: unknown,
): TaskUpdateBody {
    const body: TaskUpdateBody = {
        name:
            suppliedName !== undefined
                ? requireTaskName(suppliedName, "Task update request")
                : requireTaskName(current.name, "Current task"),
    };
    const assigneeId = optionalTaskString(current.assigneeId, "assigneeId");
    if (assigneeId !== undefined) body.assigneeId = assigneeId;
    const assigneeIds = stringList(current.assigneeIds, "assigneeIds");
    if (assigneeIds !== undefined) body.assigneeIds = assigneeIds;
    body.billable = requiredTaskBoolean(current.billable, "billable");
    const budgetEstimate = optionalTaskInteger(current.budgetEstimate, "budgetEstimate");
    if (budgetEstimate !== undefined) body.budgetEstimate = budgetEstimate;
    const estimate = optionalTaskString(current.estimate, "estimate");
    if (estimate !== undefined) body.estimate = estimate;
    if (current.status === undefined) {
        throw new Error("Current task is missing the required status; refusing to mutate.");
    }
    body.status = taskStatus(current.status, "Current task");
    const userGroupIds = stringList(current.userGroupIds, "userGroupIds");
    if (userGroupIds !== undefined) body.userGroupIds = userGroupIds;
    return body;
}

export const registerTasksCommand: Registrar = (program, services) => {
    const tasks = program.command("tasks").description("Manage tasks.");

    tasks
        .command("list")
        .argument("<projectId>", "Project ID.")
        .description("List tasks for a project.")
        .option(
            "--limit <n>",
            "Items per page (default 25, max 200).",
            parseIntArg,
            25,
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by task name substring.")
        .action(async function (this: Command, projectId: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListTasksRequest = {
                workspaceId,
                projectId,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
            };
            if (opts.name) req.name = opts.name;
            const items = await client.tasks.list(req);
            const rows = items.map((raw) => {
                const t = raw as {
                    id?: string;
                    name?: string;
                    status?: string;
                    billable?: boolean;
                };
                return {
                    id: t.id ?? "",
                    name: t.name ?? "",
                    status: t.status ?? "",
                    billable: t.billable === true,
                };
            });
            printRecords(rows, output);
        });

    tasks
        .command("create")
        .argument("<projectId>", "Project ID.")
        .argument("<name>", "Task name.")
        .option("--billable", "Mark as billable.")
        .option("--estimate <iso>", "ISO-8601 duration estimate (e.g. PT8H).")
        .option("--assignee <id...>", "Assignee user ID(s).")
        .description("Create a task under a project.")
        .action(async function (this: Command, projectId: string, name: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            requireTaskName(name, "Task create request");
            const body: ClockifyRequestBody<ClockifyApi.TaskCreateRequest> & {
                billable?: boolean;
            } = { name };
            if (opts.billable !== undefined) body.billable = opts.billable;
            if (opts.estimate !== undefined) body.estimate = opts.estimate;
            if (Array.isArray(opts.assignee)) body.assigneeIds = opts.assignee;
            const req: ClockifyApi.TaskCreateRequest = {
                workspaceId,
                projectId,
                body,
            };
            const created = (await client.tasks.create(req)) as { id?: string; name?: string };
            const data = { id: created.id ?? "", name: created.name ?? name };
            printReceipt(
                {
                    ok: true,
                    action: "tasks.create",
                    entity: "task",
                    ids: { projectId, taskId: data.id },
                    data,
                    changed: { created: [{ type: "task", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 tasks list ${projectId} --json`,
                            reason: "Verify the task appears.",
                        },
                    ],
                },
                output,
            );
        });

    tasks
        .command("get")
        .argument("<projectId>", "Project ID.")
        .argument("<id>", "Task ID.")
        .description("Get one task by project ID and task ID.")
        .action(async function (this: Command, projectId: string, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const task = await client.tasks.get({ workspaceId, projectId, taskId: id });
            printObject(task, output);
        });

    tasks
        .command("update")
        .argument("<projectId>", "Project ID.")
        .argument("<id>", "Task ID.")
        .option("--name <text>", "Task name.")
        .option("--status <status>", "ACTIVE or DONE.")
        .option("--estimate <iso>", "ISO-8601 duration estimate (e.g. PT8H).")
        .option("--billable", "Mark as billable.")
        .option("--no-billable", "Mark as non-billable.")
        .option("--assignee <id...>", "Assignee user ID(s).")
        .description("Update a task by project ID and task ID.")
        .action(async function (this: Command, projectId: string, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const hasChanges =
                opts.name !== undefined ||
                opts.status !== undefined ||
                opts.estimate !== undefined ||
                opts.billable !== undefined ||
                opts.assignee !== undefined;
            if (!hasChanges) {
                throw new Error("tasks.update requires at least one task field to change.");
            }
            const current = (await client.tasks.get({
                workspaceId,
                projectId,
                taskId: id,
            })) as Partial<ClockifyApi.Task>;
            const body = reconstructTaskBody(current, opts.name);
            let changed = opts.name !== undefined && opts.name !== current.name;
            if (opts.status !== undefined) {
                const status = taskStatus(opts.status, "Task update request");
                changed = changed || status !== body.status;
                body.status = status;
            }
            if (opts.estimate !== undefined) {
                changed = changed || opts.estimate !== body.estimate;
                body.estimate = opts.estimate;
            }
            if (opts.billable !== undefined) {
                changed = changed || opts.billable !== body.billable;
                body.billable = opts.billable;
            }
            if (Array.isArray(opts.assignee)) {
                changed = changed || !sameStringList(body.assigneeIds, opts.assignee);
                body.assigneeIds = opts.assignee;
            }
            if (!changed) {
                throw new Error("tasks.update values are unchanged; refusing to mutate.");
            }
            const req: ClockifyApi.UpdateTasksRequest = {
                workspaceId,
                projectId,
                taskId: id,
                body,
            };
            const updated = (await client.tasks.update(req)) as { id?: string; name?: string };
            const data = { id: updated.id ?? id, name: updated.name ?? body.name };
            printReceipt(
                {
                    ok: true,
                    action: "tasks.update",
                    entity: "task",
                    ids: { projectId, taskId: data.id },
                    data,
                    changed: { updated: [{ type: "task", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 tasks get ${projectId} ${data.id} --json`,
                            reason: "Verify the update.",
                        },
                    ],
                },
                output,
            );
        });

    tasks
        .command("delete")
        .argument("<projectId>", "Project ID.")
        .argument("<id>", "Task ID.")
        .description(
            "Delete a task by project ID and task ID (marks DONE first; an active task cannot be deleted).",
        )
        .action(async function (this: Command, projectId: string, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Clockify rejects DELETE of an ACTIVE task (400) — mark it DONE
            // first via GET-then-PUT, carrying the name the replace-PUT
            // requires, then DELETE. Mirrors the MCP tool.
            const current = (await client.tasks.get({
                workspaceId,
                projectId,
                taskId: id,
            })) as Partial<ClockifyApi.Task>;
            const originalBody = reconstructTaskBody(current);
            if (originalBody.status === undefined) {
                throw new Error("Current task is missing the required status for safe delete.");
            }
            const changedStatus = originalBody.status !== "DONE";
            if (changedStatus) {
                const doneRequest: ClockifyApi.UpdateTasksRequest = {
                    workspaceId,
                    projectId,
                    taskId: id,
                    body: { ...originalBody, status: "DONE" },
                };
                await client.tasks.update(doneRequest);
            }
            try {
                await client.tasks.delete({ workspaceId, projectId, taskId: id });
            } catch (error) {
                if (changedStatus) {
                    const rollbackRequest: ClockifyApi.UpdateTasksRequest = {
                        workspaceId,
                        projectId,
                        taskId: id,
                        body: originalBody,
                    };
                    await client.tasks.update(rollbackRequest);
                }
                throw error;
            }
            printReceipt(
                {
                    ok: true,
                    action: "tasks.delete",
                    entity: "task",
                    ids: { projectId, taskId: id },
                    data: { id, deleted: true, message: `deleted task ${id}` },
                    changed: { deleted: [{ type: "task", id }] },
                    next: [
                        {
                            command: `clk115 tasks list ${projectId} --json`,
                            reason: "Verify the task no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
