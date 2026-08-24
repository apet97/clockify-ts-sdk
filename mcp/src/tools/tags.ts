import type { McpServer } from "@modelcontextprotocol/server";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";

export function registerTagsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_tags_list",
        {
            title: "List tags",
            description: "List tags in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
            },
            idempotent: true,
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
            idempotent: true,
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
            idempotent: true,
        },
        async (args) => {
            // Truthiness on `name` deliberately matches the body-build below,
            // so name:"" alone cannot still send an empty body.
            if (!args.name && args.archived === undefined) {
                throw new Error("at least one tag update field is required");
            }
            // tags.update.replace-resets-archived (live-proven 2026-08-09):
            // the tag PUT is a replace and omitting `archived` RESETS it to
            // false, so a name-only rename silently un-archived archived
            // tags. When any field is missing, read current state and
            // reconstruct the full body; when both are explicit, no read is
            // needed.
            const current =
                args.name && args.archived !== undefined
                    ? {}
                    : ((await ctx.client.tags.get({
                          workspaceId: ctx.workspaceId,
                          tagId: args.tagId,
                      })) as { name?: string; archived?: boolean });
            const body: ClockifyRequestBody<ClockifyApi.UpdateTagsRequest> = {
                name: args.name ? args.name : (current.name ?? ""),
                archived: args.archived ?? current.archived ?? false,
            };
            const req: ClockifyApi.UpdateTagsRequest = {
                workspaceId: ctx.workspaceId,
                tagId: args.tagId,
                body,
            };
            const updated = await ctx.client.tags.update(req);
            return successResult(
                "clockify_tags_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    tagId: args.tagId,
                },
                writeReceipt("updated", "tag", args.tagId),
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_tags_delete",
        {
            title: "Delete a tag",
            description:
                "Permanently delete one tag by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: { tagId: z.string().min(1) },
        },
        {
            preview: (args) => ({
                action: "delete",
                entity: "tag",
                id: args.tagId,
                request: { workspaceId: ctx.workspaceId, tagId: args.tagId },
            }),
            execute: async (preview) => {
                await ctx.client.tags.delete(preview.request);
                return successResult(
                    "clockify_tags_delete",
                    { deleted: true, tagId: preview.id },
                    { workspaceId: preview.request.workspaceId, tagId: preview.id },
                    writeReceipt("deleted", "tag", preview.id),
                );
            },
        },
    );
}
