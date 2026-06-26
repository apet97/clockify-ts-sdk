import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "../client.js";
import { failureHint } from "../diagnose.js";
import type { ClockifyErrorCode } from "../error-codes.js";
import { defineTool, entityId, successResult, type RecoveryHint } from "../result.js";

/**
 * Recovery resolver for clockify_status. Reuses the shared failure-class hint
 * (failureHint) and, on the two first-timer friction classes — no credentials
 * yet (`setup_required`) or a present-but-invalid key (`auth_or_permission`) —
 * points the user at the clockify-getting-started prompt. Other classes (rate
 * limit, network, upstream) keep the unembellished failure-class hint.
 */
function statusRecovery(err: unknown, code: ClockifyErrorCode): RecoveryHint {
    const base = failureHint(err, code);
    if (code === "setup_required" || code === "auth_or_permission") {
        return { ...base, hint: `${base.hint} For first-time setup, get the clockify-getting-started prompt.` };
    }
    return base;
}

export function registerStatusTool(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_status",
        {
            title: "Clockify status",
            description: "Return the pinned workspace ID, the current user, and any running timer for that user.",
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const user = await ctx.client.users.getCurrentUser();
            const inProgress = await ctx.client.timeEntries.listInProgress({ workspaceId: ctx.workspaceId });
            const entries = Array.isArray(inProgress)
                ? inProgress
                : ((inProgress as { timeEntries?: unknown[] }).timeEntries ?? []);
            const userId = entityId(user) ?? "";
            const running = entries.find((entry) => (entry as { userId?: string }).userId === userId) ?? null;
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
        },
        statusRecovery,
    );
}
