/**
 * `clk115 start [description]` — start a running timer. Optional
 * --project / --task / --tag flags resolve names to IDs via list
 * queries so the user does not have to keep IDs at hand.
 */
import { looksLikeClockifyId, matchByName } from "clockify-sdk-ts-115/resolve";
import type { Command } from "commander";

import type { ClockifyClient } from "../client.js";
import { printReceipt } from "../receipt.js";

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

/** Map raw SDK list rows to the `{ id, name, archived }` shape `matchByName` wants. */
function asNamed(rows: unknown[]): Array<{ id: string; name: string; archived?: boolean }> {
    return rows.map((r) => {
        const row = r as { id?: string; name?: string; archived?: boolean };
        return { id: String(row.id ?? ""), name: String(row.name ?? ""), archived: row.archived };
    });
}

/** Resolve one name (case-insensitive, exact) to an id, or throw a clear error. */
function pickIdByName(rows: unknown[], ref: string, noun: string): string {
    const match = matchByName(asNamed(rows), ref);
    if (match.kind === "many") {
        throw new Error(`multiple ${noun}s named ${JSON.stringify(ref)}; pass the 24-character id instead`);
    }
    if (match.kind === "none") {
        throw new Error(`${noun} ${JSON.stringify(ref)} not found in workspace`);
    }
    return match.entity.id;
}

async function resolveProjectId(client: ClockifyClient, workspaceId: string, ref: string): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = (await client.projects.list({ workspaceId, name: ref })) as unknown[];
    return pickIdByName(list, ref, "project");
}

async function resolveTaskId(
    client: ClockifyClient,
    workspaceId: string,
    projectId: string,
    ref: string,
): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = (await client.tasks.list({ workspaceId, projectId, name: ref })) as unknown[];
    const match = matchByName(asNamed(list), ref);
    if (match.kind === "many") {
        throw new Error(`multiple tasks named ${JSON.stringify(ref)} on project ${projectId}; pass the 24-character id`);
    }
    if (match.kind === "none") {
        throw new Error(`task ${JSON.stringify(ref)} not found on project ${projectId}`);
    }
    return match.entity.id;
}

async function resolveTagIds(
    client: ClockifyClient,
    workspaceId: string,
    refs: string[],
): Promise<string[]> {
    const ids: string[] = [];
    for (const ref of refs) {
        if (looksLikeClockifyId(ref)) {
            ids.push(ref);
            continue;
        }
        const list = (await client.tags.list({ workspaceId, name: ref })) as unknown[];
        ids.push(pickIdByName(list, ref, "tag"));
    }
    return ids;
}
