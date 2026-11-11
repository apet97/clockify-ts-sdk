/**
 * `clk115 status` — show the active workspace, the current user, and
 * any in-progress timer. The first command an operator runs to
 * confirm credentials and orientation.
 */
import { iterAll } from "clockify-sdk-ts-115/iter";
import { entityId } from "clockify-sdk-ts-115/operation-receipt";
import type { Command } from "commander";


import { formatIsoDuration } from "../duration.js";
import { printObject } from "../output.js";

import { resolveBaseContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

type CliStatusState =
    | {
          readonly kind: "workspace_unconfigured";
          readonly availableWorkspaces: Array<{ id: string; name: string }>;
      }
    | {
          readonly kind: "idle";
          readonly workspaceId: string;
      }
    | {
          readonly kind: "timer_running";
          readonly workspaceId: string;
          readonly entry: unknown;
      };

export const registerStatusCommand: Registrar = (program, services) => {
    leafCommand(program, "status", "read")
        .description("Show the configured workspace, current user, and running timer.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 status\n" +
                "  $ clk115 status --json\n",
        )
        .action(async function (this: Command) {
            const { client, config, output } = await resolveBaseContext(this, services);
            const user = await client.users.getCurrentUser();
            let statusState: CliStatusState;

            // Workspace bootstrap: with only an API key and no workspace
            // configured yet, list the workspaces this key can reach
            // (GET /workspaces needs no workspace id) so the user can pick
            // one instead of dead-ending on "workspace ID not set".
            if (!config.workspaceId) {
                const workspaces = (await client.workspaces.list()) as Array<{
                    id?: string;
                    name?: string;
                }>;
                statusState = {
                    kind: "workspace_unconfigured",
                    availableWorkspaces: workspaces.map((w) => ({
                        id: w.id ?? "",
                        name: w.name ?? "",
                    })),
                };
            } else {
                const workspaceId = config.workspaceId;
                // Walk EVERY page of the paginated, workspace-wide in-progress
                // list with an early exit on the caller's own timer — "(no timer
                // running)" must not be a page-1 artifact in a busy workspace.
                statusState = { kind: "idle", workspaceId };
                for await (const entry of iterAll(
                    async (req: { workspaceId: string; page?: number; "page-size"?: number }) =>
                        normaliseEntries(await client.timeEntries.listInProgress(req)),
                    { workspaceId },
                    { pageSize: 200, maxPages: 1000 },
                )) {
                    if (isOwn(entry, user)) {
                        statusState = { kind: "timer_running", workspaceId, entry };
                        break;
                    }
                }
            }

            if (statusState.kind === "workspace_unconfigured") {
                printObject(
                    {
                        userId: entityId(user) ?? "",
                        email: (user as { email?: string }).email ?? "",
                        workspaceId: "(not set)",
                        availableWorkspaces: statusState.availableWorkspaces,
                        hint: "Set CLOCKIFY_WORKSPACE_ID (or pass --workspace, or add workspaceId to ~/.clockifyrc.json) to one of the ids above.",
                    },
                    output,
                );
                return;
            }
            printObject(
                {
                    workspaceId: statusState.workspaceId,
                    userId: entityId(user) ?? "",
                    email: (user as { email?: string }).email ?? "",
                    name: (user as { name?: string }).name ?? "",
                    runningEntry:
                        statusState.kind === "timer_running"
                            ? {
                                  id: entityId(statusState.entry),
                                  description:
                                      (statusState.entry as { description?: string }).description ??
                                      "",
                                  projectId:
                                      (statusState.entry as { projectId?: string | null })
                                          .projectId ?? "",
                                  startedAt: extractStart(statusState.entry),
                                  elapsed: formatRunningElapsed(statusState.entry),
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

function humanizeSeconds(total: number): string {
    if (total <= 0) return "0s";
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const parts: string[] = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds) parts.push(`${seconds}s`);
    return parts.length > 0 ? parts.join("") : "0s";
}

function formatRunningElapsed(entry: unknown): string {
    const iso = extractIsoDuration(entry);
    if (iso) return formatIsoDuration(iso);
    const startMs = Date.parse(extractStart(entry));
    if (!Number.isFinite(startMs)) return "0s";
    return humanizeSeconds(Math.max(0, Math.round((Date.now() - startMs) / 1000)));
}
