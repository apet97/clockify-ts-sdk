/**
 * Webhook subscription tools. List normalises the upstream envelope
 * ({workspaceWebhookCount, webhooks: [...]}) so consumers don't need
 * to know the wire shape.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerWebhooksTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_webhooks_list",
        {
            title: "List webhooks",
            description: "List outbound webhook subscriptions in the workspace.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            try {
                const response = (await ctx.client.webhooks.list({
                    workspaceId: ctx.workspaceId,
                })) as unknown[] | { webhooks?: unknown[]; workspaceWebhookCount?: number };
                const items = Array.isArray(response) ? response : response.webhooks ?? [];
                const total = Array.isArray(response)
                    ? items.length
                    : response.workspaceWebhookCount ?? items.length;
                return successResult("clockify_webhooks_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                    total,
                });
            } catch (err) {
                return errorResult("clockify_webhooks_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_webhooks_get",
        {
            title: "Get a webhook",
            description: "Fetch a single webhook subscription by ID.",
            inputSchema: { webhookId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const webhook = await ctx.client.webhooks.get({
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                });
                return successResult("clockify_webhooks_get", webhook, {
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                });
            } catch (err) {
                return errorResult("clockify_webhooks_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_webhooks_create",
        {
            title: "Create a webhook subscription",
            description: "Subscribe a URL to a Clockify event. URL must be HTTPS and pass workspace DNS validation.",
            inputSchema: {
                name: z.string().min(1),
                url: z.string().url(),
                webhookEvent: z.string().min(1).describe("Event name, e.g. NEW_TIME_ENTRY, NEW_PROJECT."),
                triggerSourceType: z.string().optional(),
                triggerSource: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    name: args.name,
                    url: args.url,
                    webhookEvent: args.webhookEvent,
                };
                if (args.triggerSourceType) body.triggerSourceType = args.triggerSourceType;
                if (args.triggerSource) body.triggerSource = args.triggerSource;
                const created = await ctx.client.webhooks.create({
                    workspaceId: ctx.workspaceId,
                    body,
                } as never);
                return successResult("clockify_webhooks_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_webhooks_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_webhooks_update",
        {
            title: "Update a webhook subscription",
            description: "Update a webhook subscription's name, URL, event, or trigger source.",
            inputSchema: {
                webhookId: z.string().min(1),
                name: z.string().optional(),
                url: z.string().url().optional(),
                webhookEvent: z.string().optional(),
                triggerSourceType: z.string().optional(),
                triggerSource: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.url) body.url = args.url;
                if (args.webhookEvent) body.webhookEvent = args.webhookEvent;
                if (args.triggerSourceType) body.triggerSourceType = args.triggerSourceType;
                if (args.triggerSource) body.triggerSource = args.triggerSource;
                const updated = await ctx.client.webhooks.update({
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                    body,
                } as never);
                return successResult("clockify_webhooks_update", updated, {
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                });
            } catch (err) {
                return errorResult("clockify_webhooks_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_webhooks_delete",
        {
            title: "Delete a webhook subscription",
            description: "Permanently delete a webhook subscription.",
            inputSchema: { webhookId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.webhooks.delete({
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                });
                return successResult(
                    "clockify_webhooks_delete",
                    { deleted: true, webhookId: args.webhookId },
                    { workspaceId: ctx.workspaceId, webhookId: args.webhookId },
                );
            } catch (err) {
                return errorResult("clockify_webhooks_delete", err);
            }
        },
    );
}
