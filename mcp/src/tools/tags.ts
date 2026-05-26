import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerTagsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_tags_list",
        {
            title: "List tags",
            description: "List tags in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.name) req.name = args.name;
                if (args.archived !== undefined) req.archived = args.archived;
                const tags = (await ctx.client.tags.list(req as never)) as unknown[];
                return successResult("clockify_tags_list", tags, {
                    workspaceId: ctx.workspaceId,
                    count: tags.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: tags.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult("clockify_tags_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_tags_create",
        {
            title: "Create a tag",
            description: "Create a tag in the pinned workspace for later time-entry classification.",
            inputSchema: { name: z.string().min(1) },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const tag = await ctx.client.tags.create({ workspaceId: ctx.workspaceId, name: args.name });
                return successResult("clockify_tags_create", tag);
            } catch (err) {
                return errorResult("clockify_tags_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_tags_get",
        {
            title: "Get a tag",
            description: "Fetch one tag by ID from the pinned Clockify workspace.",
            inputSchema: { tagId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const tag = await ctx.client.tags.get({
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                });
                return successResult("clockify_tags_get", tag, {
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                });
            } catch (err) {
                return errorResult("clockify_tags_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_tags_update",
        {
            title: "Update a tag",
            description: "Update a tag's name or archived state in the pinned workspace.",
            inputSchema: {
                tagId: z.string().min(1),
                name: z.string().optional(),
                archived: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                };
                if (args.name) body.name = args.name;
                if (args.archived !== undefined) body.archived = args.archived;
                const updated = await ctx.client.tags.update(body as never);
                return successResult("clockify_tags_update", updated, {
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                });
            } catch (err) {
                return errorResult("clockify_tags_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_tags_delete",
        {
            title: "Delete a tag",
            description: "Permanently delete one tag by ID from the pinned workspace.",
            inputSchema: { tagId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.tags.delete({
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                });
                return successResult(
                    "clockify_tags_delete",
                    { deleted: true, tagId: args.tagId },
                    { workspaceId: ctx.workspaceId, tagId: args.tagId },
                );
            } catch (err) {
                return errorResult("clockify_tags_delete", err);
            }
        },
    );
}
