/**
 * Workspace holidays. The Clockify create/update payload is rich
 * (assignees, automatic time entries, recurrence). The MCP exposes
 * the most common knobs and lets advanced callers fall back to
 * clockify_api_request when that lands.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { errorResult, successResult } from "../result.js";
import { scopeFilter } from "../scope-filter.js";

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
                userIds: z.array(z.string()).optional().describe("Assign to these users (sent as a CONTAINS filter)."),
                userGroupIds: z.array(z.string()).optional().describe("Assign to these user groups (sent as a CONTAINS filter)."),
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
                if (args.userIds?.length) body.users = scopeFilter(args.userIds);
                if (args.userGroupIds?.length) body.userGroups = scopeFilter(args.userGroupIds);
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
            description:
                "Update one workspace holiday by ID. Reads the holiday then replaces it (PUT semantics), preserving untouched fields and the user/group assignment.",
            inputSchema: {
                holidayId: z.string().min(1),
                name: z.string().optional(),
                startDate: z.string().optional(),
                endDate: z.string().optional(),
                occursAnnually: z.boolean().optional(),
                userIds: z.array(z.string()).optional().describe("Replace the assignment with these users."),
                userGroupIds: z.array(z.string()).optional().describe("Replace the assignment with these user groups."),
                color: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                // PUT /holidays/{id} REPLACES the document (omitted fields 400 "must
                // not be null"), and there is no single-GET route — list then scan.
                // The read-back exposes the assignment FLAT (userIds/userGroupIds);
                // re-send it in the {contains,ids,status} filter form or the PUT
                // drops the (required) assignment.
                const all = (await ctx.client.holidays.list({ workspaceId: ctx.workspaceId })) as Array<
                    Record<string, unknown>
                >;
                const existing =
                    (Array.isArray(all) ? all : []).find((h) => h.id === args.holidayId) ?? {};
                const existingPeriod = (existing.datePeriod ?? {}) as Record<string, unknown>;
                const body: Record<string, unknown> = {
                    name: args.name ?? existing.name,
                    datePeriod: {
                        startDate: args.startDate ?? existingPeriod.startDate,
                        endDate: args.endDate ?? args.startDate ?? existingPeriod.endDate,
                    },
                };
                const occursAnnually = args.occursAnnually ?? existing.occursAnnually;
                if (occursAnnually !== undefined) body.occursAnnually = occursAnnually;
                const color = args.color ?? existing.color;
                if (color !== undefined) body.color = color;
                // Scope reconstruction: flat userIds/userGroupIds -> CONTAINS filter.
                const existingUserIds = Array.isArray(existing.userIds) ? (existing.userIds as string[]) : [];
                const existingGroupIds = Array.isArray(existing.userGroupIds)
                    ? (existing.userGroupIds as string[])
                    : [];
                if (args.userIds?.length) body.users = scopeFilter(args.userIds);
                else if (existingUserIds.length) body.users = scopeFilter(existingUserIds);
                if (args.userGroupIds?.length) body.userGroups = scopeFilter(args.userGroupIds);
                else if (existingGroupIds.length) body.userGroups = scopeFilter(existingGroupIds);
                if (existing.everyoneIncludingNew !== undefined)
                    body.everyoneIncludingNew = existing.everyoneIncludingNew;
                if (!body.users && !body.userGroups && body.everyoneIncludingNew !== true) {
                    return errorResult(
                        "clockify_holidays_update",
                        new Error(
                            `Holiday ${args.holidayId} has no resolvable user/group assignment to preserve; pass userIds or userGroupIds.`,
                        ),
                    );
                }
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
            description:
                "Permanently delete one workspace holiday by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                holidayId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                const preview = { action: "delete", entity: "holiday", id: args.holidayId };
                const confirmation = requireConfirmation(ctx, "clockify_holidays_delete", "holiday_delete", args, preview);
                if (confirmation) return confirmation;
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
