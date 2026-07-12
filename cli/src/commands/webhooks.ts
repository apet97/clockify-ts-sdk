/**
 * `clk115 webhooks list` / `clk115 webhooks create` / `clk115 webhooks delete <id>`.
 */
import { requestOptions } from "clockify-sdk-ts-115/request-options";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { assertSafeWebhookUrl } from "clockify-sdk-ts-115/webhooks";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext, splitList } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

const WEBHOOK_LIST_TYPES = ["WEBHOOK", "ADDON_WEBHOOK"] as const;

const WEBHOOK_TRIGGER_SOURCE_TYPES = [
    "PROJECT_ID",
    "USER_ID",
    "TAG_ID",
    "TASK_ID",
    "WORKSPACE_ID",
    "ASSIGNMENT_ID",
    "EXPENSE_ID",
] as const satisfies readonly ClockifyApi.WebhookEventTriggerSourceType[];

const WEBHOOK_EVENT_TYPES = [
    "NEW_TIME_ENTRY",
    "TIME_ENTRY_UPDATED",
    "TIME_ENTRY_DELETED",
    "TIME_ENTRY_SPLIT",
    "TIME_ENTRY_RESTORED",
    "NEW_TIMER_STARTED",
    "TIMER_STOPPED",
    "NEW_PROJECT",
    "PROJECT_UPDATED",
    "PROJECT_DELETED",
    "NEW_TASK",
    "TASK_UPDATED",
    "TASK_DELETED",
    "NEW_CLIENT",
    "CLIENT_UPDATED",
    "CLIENT_DELETED",
    "NEW_TAG",
    "TAG_UPDATED",
    "TAG_DELETED",
    "USER_JOINED_WORKSPACE",
    "USER_DELETED_FROM_WORKSPACE",
    "USER_DEACTIVATED_ON_WORKSPACE",
    "USER_ACTIVATED_ON_WORKSPACE",
    "USER_EMAIL_CHANGED",
    "USER_UPDATED",
    "USERS_INVITED_TO_WORKSPACE",
    "LIMITED_USERS_ADDED_TO_WORKSPACE",
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
    "EXPENSE_CREATED",
    "EXPENSE_UPDATED",
    "EXPENSE_DELETED",
    "EXPENSE_RESTORED",
    "ASSIGNMENT_CREATED",
    "ASSIGNMENT_UPDATED",
    "ASSIGNMENT_DELETED",
    "ASSIGNMENT_PUBLISHED",
    "USER_GROUP_CREATED",
    "USER_GROUP_UPDATED",
    "USER_GROUP_DELETED",
    "COST_RATE_UPDATED",
    "BILLABLE_RATE_UPDATED",
] as const satisfies readonly ClockifyApi.WebhookEventType[];

const USER_ID_TRIGGER_EVENTS = new Set<ClockifyApi.WebhookEventType>([
    "USER_EMAIL_CHANGED",
    "USER_UPDATED",
]);

type MissingWebhookEvent = Exclude<
    ClockifyApi.WebhookEventType,
    (typeof WEBHOOK_EVENT_TYPES)[number]
>;
const webhookEventsExhaustive: MissingWebhookEvent extends never ? true : false = true;
void webhookEventsExhaustive;

function nonEmptyString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`webhooks.create: ${field} must be a non-empty string.`);
    }
    return value;
}

function webhookEvent(value: unknown): ClockifyApi.WebhookEventType {
    const event = String(value).toUpperCase();
    if (!WEBHOOK_EVENT_TYPES.includes(event as ClockifyApi.WebhookEventType)) {
        throw new Error(`Unknown webhook event: ${String(value)}`);
    }
    return event as ClockifyApi.WebhookEventType;
}

function webhookTriggerSourceType(value: unknown): ClockifyApi.WebhookEventTriggerSourceType {
    const raw = value ?? "WORKSPACE_ID";
    if (typeof raw !== "string") {
        throw new Error("Unknown trigger source type: expected a string.");
    }
    const type = raw.toUpperCase();
    if (!WEBHOOK_TRIGGER_SOURCE_TYPES.includes(type as ClockifyApi.WebhookEventTriggerSourceType)) {
        throw new Error(`Unknown trigger source type: ${raw}`);
    }
    return type as ClockifyApi.WebhookEventTriggerSourceType;
}

