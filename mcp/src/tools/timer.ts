import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerTimerTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_timer_start",
        {
            title: "Start a timer",
            description: "Start a running time entry for the current user. Description and IDs are optional.",
            inputSchema: {
                description: z.string().optional(),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                tagIds: z.array(z.string()).optional(),
                billable: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    start: new Date().toISOString(),
                };
                if (args.description) body.description = args.description;
                if (args.projectId) body.projectId = args.projectId;
                if (args.taskId) body.taskId = args.taskId;
                if (args.tagIds && args.tagIds.length > 0) body.tagIds = args.tagIds;
                if (args.billable !== undefined) body.billable = args.billable;
                const entry = await ctx.client.timeEntries.create(body as never);
                return successResult("clockify_timer_start", entry);
            } catch (err) {
                return errorResult("clockify_timer_start", err);
            }
        },
    );

    server.registerTool(
        "clockify_timer_stop",
        {
            title: "Stop the running timer",
            description: "Stop the running timer for the current user. Returns ok with a note if no timer was running.",
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async () => {
            try {
                const user = await ctx.client.users.getCurrentUser();
                const userId = (user as { id?: string }).id;
                if (!userId) {
                    return errorResult(
                        "clockify_timer_stop",
                        new Error("could not determine user ID from getCurrentUser response"),
                    );
                }
                const end = new Date().toISOString();
                try {
                    const entry = await ctx.client.timeEntries.stopTimer({
                        workspaceId: ctx.workspaceId,
                        userId,
                        end,
                    });
                    return successResult("clockify_timer_stop", entry);
                } catch (innerErr) {
                    if ((innerErr as { statusCode?: number }).statusCode === 404) {
                        return successResult("clockify_timer_stop", { running: false, note: "no timer was running" });
                    }
                    throw innerErr;
                }
            } catch (err) {
                return errorResult("clockify_timer_stop", err);
            }
        },
    );
}
