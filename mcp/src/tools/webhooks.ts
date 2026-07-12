/**
 * Webhook subscription tools. List normalises the upstream envelope
 * ({workspaceWebhookCount, webhooks: [...]}) so consumers don't need
 * to know the wire shape.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { assertSafeWebhookUrl } from "../orchestration/webhook-url.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../result.js";

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
const WEBHOOK_TRIGGER_SOURCE_TYPES = [
    "PROJECT_ID",
    "USER_ID",
    "TAG_ID",
    "TASK_ID",
    "WORKSPACE_ID",
    "ASSIGNMENT_ID",
    "EXPENSE_ID",
] as const satisfies readonly ClockifyApi.WebhookEventTriggerSourceType[];
type WebhookUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateWebhooksRequest>;

function webhookEvent(value: unknown): ClockifyApi.WebhookEventType {
    const match = WEBHOOK_EVENT_TYPES.find((candidate) => candidate === value);
    if (match === undefined) {
        throw new TypeError("Cannot update webhook: current event is missing or invalid.");
    }
    return match;
}

function webhookTriggerSourceType(value: unknown): ClockifyApi.WebhookEventTriggerSourceType {
    const match = WEBHOOK_TRIGGER_SOURCE_TYPES.find((candidate) => candidate === value);
    if (match === undefined) {
        throw new TypeError(
            "Cannot update webhook: current trigger source type is missing or invalid.",
        );
    }
    return match;
}

function webhookUpdateBody(current: unknown): WebhookUpdateBody {
    if (current == null || typeof current !== "object") {
        throw new TypeError("Cannot update webhook: current webhook state is unavailable.");
    }
    const value = current as Record<string, unknown>;
    if (typeof value.name !== "string" || value.name.length < 2 || value.name.length > 30) {
        throw new TypeError("Cannot update webhook: current name must contain 2 to 30 characters.");
    }
    if (typeof value.url !== "string") {
        throw new TypeError("Cannot update webhook: current URL is missing.");
    }
    const event = webhookEvent(value.webhookEvent);
    const triggerSourceType = webhookTriggerSourceType(value.triggerSourceType);
    if (
        !Array.isArray(value.triggerSource) ||
        value.triggerSource.some((item) => typeof item !== "string")
    ) {
        throw new TypeError("Cannot update webhook: current trigger source is missing or invalid.");
    }
    return {
        name: value.name,
        url: value.url,
        webhookEvent: event,
        triggerSourceType,
        triggerSource: [...value.triggerSource],
    };
}

function sameWebhookField(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

export function registerWebhooksTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_webhooks_list",
        {
            title: "List webhooks",
            description: "List outbound webhook subscriptions in the workspace.",
            inputSchema: {},
            idempotent: true,
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
            idempotent: true,
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

    defineGuardedTool(
        server,
        ctx,
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
                    .enum(WEBHOOK_EVENT_TYPES)
                    .describe("Event name, e.g. NEW_TIME_ENTRY, NEW_PROJECT."),
                triggerSourceType: z.enum(WEBHOOK_TRIGGER_SOURCE_TYPES).optional(),
                triggerSource: z.array(z.string()).optional(),
            },
        },
        {
            preview: (args) => {
                assertSafeWebhookUrl(args.url);
                const triggerSourceType = args.triggerSourceType ?? "WORKSPACE_ID";
                const triggerSource =
                    args.triggerSource ??
                    (triggerSourceType === "WORKSPACE_ID"
                        ? [ctx.workspaceId]
                        : (() => {
                              throw new TypeError(
                                  "triggerSource is required when triggerSourceType is not WORKSPACE_ID.",
                              );
                          })());
                const body: ClockifyRequestBody<ClockifyApi.WebhookRequest> = {
                    name: args.name,
                    url: args.url,
                    webhookEvent: args.webhookEvent,
                    triggerSourceType,
                    triggerSource,
                };
                return {
                    action: "create",
                    entity: "webhook",
                    name: args.name,
                    request: {
                        body,
                        workspaceId: ctx.workspaceId,
                    } satisfies ClockifyApi.WebhookRequest,
                };
            },
            execute: async (preview) => {
                const created = await ctx.client.webhooks.create(preview.request);
                return successResult(
                    "clockify_webhooks_create",
                    redactWebhook(created),
                    { workspaceId: preview.request.workspaceId },
                    writeReceipt("created", "webhook", {
                        id: entityId(created),
                        name: preview.name,
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_webhooks_update",
        {
            title: "Update a webhook subscription",
            description: "Update a webhook subscription's name, URL, event, or trigger source.",
            inputSchema: {
                webhookId: z.string().min(1),
                name: z.string().min(2).max(30).optional(),
                url: z.string().url().optional(),
                webhookEvent: z.enum(WEBHOOK_EVENT_TYPES).optional(),
                triggerSourceType: z.enum(WEBHOOK_TRIGGER_SOURCE_TYPES).optional(),
                triggerSource: z.array(z.string()).optional(),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                if (args.url !== undefined) assertSafeWebhookUrl(args.url);
                const getRequest = {
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                } satisfies ClockifyApi.GetWebhooksRequest;
                const current = await ctx.client.webhooks.get(getRequest);
                const body = webhookUpdateBody(current);
                let changed = false;
                if (args.name !== undefined) {
                    changed ||= !sameWebhookField(body.name, args.name);
                    body.name = args.name;
                }
                if (args.url !== undefined) {
                    changed ||= !sameWebhookField(body.url, args.url);
                    body.url = args.url;
                }
                if (args.webhookEvent !== undefined) {
                    changed ||= !sameWebhookField(body.webhookEvent, args.webhookEvent);
                    body.webhookEvent = args.webhookEvent;
                }
                if (args.triggerSourceType !== undefined) {
                    changed ||= !sameWebhookField(body.triggerSourceType, args.triggerSourceType);
                    body.triggerSourceType = args.triggerSourceType;
                }
                if (args.triggerSource !== undefined) {
                    changed ||= !sameWebhookField(body.triggerSource, args.triggerSource);
                    body.triggerSource = args.triggerSource;
                }
                assertSafeWebhookUrl(body.url);
                if (!changed) {
                    throw new TypeError(
                        "Webhook update is a no-op; supply at least one changed field.",
                    );
                }
                return {
                    action: "update",
                    entity: "webhook",
                    id: args.webhookId,
                    request: {
                        body,
                        workspaceId: ctx.workspaceId,
                        webhookId: args.webhookId,
                    } satisfies ClockifyApi.UpdateWebhooksRequest,
                };
            },
            execute: async (preview) => {
                const updated = await ctx.client.webhooks.update(preview.request);
                return successResult(
                    "clockify_webhooks_update",
                    redactWebhook(updated),
                    {
                        workspaceId: preview.request.workspaceId,
                        webhookId: preview.id,
                    },
                    writeReceipt("updated", "webhook", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_webhooks_delete",
        {
            title: "Delete a webhook subscription",
            description:
                "Permanently delete a webhook subscription. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                webhookId: z.string().min(1),
            },
        },
        {
            preview: (args) => ({
                action: "delete",
                entity: "webhook",
                id: args.webhookId,
                request: {
                    workspaceId: ctx.workspaceId,
                    webhookId: args.webhookId,
                } satisfies ClockifyApi.DeleteWebhooksRequest,
            }),
            execute: async (preview) => {
                await ctx.client.webhooks.delete(preview.request);
                return successResult(
                    "clockify_webhooks_delete",
                    { deleted: true, webhookId: preview.id },
                    { workspaceId: preview.request.workspaceId, webhookId: preview.id },
                    writeReceipt("deleted", "webhook", preview.id),
                );
            },
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
            idempotent: true,
        },
        async () => {
            return successResult("clockify_webhooks_events", [...WEBHOOK_EVENT_TYPES], {
                workspaceId: ctx.workspaceId,
                count: WEBHOOK_EVENT_TYPES.length,
            });
        },
    );
}
