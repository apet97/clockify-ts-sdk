import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerTasksTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_tasks_list",
        {
            title: "List tasks",
            description: "List tasks for a project in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                projectId: z.string().min(1),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.name) req.name = args.name;
                const tasks = (await ctx.client.tasks.list(req as never)) as unknown[];
                return successResult("clockify_tasks_list", tasks, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    count: tasks.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: tasks.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult("clockify_tasks_list", err, "Verify the projectId exists in this workspace.");
            }
        },
    );
}
