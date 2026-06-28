/**
 * Webhook subscription tools. List normalises the upstream envelope
 * ({workspaceWebhookCount, webhooks: [...]}) so consumers don't need
 * to know the wire shape.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { assertSafeWebhookUrl } from "../orchestration/webhook-url.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

/**
 * A webhook's `authToken` is the HMAC signing secret Clockify uses to sign every
 * outbound payload. It must NEVER leave the tool result envelope (an agent log
 * would expose it). Redact it (and any token-ish sibling) to a sentinel while
 * keeping every other field (id, name, url, webhookEvent, enabled, ...) intact.
 * Accepts a single webhook object or a list; non-objects pass through unchanged.
 */
const WEBHOOK_SECRET_FIELDS = ["authToken"] as const;
// Exported so the workflow-first `clockify_setup_webhook` (workflows/business.ts)
// redacts the same secret on its create path — the domain tools below are not the
// only writer that receives Clockify's authToken-bearing create response.
export function redactWebhook<T>(value: T): T {
    if (Array.isArray(value)) return value.map((item) => redactWebhook(item)) as unknown as T;
    if (!value || typeof value !== "object") return value;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const field of WEBHOOK_SECRET_FIELDS) {
        if (field in out) out[field] = "***redacted***";
    }
    return out as unknown as T;
}

// Static registry of every webhook event type a subscription can target,
// mirrored verbatim from the generated `WebhookEventType` union
// (components/schemas/WebhookEventType). Clockify exposes no list-events
// endpoint, so this is offline — no API call.
const WEBHOOK_EVENT_TYPES = [
    "NEW_PROJECT",
    "NEW_TASK",
    "NEW_CLIENT",
    "NEW_TIMER_STARTED",
    "TIMER_STOPPED",
    "TIME_ENTRY_UPDATED",
    "TIME_ENTRY_DELETED",
    "TIME_ENTRY_SPLIT",
    "NEW_TIME_ENTRY",
    "TIME_ENTRY_RESTORED",
    "NEW_TAG",
    "USER_DELETED_FROM_WORKSPACE",
    "USER_JOINED_WORKSPACE",
    "USER_DEACTIVATED_ON_WORKSPACE",
    "USER_ACTIVATED_ON_WORKSPACE",
    "USER_EMAIL_CHANGED",
    "USER_UPDATED",
    "NEW_INVOICE",
    "INVOICE_UPDATED",
    "NEW_APPROVAL_REQUEST",
    "APPROVAL_REQUEST_STATUS_UPDATED",
    "TIME_OFF_REQUESTED",
    "TIME_OFF_REQUEST_UPDATED",
    "TIME_OFF_REQUEST_APPROVED",
    "TIME_OFF_REQUEST_REJECTED",
    "TIME_OFF_REQUEST_STARTED",
    "TIME_OFF_REQUEST_WITHDRAWN",
    "BALANCE_UPDATED",
    "TAG_UPDATED",
    "TAG_DELETED",
    "TASK_UPDATED",
    "CLIENT_UPDATED",
    "TASK_DELETED",
    "CLIENT_DELETED",
    "EXPENSE_RESTORED",
    "ASSIGNMENT_CREATED",
    "ASSIGNMENT_DELETED",
    "ASSIGNMENT_PUBLISHED",
    "ASSIGNMENT_UPDATED",
    "EXPENSE_CREATED",
    "EXPENSE_DELETED",
    "EXPENSE_UPDATED",
    "PROJECT_UPDATED",
    "PROJECT_DELETED",
    "USER_GROUP_CREATED",
    "USER_GROUP_UPDATED",
    "USER_GROUP_DELETED",
    "USERS_INVITED_TO_WORKSPACE",
    "LIMITED_USERS_ADDED_TO_WORKSPACE",
    "COST_RATE_UPDATED",
    "BILLABLE_RATE_UPDATED",
] as const satisfies readonly ClockifyApi.WebhookEventType[];

