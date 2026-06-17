/**
 * `clk115 start [description]` — start a running timer. Optional
 * --project / --task / --tag flags resolve names to IDs via list
 * queries so the user does not have to keep IDs at hand.
 */
import type { Command } from "commander";

import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import { resolveProjectId, resolveTaskId, resolveTagIds } from "./resolve-refs.js";
import type { Registrar } from "./types.js";

interface StartOpts {
    project?: string;
    task?: string;
    tag?: string[];
    billable?: boolean;
}

export const registerStartCommand: Registrar = (program, services) => {
    program
        .command("start")
        .description("Start a running time entry. Resolves project/task/tag names to IDs automatically.")
        .argument("[description]", "Description for the time entry.")
        .option("-p, --project <name>", "Project name or ID.")
        .option("-t, --task <name>", "Task name or ID.")
        .option("--tag <name...>", "Tag name(s) or ID(s). Repeat the flag for multiple tags.")
        .option("--billable", "Mark the entry as billable.", false)
        .action(async function (this: Command, description: string | undefined, opts: StartOpts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = (user as { id?: string }).id;
            if (!userId) {
                throw new Error("could not determine user ID from getCurrentUser response");
            }

            const projectId = opts.project ? await resolveProjectId(client, workspaceId, opts.project) : undefined;
            if (opts.task && !projectId) {
                throw new Error("--task requires --project: a task can only be resolved within a project.");
            }
            const taskId =
                opts.task && projectId
                    ? await resolveTaskId(client, workspaceId, projectId, opts.task)
                    : undefined;
            const tagIds = opts.tag ? await resolveTagIds(client, workspaceId, opts.tag) : undefined;

            const body: Record<string, unknown> = { start: new Date().toISOString() };
            if (description) body.description = description;
            if (projectId) body.projectId = projectId;
            if (taskId) body.taskId = taskId;
            if (tagIds && tagIds.length > 0) body.tagIds = tagIds;
            if (opts.billable) body.billable = true;

            const created = await client.timeEntries.create({ workspaceId, ...body } as never);
            const entry = created as { id?: string; description?: string; projectId?: string | null; timeInterval?: { start?: string } };
            const data = {
                id: entry.id ?? "",
                description: entry.description ?? "",
                projectId: entry.projectId ?? "",
                startedAt: entry.timeInterval?.start ?? body.start,
            };
            printReceipt(
                {
                    ok: true,
                    action: "timer.start",
                    entity: "time_entry",
                    ids: { entryId: data.id },
                    data,
                    changed: { created: [{ type: "time_entry", id: data.id }] },
                    next: [{ command: "clk115 stop --json", reason: "Stop this running timer." }],
                },
                output,
            );
        });
};
