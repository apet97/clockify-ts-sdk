import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineTool, entityId, errorResult, successResult, writeReceipt } from "../result.js";

import { stopRunningTimer } from "./timer-stop.js";

export function registerTimerTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_timer_start",
        {
            title: "Start a timer",
            description:
                "Start a running time entry for the current user. Description and IDs are optional.",
            inputSchema: {
                description: z.string().optional(),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                tagIds: z.array(z.string()).optional(),
                billable: z.boolean().optional(),
            },
            idempotent: false,
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.CreateTimeEntryRequest> = {
                start: new Date().toISOString(),
            };
            if (args.description) body.description = args.description;
            if (args.projectId) body.projectId = args.projectId;
            if (args.taskId) body.taskId = args.taskId;
            if (Array.isArray(args.tagIds) && args.tagIds.length > 0) body.tagIds = args.tagIds;
            if (args.billable !== undefined) body.billable = args.billable;
            const req: ClockifyApi.CreateTimeEntryRequest = { workspaceId: ctx.workspaceId, body };
            const entry = await ctx.client.timeEntries.create(req);
            return successResult(
                "clockify_timer_start",
                entry,
                undefined,
                writeReceipt("created", "time_entry", { id: entityId(entry), name: args.description }),
            );
        },
    );

    defineTool(
        server,
        "clockify_timer_stop",
        {
            title: "Stop the running timer",
            description:
                "Stop the running timer for the current user. Returns ok with a note if no timer was running.",
            idempotent: true,
        },
        async () => {
            // Use the per-server single-flight memo (fetched at most once) when
            // present; fall back to a direct call for hand-built contexts.
            const userId = ctx.currentUserId
                ? await ctx.currentUserId()
                : (entityId(await ctx.client.users.getCurrentUser()) ?? "");
            if (!userId) {
                // early-return (not a throw) so the defineTool catch isn't involved
                return errorResult(
                    "clockify_timer_stop",
                    new Error("could not determine user ID from getCurrentUser response"),
                );
            }
            const outcome = await stopRunningTimer(ctx, userId, new Date().toISOString());
            if (!outcome.running) {
                return successResult("clockify_timer_stop", {
                    running: false,
                    note: "no timer was running",
                });
            }
            return successResult("clockify_timer_stop", outcome.entry);
        },
    );
}
