/**
 * `clk115 tasks {list,create,get,update,delete}` — tasks are project-scoped,
 * so every subcommand takes a `<projectId>` first.
 */
import type { ClockifyApi } from "clockify-sdk-ts-115";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerTasksCommand: Registrar = (program, services) => {
    const tasks = program.command("tasks").description("Manage tasks.");

    tasks
        .command("list")
        .argument("<projectId>", "Project ID.")
        .description("List tasks for a project.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by task name substring.")
        .action(async function (this: Command, projectId: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: ClockifyApi.ListTasksRequest = {
                workspaceId,
                projectId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            const items = await client.tasks.list(req);
            const rows = items.map((raw) => {
                const t = raw as { id?: string; name?: string; status?: string; billable?: boolean };
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = { workspaceId, projectId, name };
            if (opts.billable !== undefined) body.billable = opts.billable;
            if (opts.estimate) body.estimate = opts.estimate;
            if (Array.isArray(opts.assignee) && opts.assignee.length > 0) body.assigneeIds = opts.assignee;
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            const created = (await client.tasks.create(body as never)) as { id?: string; name?: string };
            const data = { id: created.id ?? "", name: created.name ?? name };
            printReceipt(
                {
                    ok: true,
                    action: "tasks.create",
                    entity: "task",
                    ids: { projectId, taskId: data.id },
                    data,
                    changed: { created: [{ type: "task", id: data.id, name: data.name }] },
                    next: [{ command: `clk115 tasks list ${projectId} --json`, reason: "Verify the task appears." }],
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const task = await client.tasks.get({ workspaceId, projectId, taskId: id });
            printObject(task as Record<string, unknown>, output);
        });

    tasks
        .command("update")
        .argument("<projectId>", "Project ID.")
        .argument("<id>", "Task ID.")
        .option("--name <text>", "New task name.")
        .option("--status <status>", "ACTIVE or DONE.")
        .option("--estimate <iso>", "ISO-8601 duration estimate (e.g. PT8H).")
        .option("--billable", "Mark as billable.")
        .option("--no-billable", "Mark as non-billable.")
        .option("--assignee <id...>", "Assignee user ID(s).")
        .description("Update a task by project ID and task ID.")
        .action(async function (this: Command, projectId: string, id: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = { workspaceId, projectId, taskId: id };
            if (opts.name) body.name = opts.name;
            if (opts.status) body.status = String(opts.status).toUpperCase();
            if (opts.estimate) body.estimate = opts.estimate;
            if (opts.billable !== undefined) body.billable = opts.billable;
            if (Array.isArray(opts.assignee) && opts.assignee.length > 0) body.assigneeIds = opts.assignee;
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            const updated = (await client.tasks.update(body as never)) as { id?: string; name?: string };
            const data = { id: updated.id ?? id, name: updated.name ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "tasks.update",
                    entity: "task",
                    ids: { projectId, taskId: data.id },
                    data,
                    changed: { updated: [{ type: "task", id: data.id, name: data.name }] },
                    next: [{ command: `clk115 tasks get ${projectId} ${data.id} --json`, reason: "Verify the update." }],
                },
                output,
            );
        });

    tasks
        .command("delete")
        .argument("<projectId>", "Project ID.")
        .argument("<id>", "Task ID.")
        .description("Delete a task by project ID and task ID (marks DONE first; an active task cannot be deleted).")
        .action(async function (this: Command, projectId: string, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            // Clockify rejects DELETE of an ACTIVE task (400) — mark it DONE
            // first via GET-then-PUT, carrying the name the replace-PUT
            // requires, then DELETE. Mirrors the MCP tool.
            const current = (await client.tasks.get({ workspaceId, projectId, taskId: id })) as { name?: string };
            await client.tasks.update({
                workspaceId,
                projectId,
                taskId: id,
                name: String(current.name ?? ""),
                status: "DONE",
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            } as never);
            await client.tasks.delete({ workspaceId, projectId, taskId: id });
            printReceipt(
                {
                    ok: true,
                    action: "tasks.delete",
                    entity: "task",
                    ids: { projectId, taskId: id },
                    data: { id, deleted: true, message: `deleted task ${id}` },
                    changed: { deleted: [{ type: "task", id }] },
                    next: [{ command: `clk115 tasks list ${projectId} --json`, reason: "Verify the task no longer appears." }],
                },
                output,
            );
        });
};
