import type { McpServer } from "@modelcontextprotocol/server";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zStringList } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineTool, successResult } from "../result.js";

const ENTITY_CHANGE_TYPES = [
    "CLIENTS",
    "PROJECTS",
    "TAGS",
    "TASKS",
    "SCHEDULED_ASSIGNMENT",
    "TIME_ENTRY",
    "TIME_ENTRY_RATE",
    "TIME_ENTRY_CUSTOM_FIELD_VALUE",
] as const;

const EXPERIMENTAL_WARNING = {
    code: "experimental_api",
    message: "Entity-change endpoints are experimental; response shape and behavior may change.",
};

export function registerEntityChangesTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_entity_changes_list",
        {
            title: "List experimental entity changes",
            description:
                "Experimental API: choose the required created, updated, or deleted changeType to call one matching entity-change endpoint. Response shape and behavior may change. When start/end are omitted, Clockify applies its documented default 30-day/current date behavior.",
            inputSchema: {
                changeType: z.enum(["created", "updated", "deleted"]),
                types: zStringList(z.array(z.enum(ENTITY_CHANGE_TYPES)).min(1)),
                start: z.string().min(1).optional(),
                end: z.string().min(1).optional(),
                page: z.string().optional(),
                limit: z.string().optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const common = {
                workspaceId: ctx.workspaceId,
                type: args.types,
                ...(args.start !== undefined ? { start: args.start } : {}),
                ...(args.end !== undefined ? { end: args.end } : {}),
                ...(args.page !== undefined ? { page: args.page } : {}),
                ...(args.limit !== undefined ? { limit: args.limit } : {}),
            };
            // All three endpoints answer with a bare array (live-probed
            // 2026-08-08). The spec previously typed created/updated as
            // `string` and deleted as a paged wrapper, which is why this used
            // to branch on the response shape as well as the change type.
            let data: ClockifyApi.EntityChangeDocument[];
            switch (args.changeType) {
                case "created":
                    data = await ctx.client.entityChangesExperimental.listCreated(
                        common satisfies ClockifyApi.ListCreatedEntityChangesExperimentalRequest,
                    );
                    break;
                case "updated":
                    data = await ctx.client.entityChangesExperimental.listUpdated(
                        common satisfies ClockifyApi.ListUpdatedEntityChangesExperimentalRequest,
                    );
                    break;
                case "deleted":
                    data = await ctx.client.entityChangesExperimental.listDeleted(
                        common satisfies ClockifyApi.ListDeletedEntityChangesExperimentalRequest,
                    );
                    break;
                default:
                    throw new TypeError("unsupported changeType");
            }
            const count = data.length;
            return successResult(
                "clockify_entity_changes_list",
                data,
                {
                    workspaceId: ctx.workspaceId,
                    changeType: args.changeType,
                    types: args.types,
                    ...(args.page !== undefined ? { page: args.page } : {}),
                    ...(args.limit !== undefined ? { limit: args.limit } : {}),
                    count,
                },
                { warnings: [EXPERIMENTAL_WARNING] },
            );
        },
    );
}
