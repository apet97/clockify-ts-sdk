/**
 * User group admin: CRUDL + membership management.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, errorResult, successResult, writeReceipt } from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";

export function registerGroupsTools(server: McpServer, ctx: Context): void {
    const listUsers = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.users.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            "include-roles": false,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };
    const meUserId = async (): Promise<string> =>
        String(((await ctx.client.users.getCurrentUser()) as { id?: string }).id ?? "");
    defineTool(
        server,
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
        },
    );

    defineTool(
        server,
        "clockify_groups_get",
        {
            title: "Get a user group",
            description: "Fetch one user group by ID from the pinned Clockify workspace.",
            inputSchema: { groupId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            // The generated userGroups.get is typed `void` — Clockify has no
            // single-GET route that returns the group — so read it from the
            // list and scan by id (the same shape the addon found live).
            const groups = (await ctx.client.userGroups.list({
                workspaceId: ctx.workspaceId,
                page: 1,
                "page-size": 200,
            })) as Array<{ id?: string }>;
            const group = groups.find((g) => String(g.id ?? "") === args.groupId);
            if (!group) {
                return errorResult("clockify_groups_get", new Error(`no user group with id ${JSON.stringify(args.groupId)} in this workspace`));
            }
            return successResult("clockify_groups_get", group, {
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
            });
        },
    );

    defineTool(
        server,
        "clockify_groups_create",
        {
            title: "Create a user group",
            description: "Create a new user group in the workspace.",
            inputSchema: { name: z.string().min(1) },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const created = await ctx.client.userGroups.create({
                workspaceId: ctx.workspaceId,
                body: { name: args.name },
            });
            return successResult("clockify_groups_create", created, {
                workspaceId: ctx.workspaceId,
            }, writeReceipt("created", "group", { id: (created as { id?: string }).id, name: args.name }));
        },
    );

    defineTool(
        server,
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
            const updated = await ctx.client.userGroups.update({
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
                body: { name: args.name },
            });
            return successResult("clockify_groups_update", updated, {
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
            }, writeReceipt("updated", "group", args.groupId));
        },
    );

    defineTool(
        server,
        "clockify_groups_delete",
        {
            title: "Delete a user group",
            description:
                "Permanently delete one user group by ID from the workspace. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                groupId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "group", id: args.groupId };
            const confirmation = requireConfirmation(ctx, "clockify_groups_delete", "group_delete", args, preview);
            if (confirmation) return confirmation;
            await ctx.client.userGroups.delete({
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
            });
            return successResult(
                "clockify_groups_delete",
                { deleted: true, groupId: args.groupId },
                { workspaceId: ctx.workspaceId, groupId: args.groupId },
                writeReceipt("deleted", "group", args.groupId),
            );
        },
    );

    defineTool(
        server,
        "clockify_groups_list_members",
        {
            title: "List members of a user group",
            description: "List all users who belong to one Clockify user group.",
            inputSchema: { groupId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const members = await ctx.client.userGroups.listMembers({
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
            });
            return successResult("clockify_groups_list_members", members, {
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
            });
        },
    );

    defineTool(
        server,
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
            const u = await resolveUserRef(
                { id: args.userId },
                { verb: "add to the group", meUserId: await meUserId(), listUsers, trustIds: false },
            );
            if (!u.ok) return clarifyResult("clockify_groups_add_member", "userId", "user", u.clarify);
            const result = await ctx.client.userGroups.addMembers({
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
                userId: u.userId,
            });
            return successResult("clockify_groups_add_member", result, {
                workspaceId: ctx.workspaceId,
                groupId: args.groupId,
                userId: u.userId,
            }, writeReceipt("updated", "group_member", { id: u.userId }));
        },
    );

    defineTool(
        server,
        "clockify_groups_remove_member",
        {
            title: "Remove a user from a group",
            description:
                "Remove one user from one user group in the pinned workspace. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                groupId: z.string().min(1),
                userId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = {
                action: "remove",
                entity: "group_member",
                groupId: args.groupId,
                userId: args.userId,
            };
            const confirmation = requireConfirmation(ctx, "clockify_groups_remove_member", "group_member_remove", args, preview);
            if (confirmation) return confirmation;
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
                writeReceipt("deleted", "group_member", args.userId),
            );
        },
    );
}
