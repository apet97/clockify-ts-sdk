/**
 * `clk115 status` — show the active workspace, the current user, and
 * any in-progress timer. The first command an operator runs to
 * confirm credentials and orientation.
 */
import type { Command } from "commander";


import { formatIsoDuration } from "../duration.js";
import { printObject } from "../output.js";
import { entityId } from "../sdk-narrow.js";

import { resolveBaseContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerStatusCommand: Registrar = (program, services) => {
    program
        .command("status")
        .description("Show the configured workspace, current user, and running timer.")
        .action(async function (this: Command) {
            const { client, config, output } = resolveBaseContext(this, services);
            const user = await client.users.getCurrentUser();

            // Workspace bootstrap: with only an API key and no workspace
            // configured yet, list the workspaces this key can reach
            // (GET /workspaces needs no workspace id) so the user can pick
            // one instead of dead-ending on "workspace ID not set".
            if (!config.workspaceId) {
                const workspaces = (await client.workspaces.list()) as Array<{ id?: string; name?: string }>;
                printObject(
                    {
                        userId: entityId(user) ?? "",
                        email: (user as { email?: string }).email ?? "",
                        workspaceId: "(not set)",
                        availableWorkspaces: workspaces.map((w) => ({ id: w.id ?? "", name: w.name ?? "" })),
                        hint: "Set CLOCKIFY_WORKSPACE_ID (or pass --workspace, or add workspaceId to ~/.clockifyrc.json) to one of the ids above.",
                    },
                    output,
                );
                return;
            }

            const workspaceId = config.workspaceId;
            const inProgressResp = await client.timeEntries.listInProgress({ workspaceId });
            const entries = normaliseEntries(inProgressResp);
            const running = entries.find((entry) => isOwn(entry, user)) ?? null;

            printObject(
                {
                    workspaceId,
                    userId: entityId(user) ?? "",
                    email: (user as { email?: string }).email ?? "",
                    name: (user as { name?: string }).name ?? "",
                    runningEntry: running
                        ? {
                              id: entityId(running),
                              description: (running as { description?: string }).description ?? "",
                              projectId: (running as { projectId?: string | null }).projectId ?? "",
                              startedAt: extractStart(running),
                              elapsed: formatIsoDuration(extractIsoDuration(running)),
                          }
                        : "(no timer running)",
                },
                output,
            );
        });
};

function normaliseEntries(resp: unknown): unknown[] {
    if (Array.isArray(resp)) return resp;
    if (resp && typeof resp === "object") {
        const candidate = (resp as { timeEntries?: unknown; data?: unknown }).timeEntries ?? (resp as { data?: unknown }).data;
        if (Array.isArray(candidate)) return candidate;
    }
    return [];
}

function isOwn(entry: unknown, user: unknown): boolean {
    const entryUserId = (entry as { userId?: string }).userId;
    const userId = entityId(user);
    return entryUserId !== undefined && userId !== undefined && entryUserId === userId;
}

function extractStart(entry: unknown): string {
    const interval = (entry as { timeInterval?: { start?: string } }).timeInterval;
    return interval?.start ?? "";
}

function extractIsoDuration(entry: unknown): string | null {
    const interval = (entry as { timeInterval?: { duration?: string | null } }).timeInterval;
    return interval?.duration ?? null;
}
