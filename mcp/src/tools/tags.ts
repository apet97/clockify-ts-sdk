import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";

export function registerTagsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
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
            const page = args.page ?? 1;
            const pageSize = args.pageSize ?? 50;
            const req: ClockifyApi.ListTagsRequest = {
                workspaceId: ctx.workspaceId,
                page,
                "page-size": pageSize,
            };
            if (args.name) req.name = args.name;
            if (args.archived !== undefined) req.archived = args.archived;
            const { items: tags, meta } = await pageWithMeta(ctx.client.tags.list(req), {
                workspaceId: ctx.workspaceId,
                page,
                pageSize,
            });
            return successResult("clockify_tags_list", tags, {
                ...meta,
            });
        },
    );

    defineTool(
        server,
        "clockify_tags_create",
        {
            title: "Create a tag",
            description:
                "Create a tag in the pinned workspace for later time-entry classification.",
            inputSchema: { name: z.string().min(1) },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const req: ClockifyApi.TagCreate = {
                workspaceId: ctx.workspaceId,
                body: { name: args.name },
            };
            const tag = await ctx.client.tags.create(req);
            return successResult(
                "clockify_tags_create",
                tag,
                undefined,
                writeReceipt("created", "tag", { id: entityId(tag), name: args.name }),
            );
        },
    );

    defineTool(
        server,
        "clockify_tags_get",
        {
            title: "Get a tag",
            description: "Fetch one tag by ID from the pinned Clockify workspace.",
            inputSchema: { tagId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const tag = await ctx.client.tags.get({
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
            });
            return successResult("clockify_tags_get", tag, {
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
            });
        },
    );

    defineTool(
        server,
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
            const body: ClockifyRequestBody<ClockifyApi.UpdateTagsRequest> = {};
            if (args.name) body.name = args.name;
            if (args.archived !== undefined) body.archived = args.archived;
            const req: ClockifyApi.UpdateTagsRequest = {
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
                body,
            };
            const updated = await ctx.client.tags.update(req);
            return successResult("clockify_tags_update", updated, {
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
            });
        },
    );

    defineTool(
        server,
        "clockify_tags_delete",
        {
            title: "Delete a tag",
            description:
                "Permanently delete one tag by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                tagId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "tag", id: args.tagId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_tags_delete",
                "tag_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.tags.delete({
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
            });
            return successResult(
                "clockify_tags_delete",
                { deleted: true, tagId: args.tagId },
                { workspaceId: ctx.workspaceId, tagId: args.tagId },
                writeReceipt("deleted", "tag", args.tagId),
            );
        },
    );
}
