/**
 * Shared project/task/tag name→id resolution for the write commands.
 * `start` and `log` both accept names OR ids: a 24-hex id passes straight
 * through, while a name does one case-insensitive list lookup. Keeping this
 * in one place means the two sibling commands can never drift apart.
 */
import { looksLikeClockifyId, matchByName } from "clockify-sdk-ts-115/resolve";

import type { ClockifyClient } from "../client.js";

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

export async function resolveProjectId(client: ClockifyClient, workspaceId: string, ref: string): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = (await client.projects.list({ workspaceId, name: ref })) as unknown[];
    return pickIdByName(list, ref, "project");
}

export async function resolveTaskId(
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

export async function resolveTagIds(client: ClockifyClient, workspaceId: string, refs: string[]): Promise<string[]> {
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
