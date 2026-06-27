/**
 * Shared project/task/tag name→id resolution for the write commands.
 * `start` and `log` both accept names OR ids: a 24-hex id passes straight
 * through, while a name does one case-insensitive list lookup. Keeping this
 * in one place means the two sibling commands can never drift apart.
 */
import { iterAll, type PaginatedRequest } from "clockify-sdk-ts-115/iter";
import { looksLikeClockifyId, matchByName } from "clockify-sdk-ts-115/resolve";

import type { ClockifyClient } from "../client.js";

/** Map raw SDK list rows to the `{ id, name, archived }` shape `matchByName` wants. */
function asNamed(rows: unknown[]): Array<{ id: string; name: string; archived?: boolean }> {
    return rows.map((r) => {
        const row = r as { id?: string; name?: string; archived?: boolean };
        return {
            id: String(row.id ?? ""),
            name: String(row.name ?? ""),
            ...(row.archived !== undefined ? { archived: row.archived } : {}),
        };
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

async function collectPaged<TRequest extends PaginatedRequest>(
    fetcher: (request: TRequest) => PromiseLike<readonly unknown[]>,
    baseRequest: Omit<TRequest, "page" | "page-size">,
): Promise<unknown[]> {
    const rows: unknown[] = [];
    for await (const row of iterAll(fetcher, baseRequest, { pageSize: 200, maxPages: 1000 })) {
        rows.push(row);
    }
    return rows;
}

export async function resolveProjectId(client: ClockifyClient, workspaceId: string, ref: string): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = await collectPaged(client.projects.list.bind(client.projects), {
        workspaceId,
        name: ref,
    });
    return pickIdByName(list, ref, "project");
}

export async function resolveClientId(client: ClockifyClient, workspaceId: string, ref: string): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = await collectPaged(client.clients.list.bind(client.clients), {
        workspaceId,
        name: ref,
    });
    return pickIdByName(list, ref, "client");
}

export async function resolveTaskId(
    client: ClockifyClient,
    workspaceId: string,
    projectId: string,
    ref: string,
): Promise<string> {
    if (looksLikeClockifyId(ref)) return ref;
    const list = await collectPaged(client.tasks.list.bind(client.tasks), {
        workspaceId,
        projectId,
        name: ref,
    });
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
        const list = await collectPaged(client.tags.list.bind(client.tags), {
            workspaceId,
            name: ref,
        });
        ids.push(pickIdByName(list, ref, "tag"));
    }
    return ids;
}