export function registerWebhooksTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_webhooks_list",
        {
            title: "List webhooks",
            description: "List outbound webhook subscriptions in the workspace.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            const response = (await ctx.client.webhooks.list({
                workspaceId: ctx.workspaceId,
            })) as unknown[] | { webhooks?: unknown[]; workspaceWebhookCount?: number };
            const rawItems = Array.isArray(response) ? response : (response.webhooks ?? []);
            const total = Array.isArray(response)
                ? rawItems.length
                : (response.workspaceWebhookCount ?? rawItems.length);
            // Strip the HMAC signing secret from every webhook before it leaves the tool.
            const items = redactWebhook(rawItems);
            return successResult("clockify_webhooks_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
                total,
            });
        },
    );

    defineTool(
        server,
        "clockify_webhooks_get",
        {
            title: "Get a webhook",
            description: "Fetch a single webhook subscription by ID.",
            inputSchema: { webhookId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const webhook = await ctx.client.webhooks.get({
                workspaceId: ctx.workspaceId,
                webhookId: args.webhookId,
            });
            return successResult("clockify_webhooks_get", redactWebhook(webhook), {
                workspaceId: ctx.workspaceId,
                webhookId: args.webhookId,
            });
        },
    );

    defineTool(
        server,
        "clockify_webhooks_create",
        {
            title: "Create a webhook subscription",
            description:
                "Subscribe a URL to a Clockify event. URL must be HTTPS and is rejected pre-flight if it points at a loopback, private, link-local, CGNAT, or cloud-metadata host.",
            inputSchema: {
                name: z
                    .string()
                    .min(2)
                    .max(30)
                    .describe("Webhook name, 2-30 chars (required by Clockify)."),
                url: z.string().url(),
                webhookEvent: z
                    .string()
                    .min(1)
                    .describe("Event name, e.g. NEW_TIME_ENTRY, NEW_PROJECT."),
                triggerSourceType: z.string().optional(),
                triggerSource: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            assertSafeWebhookUrl(args.url);
            // `name` is required on the API-key webhook-create path — the only auth
            // scheme this SDK uses; addon-token creates don't require it
            // (maintainer-confirmed; see spec/evidence/discrepancies.md
            // `webhook.create.name-required-on-api-key-not-addon`). The corrected
            // WebhookRequest marks name minLength:2/maxLength:30 in required[], the
            // primary clockify_setup_webhook workflow requires it, and the 2026-06-21
            // live API-key probe supplied one. The schema makes it required, so it is
            // always present + sent.
            const body: Partial<ClockifyRequestBody<ClockifyApi.WebhookRequest>> &
                Pick<ClockifyRequestBody<ClockifyApi.WebhookRequest>, "url" | "name"> & {
                    webhookEvent: ClockifyApi.WebhookEventType;
                } = {
                name: args.name,
                url: args.url,
                webhookEvent: args.webhookEvent as ClockifyApi.WebhookEventType,
            };
            if (args.triggerSourceType)
                body.triggerSourceType =
                    args.triggerSourceType as ClockifyApi.WebhookEventTriggerSourceType;
            if (args.triggerSource) body.triggerSource = args.triggerSource;
            const created = await ctx.client.webhooks.create(
                wireBody<ClockifyApi.WebhookRequest>({
                    workspaceId: ctx.workspaceId,
                    body,
                }),
            );
            return successResult(
                "clockify_webhooks_create",
                redactWebhook(created),
                {
                    workspaceId: ctx.workspaceId,
                },
                writeReceipt("created", "webhook", { id: entityId(created), name: args.name }),
            );
        },
    );

    defineTool(
        server,
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
            const body: Partial<ClockifyRequestBody<ClockifyApi.UpdateWebhooksRequest>> & {
                webhookEvent?: ClockifyApi.WebhookEventType;
            } = {};
            if (args.name) body.name = args.name;
            if (args.url) {
                assertSafeWebhookUrl(args.url);
                body.url = args.url;
            }
            if (args.webhookEvent)
                body.webhookEvent = args.webhookEvent as ClockifyApi.WebhookEventType;
            if (args.triggerSourceType)
                body.triggerSourceType =
                    args.triggerSourceType as ClockifyApi.WebhookEventTriggerSourceType;
            if (args.triggerSource) body.triggerSource = args.triggerSource;
            const updated = await ctx.client.webhooks.update(
                wireBody<ClockifyApi.UpdateWebhooksRequest>({
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                    body,
                }),
            );
            return successResult(
                "clockify_webhooks_update",
                redactWebhook(updated),
                {
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                },
                writeReceipt("updated", "webhook", args.webhookId),
            );
        },
    );

    defineTool(
        server,
        "clockify_webhooks_delete",
        {
            title: "Delete a webhook subscription",
            description:
                "Permanently delete a webhook subscription. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                webhookId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "webhook", id: args.webhookId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_webhooks_delete",
                "webhook_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.webhooks.delete({
                workspaceId: ctx.workspaceId,
                webhookId: args.webhookId,
            });
            return successResult(
                "clockify_webhooks_delete",
                { deleted: true, webhookId: args.webhookId },
                { workspaceId: ctx.workspaceId, webhookId: args.webhookId },
                writeReceipt("deleted", "webhook", args.webhookId),
            );
        },
    );

    defineTool(
        server,
        "clockify_webhooks_events",
        {
            title: "List webhook event types",
            description:
                "List every valid webhook event type you can subscribe to (static registry; no API call). Use one as `webhookEvent` in clockify_webhooks_create.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () => {
            return successResult("clockify_webhooks_events", [...WEBHOOK_EVENT_TYPES], {
                workspaceId: ctx.workspaceId,
                count: WEBHOOK_EVENT_TYPES.length,
            });
        },
    );
}