export const registerWebhooksCommand: Registrar = (program, services) => {
    const webhooks = program.command("webhooks").description("Manage outbound webhooks.");

    leafCommand(webhooks, "list", "read")
        .description("List webhooks in the workspace.")
        .option("--type <type>", "Filter by webhook type (e.g. WEBHOOK, ADDON_WEBHOOK).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            let type: (typeof WEBHOOK_LIST_TYPES)[number] | undefined;
            if (opts.type) {
                const candidate = String(opts.type).toUpperCase();
                if (
                    !WEBHOOK_LIST_TYPES.includes(candidate as (typeof WEBHOOK_LIST_TYPES)[number])
                ) {
                    throw new Error(`Unknown webhook type: ${opts.type}`);
                }
                type = candidate as (typeof WEBHOOK_LIST_TYPES)[number];
            }
            // Live Clockify returns {workspaceWebhookCount, webhooks: [...]};
            // the typed SDK return is wider than the runtime shape, so we
            // normalise here rather than upstream.
            // The live list filter uses WEBHOOK / ADDON_WEBHOOK, which does not
            // match the generated WebhookType enum. Preserve the compatible wire
            // contract through the typed per-request query seam.
            const options = type ? requestOptions({ queryParams: { type } }) : undefined;
            const response = (await client.webhooks.list({ workspaceId }, options)) as
                | unknown[]
                | { webhooks?: unknown[] };
            const items = Array.isArray(response) ? response : (response.webhooks ?? []);
            const rows = items.map((raw) => {
                const w = raw as {
                    id?: string;
                    name?: string;
                    url?: string;
                    webhookEvent?: string;
                    enabled?: boolean;
                    triggerSourceType?: string;
                };
                return {
                    id: w.id ?? "",
                    name: w.name ?? "",
                    event: w.webhookEvent ?? "",
                    url: w.url ?? "",
                    enabled: w.enabled !== false,
                    triggerSourceType: w.triggerSourceType ?? "",
                };
            });
            printRecords(rows, output);
        });

    leafCommand(webhooks, "create", "write")
        .description("Create a webhook subscription.")
        .requiredOption("--name <text>", "Webhook label.")
        .requiredOption("--url <url>", "Target URL (HTTPS).")
        .requiredOption(
            "--event <event>",
            "Webhook event (e.g. NEW_PROJECT, NEW_TIME_ENTRY, NEW_INVOICE).",
        )
        .option("--trigger-source-type <type>", "Trigger source type (e.g. PROJECT_ID, USER_ID).")
        .option(
            "--trigger-source <ids>",
            "Comma-separated trigger source IDs (required when --trigger-source-type is set).",
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const name = nonEmptyString(opts.name, "name");
            const url = nonEmptyString(opts.url, "url");
            try {
                assertSafeWebhookUrl(url);
            } catch (err) {
                throw new Error(
                    `webhooks.create: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
            const event = webhookEvent(opts.event);
            const triggerSourceType = webhookTriggerSourceType(opts.triggerSourceType);
            if (USER_ID_TRIGGER_EVENTS.has(event) && triggerSourceType !== "USER_ID") {
                throw new Error(`webhooks.create: ${event} requires USER_ID trigger sources.`);
            }
            const triggerSource =
                triggerSourceType === "WORKSPACE_ID"
                    ? [workspaceId]
                    : opts.triggerSource
                      ? splitList(String(opts.triggerSource))
                      : [];
            if (triggerSource.length === 0) {
                throw new Error(
                    `webhooks.create: trigger source is required for ${triggerSourceType}.`,
                );
            }
            const body: ClockifyRequestBody<ClockifyApi.WebhookRequest> = {
                name,
                url,
                webhookEvent: event,
                triggerSourceType,
                triggerSource,
            };
            const request: ClockifyApi.WebhookRequest = { workspaceId, body };
            const created = (await client.webhooks.create(request)) as {
                id?: string;
                name?: string;
                url?: string;
                webhookEvent?: string;
                enabled?: boolean;
            };
            const data = {
                id: created.id ?? "",
                name: created.name ?? "",
                event: created.webhookEvent ?? "",
                url: created.url ?? "",
                enabled: created.enabled !== false,
            };
            printReceipt(
                {
                    ok: true,
                    action: "webhooks.create",
                    entity: "webhook",
                    ids: { webhookId: data.id },
                    data,
                    changed: { created: [{ type: "webhook", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: "clk115 webhooks list --json",
                            reason: "Verify the webhook appears.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(webhooks, "delete", "destructive")
        .argument("<id>", "Webhook ID.")
        .description("Delete a webhook subscription.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.webhooks.delete({ workspaceId, webhookId: id });
            printReceipt(
                {
                    ok: true,
                    action: "webhooks.delete",
                    entity: "webhook",
                    ids: { webhookId: id },
                    data: { id, deleted: true, message: `deleted webhook ${id}` },
                    changed: { deleted: [{ type: "webhook", id }] },
                    next: [
                        {
                            command: "clk115 webhooks list --json",
                            reason: "Verify the webhook no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
