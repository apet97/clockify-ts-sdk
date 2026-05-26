/**
 * `clk115 start [description]` — start a running timer. Optional
 * --project / --task / --tag flags resolve names to IDs via list
 * queries so the user does not have to keep IDs at hand.
 */
import { Command } from "commander";

import { printObject } from "../output.js";
import { resolveContext } from "./helpers.js";
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
            printObject(
                {
                    id: entry.id ?? "",
                    description: entry.description ?? "",
                    projectId: entry.projectId ?? "",
                    startedAt: entry.timeInterval?.start ?? body.start,
                },
                output,
            );
        });
};

async function resolveProjectId(client: ReturnType<typeof buildBag>["client"], workspaceId: string, ref: string): Promise<string> {
    if (looksLikeId(ref)) return ref;
    const list = (await client.projects.list({ workspaceId, name: ref })) as unknown[];
    const match = list.find((p) => (p as { name?: string }).name === ref);
    if (!match) {
        throw new Error(`project ${JSON.stringify(ref)} not found in workspace`);
    }
    return String((match as { id?: string }).id ?? "");
}

async function resolveTaskId(
    client: ReturnType<typeof buildBag>["client"],
    workspaceId: string,
    projectId: string,
    ref: string,
): Promise<string> {
    if (looksLikeId(ref)) return ref;
    const list = (await client.tasks.list({ workspaceId, projectId, name: ref })) as unknown[];
    const match = list.find((t) => (t as { name?: string }).name === ref);
    if (!match) {
        throw new Error(`task ${JSON.stringify(ref)} not found on project ${projectId}`);
    }
    return String((match as { id?: string }).id ?? "");
}

async function resolveTagIds(
    client: ReturnType<typeof buildBag>["client"],
    workspaceId: string,
    refs: string[],
): Promise<string[]> {
    const ids: string[] = [];
    for (const ref of refs) {
        if (looksLikeId(ref)) {
            ids.push(ref);
            continue;
        }
        const list = (await client.tags.list({ workspaceId, name: ref })) as unknown[];
        const match = list.find((t) => (t as { name?: string }).name === ref);
        if (!match) {
            throw new Error(`tag ${JSON.stringify(ref)} not found in workspace`);
        }
        ids.push(String((match as { id?: string }).id ?? ""));
    }
    return ids;
}

function looksLikeId(value: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(value);
}

// Just-for-typing bag — the SDK type isn't exported as a name we can
// destructure directly, so we reify the shape from the factory return.
function buildBag(): { client: import("../client.js").ClockifyClient } {
    return null as never;
}
