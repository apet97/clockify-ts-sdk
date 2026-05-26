/**
 * `clk115 status` — show the active workspace, the current user, and
 * any in-progress timer. The first command an operator runs to
 * confirm credentials and orientation.
 */
import { Command } from "commander";

import { formatIsoDuration } from "../duration.js";
import { printObject } from "../output.js";
import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerStatusCommand: Registrar = (program, services) => {
    program
        .command("status")
        .description("Show the configured workspace, current user, and running timer.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const inProgressResp = await client.timeEntries.listInProgress({ workspaceId });
            const entries = normaliseEntries(inProgressResp);
            const running = entries.find((entry) => isOwn(entry, user)) ?? null;

            printObject(
                {
                    workspaceId,
                    userId: (user as { id?: string }).id ?? "",
                    email: (user as { email?: string }).email ?? "",
                    name: (user as { name?: string }).name ?? "",
                    runningEntry: running
                        ? {
                              id: (running as { id?: string }).id,
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
    const userId = (user as { id?: string }).id;
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
