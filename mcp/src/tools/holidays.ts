/**
 * Workspace holidays. The Clockify create/update payload is rich
 * (assignees, automatic time entries, recurrence). The MCP exposes
 * the most common knobs and lets advanced callers fall back to
 * clockify_api_request when that lands.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerHolidaysTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_holidays_list",
        {
            title: "List workspace holidays",
            description: "List all holidays defined in the workspace.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            try {
                const items = (await ctx.client.holidays.list({
                    workspaceId: ctx.workspaceId,
                })) as unknown[];
                return successResult("clockify_holidays_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_holidays_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_holidays_list_in_period",
        {
            title: "List holidays in a period for a user",
            description: "List holidays applying to a user within a date range.",
            inputSchema: {
                userId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.holidays.listInPeriod({
                    workspaceId: ctx.workspaceId,
                    "assigned-to": args.userId,
                    start: args.start,
                    end: args.end,
                })) as unknown[];
                return successResult("clockify_holidays_list_in_period", items, {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                });
            } catch (err) {
                return errorResult("clockify_holidays_list_in_period", err);
            }
        },
    );

    server.registerTool(
        "clockify_holidays_create",
        {
            title: "Create a holiday",
            description: "Create a workspace holiday with date range, color, and assignment options.",
            inputSchema: {
                name: z.string().min(1),
                startDate: z.string().min(1).describe("YYYY-MM-DD."),
                endDate: z.string().min(1).describe("YYYY-MM-DD."),
                occursAnnually: z.boolean().optional(),
                everyoneIncludingNew: z.boolean().optional(),
                color: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    name: args.name,
                    datePeriod: { startDate: args.startDate, endDate: args.endDate },
                };
                if (args.occursAnnually !== undefined) body.occursAnnually = args.occursAnnually;
                if (args.everyoneIncludingNew !== undefined)
                    body.everyoneIncludingNew = args.everyoneIncludingNew;
                if (args.color) body.color = args.color;
                const created = await ctx.client.holidays.create({
                    workspaceId: ctx.workspaceId,
                    ...body,
                } as never);
                return successResult("clockify_holidays_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_holidays_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_holidays_update",
        {
            title: "Update a holiday",
            description: "Update one workspace holiday's name, dates, annual recurrence, or color by ID.",
            inputSchema: {
                holidayId: z.string().min(1),
                name: z.string().optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional(),
                occursAnnually: z.boolean().optional(),
                color: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.startDate && args.endDate) {
                    body.datePeriod = { startDate: args.startDate, endDate: args.endDate };
                }
                if (args.occursAnnually !== undefined) body.occursAnnually = args.occursAnnually;
                if (args.color) body.color = args.color;
                const updated = await ctx.client.holidays.update({
                    workspaceId: ctx.workspaceId,
                    holidayId: args.holidayId,
                    ...body,
                } as never);
                return successResult("clockify_holidays_update", updated, {
                    workspaceId: ctx.workspaceId,
                    holidayId: args.holidayId,
                });
            } catch (err) {
                return errorResult("clockify_holidays_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_holidays_delete",
        {
            title: "Delete a holiday",
            description: "Permanently delete one workspace holiday by ID.",
            inputSchema: { holidayId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.holidays.delete({
                    workspaceId: ctx.workspaceId,
                    holidayId: args.holidayId,
                });
                return successResult(
                    "clockify_holidays_delete",
                    { deleted: true, holidayId: args.holidayId },
                    { workspaceId: ctx.workspaceId, holidayId: args.holidayId },
                );
            } catch (err) {
                return errorResult("clockify_holidays_delete", err);
            }
        },
    );
}
