/**
 * User group admin: CRUDL + membership management.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerGroupsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_groups_list",
        {
            title: "List user groups",
            description: "List user groups in the workspace, optionally scoped to one project.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                projectId: z.string().optional(),
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
                if (args.projectId) req["project-id"] = args.projectId;
                const items = (await ctx.client.userGroups.list(req as never)) as unknown[];
                return successResult("clockify_groups_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_groups_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_get",
        {
            title: "Get a user group",
            description: "Fetch one user group by ID from the pinned Clockify workspace.",
            inputSchema: { groupId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const group = await ctx.client.userGroups.get({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
                return successResult("clockify_groups_get", group, {
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
            } catch (err) {
                return errorResult("clockify_groups_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_create",
        {
            title: "Create a user group",
            description: "Create a new user group in the workspace.",
            inputSchema: { name: z.string().min(1) },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const created = await ctx.client.userGroups.create({
                    workspaceId: ctx.workspaceId,
                    body: { name: args.name },
                });
                return successResult("clockify_groups_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_groups_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_update",
        {
            title: "Update a user group",
            description: "Update one user group's display name in the pinned workspace.",
            inputSchema: {
                groupId: z.string().min(1),
                name: z.string().min(1),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const updated = await ctx.client.userGroups.update({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                    body: { name: args.name },
                });
                return successResult("clockify_groups_update", updated, {
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
            } catch (err) {
                return errorResult("clockify_groups_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_delete",
        {
            title: "Delete a user group",
            description: "Permanently delete one user group by ID from the workspace.",
            inputSchema: { groupId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.userGroups.delete({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
                return successResult(
                    "clockify_groups_delete",
                    { deleted: true, groupId: args.groupId },
                    { workspaceId: ctx.workspaceId, groupId: args.groupId },
                );
            } catch (err) {
                return errorResult("clockify_groups_delete", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_list_members",
        {
            title: "List members of a user group",
            description: "List all users who belong to one Clockify user group.",
            inputSchema: { groupId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const members = await ctx.client.userGroups.listMembers({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
                return successResult("clockify_groups_list_members", members, {
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                });
            } catch (err) {
                return errorResult("clockify_groups_list_members", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_add_member",
        {
            title: "Add a user to a group",
            description: "Add one user to one user group in the pinned workspace.",
            inputSchema: {
                groupId: z.string().min(1),
                userId: z.string().min(1),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const result = await ctx.client.userGroups.addMembers({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                    userId: args.userId,
                });
                return successResult("clockify_groups_add_member", result, {
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                    userId: args.userId,
                });
            } catch (err) {
                return errorResult("clockify_groups_add_member", err);
            }
        },
    );

    server.registerTool(
        "clockify_groups_remove_member",
        {
            title: "Remove a user from a group",
            description: "Remove one user from one user group in the pinned workspace.",
            inputSchema: {
                groupId: z.string().min(1),
                userId: z.string().min(1),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.userGroups.removeMember({
                    workspaceId: ctx.workspaceId,
                    groupId: args.groupId,
                    userId: args.userId,
                });
                return successResult(
                    "clockify_groups_remove_member",
                    { removed: true, groupId: args.groupId, userId: args.userId },
                    {
                        workspaceId: ctx.workspaceId,
                        groupId: args.groupId,
                        userId: args.userId,
                    },
                );
            } catch (err) {
                return errorResult("clockify_groups_remove_member", err);
            }
        },
    );
}
