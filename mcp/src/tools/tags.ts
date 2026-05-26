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
            description: "Create a tag in the pinned workspace.",
            inputSchema: { name: z.string().min(1) },
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
}
