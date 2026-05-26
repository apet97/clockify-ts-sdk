import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerProjectsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_projects_list",
        {
            title: "List projects",
            description: "List projects in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
                clientId: z.string().optional(),
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
                if (args.clientId) req.clients = [args.clientId];
                const projects = (await ctx.client.projects.list(req as never)) as unknown[];
                return successResult("clockify_projects_list", projects, {
                    workspaceId: ctx.workspaceId,
                    count: projects.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: projects.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult(
                    "clockify_projects_list",
                    err,
                    "Lower pageSize or narrow filters; verify the workspace ID.",
                );
            }
        },
    );

    server.registerTool(
        "clockify_projects_create",
        {
            title: "Create a project",
            description: "Create a project in the pinned workspace.",
            inputSchema: {
                name: z.string().min(1),
                clientId: z.string().optional(),
                color: z.string().optional(),
                billable: z.boolean().optional(),
                isPublic: z.boolean().optional(),
            },
            annotations: { destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { workspaceId: ctx.workspaceId, name: args.name };
                if (args.clientId) body.clientId = args.clientId;
                if (args.color) body.color = args.color;
                if (args.billable !== undefined) body.billable = args.billable;
                if (args.isPublic !== undefined) body.isPublic = args.isPublic;
                const project = await ctx.client.projects.create(body as never);
                return successResult("clockify_projects_create", project);
            } catch (err) {
                return errorResult(
                    "clockify_projects_create",
                    err,
                    "Reuse an existing client ID or check for an existing project with this name.",
                );
            }
        },
    );
}
