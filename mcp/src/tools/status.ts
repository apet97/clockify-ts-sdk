import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerStatusTool(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_status",
        {
            title: "Clockify status",
            description: "Return the pinned workspace ID, the current user, and any running timer for that user.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            try {
                const user = await ctx.client.users.getCurrentUser();
                const inProgress = await ctx.client.timeEntries.listInProgress({ workspaceId: ctx.workspaceId });
                const entries = Array.isArray(inProgress)
                    ? inProgress
                    : ((inProgress as { timeEntries?: unknown[] }).timeEntries ?? []);
                const userId = (user as { id?: string }).id ?? "";
                const running =
                    entries.find((entry) => (entry as { userId?: string }).userId === userId) ?? null;
                return successResult(
                    "clockify_status",
                    {
                        workspaceId: ctx.workspaceId,
                        user: {
                            id: userId,
                            email: (user as { email?: string }).email ?? "",
                            name: (user as { name?: string }).name ?? "",
                        },
                        runningEntry: running,
                    },
                    undefined,
                    {
                        entity: "workspace",
                        ids: { workspaceId: ctx.workspaceId, userId },
                        next: [
                            {
                                tool: "clockify_create_work_package",
                                reason: "Create or reuse project/task/tag objects before logging work.",
                            },
                            {
                                tool: running ? "clockify_stop_work" : "clockify_start_work",
                                reason: running ? "Stop the currently running timer." : "Start a timer for current work.",
                            },
                        ],
                    },
                );
            } catch (err) {
                return errorResult(
                    "clockify_status",
                    err,
                    "Verify CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID are set and valid.",
                );
            }
        },
    );
}
