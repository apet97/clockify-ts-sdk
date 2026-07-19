/**
 * Workspace holidays. The Clockify create/update payload is rich
 * (assignees, automatic time entries, recurrence). The MCP exposes
 * the most common knobs; fields outside that curated set are
 * intentionally not surfaced (the curated server has no raw-API escape
 * hatch by design — see `clockify_operation_guide`).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveGroupRefs, resolveUserFilter, resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zStringList } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { canonicalJson } from "../orchestration/confirmation.js";
import {
    defineGuardedTool,
    defineTool,
    entityId,
    errorResult,
    successResult,
    writeReceipt,
} from "../result.js";
import { scopeFilter } from "../scope-filter.js";

import { clarifyResult } from "./resolve-clarify.js";
import { userRefHelpers } from "./user-refs.js";

function requiredHolidayString(value: unknown, field: string, holidayId: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`Holiday ${holidayId} required ${field} is missing or invalid.`);
    }
    return value;
}

function holidayIds(value: unknown, field: string, holidayId: string): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new TypeError(`Holiday ${holidayId} ${field} is invalid.`);
    }
    return [...value];
}

export function registerHolidaysTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);
    const listGroups = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.userGroups.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };
    defineTool(
        server,
        "clockify_holidays_list",
        {
            title: "List workspace holidays",
            description: "List all holidays defined in the workspace.",
            inputSchema: {},
        },
        async () => {
            const items = (await ctx.client.holidays.list({
                workspaceId: ctx.workspaceId,
            })) as unknown[];
            return successResult("clockify_holidays_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_holidays_list_in_period",
        {
            title: "List holidays in a period for a user",
            description: "List holidays applying to a user within a date range.",
            inputSchema: {
                userId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
            },
        },
        async (args) => {
            const filter = await resolveUserFilter(args.userId, {
                verb: "list holidays for",
                meUserId: await meUserId(),
                listUsers,
            });
            if (!filter.ok)
                return clarifyResult(
                    "clockify_holidays_list_in_period",
                    "userId",
                    "user",
                    filter.clarify,
                );
            const assignedTo = filter.userId ?? args.userId;
            const items = (await ctx.client.holidays.listInPeriod({
                workspaceId: ctx.workspaceId,
                "assigned-to": assignedTo,
                start: args.start,
                end: args.end,
            })) as unknown[];
            return successResult("clockify_holidays_list_in_period", items, {
                workspaceId: ctx.workspaceId,
                userId: assignedTo,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_holidays_create",
        {
            title: "Create a holiday",
            description:
                "Create a workspace holiday with date range, color, and assignment options.",
            inputSchema: {
                name: z.string().min(1),
                startDate: z.string().min(1).describe("YYYY-MM-DD."),
                endDate: z.string().min(1).describe("YYYY-MM-DD."),
                occursAnnually: z.boolean().optional(),
                everyoneIncludingNew: z.boolean().optional(),
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Assign to these users (sent as a CONTAINS filter)."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Assign to these user groups (sent as a CONTAINS filter)."),
                color: z.string().optional(),
            },
        },
        {
            preview: async (args) => {
                let resolvedUserIds = args.userIds;
                let resolvedGroupIds = args.userGroupIds;
                if (args.userIds?.length) {
                    const r = await resolveUserRefs(args.userIds, {
                        verb: "assign the holiday to",
                        meUserId: await meUserId(),
                        listUsers,
                        verifyIds: true,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_holidays_create",
                            "userIds",
                            "user",
                            r.clarify,
                        );
                    resolvedUserIds = r.userIds;
                }
                if (args.userGroupIds?.length) {
                    const r = await resolveGroupRefs(args.userGroupIds, {
                        verb: "assign the holiday to",
                        listGroups,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_holidays_create",
                            "userGroupIds",
                            "group",
                            r.clarify,
                        );
                    resolvedGroupIds = r.groupIds;
                }
                const body: ClockifyRequestBody<ClockifyApi.CreateHolidayRequest> = {
                    name: args.name,
                    datePeriod: { startDate: args.startDate, endDate: args.endDate },
                };
                if (args.occursAnnually !== undefined) body.occursAnnually = args.occursAnnually;
                if (args.everyoneIncludingNew !== undefined)
                    body.everyoneIncludingNew = args.everyoneIncludingNew;
                if (resolvedUserIds?.length) body.users = scopeFilter(resolvedUserIds);
                if (resolvedGroupIds?.length) body.userGroups = scopeFilter(resolvedGroupIds);
                if (args.color) body.color = args.color;
                const request: ClockifyApi.CreateHolidayRequest = {
                    workspaceId: ctx.workspaceId,
                    ...body,
                };
                return { action: "create", entity: "holiday", name: args.name, request };
            },
            execute: async (preview) => {
                const created = await ctx.client.holidays.create(preview.request);
                return successResult(
                    "clockify_holidays_create",
                    created,
                    {
                        workspaceId: ctx.workspaceId,
                    },
                    writeReceipt("created", "holiday", {
                        id: entityId(created),
                        name: preview.name,
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
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
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the assignment with these users."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the assignment with these user groups."),
                color: z.string().optional(),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                // Resolve the EXPLICIT replacement assignment (a name in an id slot)
                // before reconstructing scope. The carried-forward existing ids are
                // already real and are NOT re-resolved.
                let resolvedUserIds = args.userIds;
                let resolvedGroupIds = args.userGroupIds;
                if (args.userIds?.length) {
                    const r = await resolveUserRefs(args.userIds, {
                        verb: "assign the holiday to",
                        meUserId: await meUserId(),
                        listUsers,
                        verifyIds: true,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_holidays_update",
                            "userIds",
                            "user",
                            r.clarify,
                        );
                    resolvedUserIds = r.userIds;
                }
                if (args.userGroupIds?.length) {
                    const r = await resolveGroupRefs(args.userGroupIds, {
                        verb: "assign the holiday to",
                        listGroups,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_holidays_update",
                            "userGroupIds",
                            "group",
                            r.clarify,
                        );
                    resolvedGroupIds = r.groupIds;
                }
                // PUT /holidays/{id} REPLACES the document (omitted fields 400 "must
                // not be null"), and there is no single-GET route — list then scan.
                // The read-back exposes the assignment FLAT (userIds/userGroupIds);
                // re-send it in the {contains,ids,status} filter form or the PUT
                // drops the (required) assignment.
                const all = (await ctx.client.holidays.list({
                    workspaceId: ctx.workspaceId,
                })) as Array<Record<string, unknown>>;
                const existing = (Array.isArray(all) ? all : []).find(
                    (holiday) => holiday.id === args.holidayId,
                );
                if (!existing) {
                    throw new TypeError(`Holiday ${args.holidayId} was not found.`);
                }
                if (
                    existing.datePeriod == null ||
                    typeof existing.datePeriod !== "object" ||
                    Array.isArray(existing.datePeriod)
                ) {
                    throw new TypeError(
                        `Holiday ${args.holidayId} required datePeriod is missing or invalid.`,
                    );
                }
                const existingPeriod = existing.datePeriod as Record<string, unknown>;
                const name = requiredHolidayString(
                    args.name ?? existing.name,
                    "name",
                    args.holidayId,
                );
                const startDate = requiredHolidayString(
                    args.startDate ?? existingPeriod.startDate,
                    "startDate",
                    args.holidayId,
                );
                const endDate = requiredHolidayString(
                    args.endDate ?? existingPeriod.endDate,
                    "endDate",
                    args.holidayId,
                );
                const currentBody: Record<string, unknown> = {
                    name: existing.name,
                    datePeriod: {
                        startDate: existingPeriod.startDate,
                        endDate: existingPeriod.endDate,
                    },
                };
                const existingOccursAnnually = existing.occursAnnually ?? false;
                if (typeof existingOccursAnnually !== "boolean") {
                    throw new TypeError(`Holiday ${args.holidayId} occursAnnually is invalid.`);
                }
                const body: ClockifyRequestBody<ClockifyApi.UpdateHolidaysRequest> = {
                    name,
                    datePeriod: { startDate, endDate },
                    occursAnnually: args.occursAnnually ?? existingOccursAnnually,
                };
                if (existing.occursAnnually !== undefined) {
                    currentBody.occursAnnually = existing.occursAnnually;
                }
                const color = args.color ?? existing.color;
                if (color !== undefined) {
                    if (typeof color !== "string") {
                        throw new TypeError(`Holiday ${args.holidayId} color is invalid.`);
                    }
                    body.color = color;
                }
                if (existing.color !== undefined) currentBody.color = existing.color;
                // Scope reconstruction: flat userIds/userGroupIds -> CONTAINS filter.
                const existingUserIds = holidayIds(existing.userIds, "userIds", args.holidayId);
                const existingGroupIds = holidayIds(
                    existing.userGroupIds,
                    "userGroupIds",
                    args.holidayId,
                );
                if (existingUserIds.length) currentBody.users = scopeFilter(existingUserIds);
                if (existingGroupIds.length) currentBody.userGroups = scopeFilter(existingGroupIds);
                if (args.userIds !== undefined) {
                    if (resolvedUserIds?.length) body.users = scopeFilter(resolvedUserIds);
                } else if (existingUserIds.length) body.users = scopeFilter(existingUserIds);
                if (args.userGroupIds !== undefined) {
                    if (resolvedGroupIds?.length) body.userGroups = scopeFilter(resolvedGroupIds);
                } else if (existingGroupIds.length) body.userGroups = scopeFilter(existingGroupIds);
                if (existing.everyoneIncludingNew !== undefined) {
                    if (typeof existing.everyoneIncludingNew !== "boolean") {
                        throw new TypeError(
                            `Holiday ${args.holidayId} everyoneIncludingNew is invalid.`,
                        );
                    }
                    body.everyoneIncludingNew = existing.everyoneIncludingNew;
                    currentBody.everyoneIncludingNew = existing.everyoneIncludingNew;
                }
                if (!body.users && !body.userGroups && body.everyoneIncludingNew !== true) {
                    return errorResult(
                        "clockify_holidays_update",
                        new Error(
                            `Holiday ${args.holidayId} has no resolvable user/group assignment to preserve; pass userIds or userGroupIds.`,
                        ),
                    );
                }
                if (canonicalJson(currentBody) === canonicalJson(body)) {
                    throw new TypeError(
                        "Holiday update is a no-op; supplied fields match current state.",
                    );
                }
                const request: ClockifyApi.UpdateHolidaysRequest = {
                    workspaceId: ctx.workspaceId,
                    holidayId: args.holidayId,
                    ...body,
                };
                return { action: "update", entity: "holiday", id: args.holidayId, request };
            },
            execute: async (preview) => {
                const updated = await ctx.client.holidays.update(preview.request);
                return successResult(
                    "clockify_holidays_update",
                    updated,
                    {
                        workspaceId: ctx.workspaceId,
                        holidayId: preview.id,
                    },
                    writeReceipt("updated", "holiday", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_holidays_delete",
        {
            title: "Delete a holiday",
            description:
                "Permanently delete one workspace holiday by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: { holidayId: z.string().min(1) },
        },
        {
            preview: async (args) => ({
                action: "delete",
                entity: "holiday",
                id: args.holidayId,
                request: { workspaceId: ctx.workspaceId, holidayId: args.holidayId },
            }),
            execute: async (preview) => {
                await ctx.client.holidays.delete(preview.request);
                return successResult(
                    "clockify_holidays_delete",
                    { deleted: true, holidayId: preview.id },
                    { workspaceId: ctx.workspaceId, holidayId: preview.id },
                    writeReceipt("deleted", "holiday", preview.id),
                );
            },
        },
    );
}
