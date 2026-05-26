import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerClientsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_clients_list",
        {
            title: "List clients",
            description: "List clients in the pinned workspace, paginated via page and pageSize.",
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
                const clients = (await ctx.client.clients.list(req as never)) as unknown[];
                return successResult("clockify_clients_list", clients, {
                    workspaceId: ctx.workspaceId,
                    count: clients.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: clients.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult("clockify_clients_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_clients_create",
        {
            title: "Create a client",
            description: "Create a client in the pinned workspace.",
            inputSchema: {
                name: z.string().min(1),
                note: z.string().optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { workspaceId: ctx.workspaceId, name: args.name };
                if (args.note) body.note = args.note;
                const client = await ctx.client.clients.create(body as never);
                return successResult("clockify_clients_create", client);
            } catch (err) {
                return errorResult("clockify_clients_create", err);
            }
        },
    );
}
