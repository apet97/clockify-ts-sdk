/**
 * `clk115 webhooks list` / `clk115 webhooks create` / `clk115 webhooks delete <id>`.
 */
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { assertSafeWebhookUrl } from "clockify-sdk-ts-115/webhooks";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext, splitList } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerWebhooksCommand: Registrar = (program, services) => {
    const webhooks = program.command("webhooks").description("Manage outbound webhooks.");

    webhooks
        .command("list")
        .description("List webhooks in the workspace.")
        .option("--type <type>", "Filter by webhook type (e.g. WEBHOOK, ADDON_WEBHOOK).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: { workspaceId: string; type?: string } = { workspaceId };
            if (opts.type) {
                const type = String(opts.type).toUpperCase();
                if (!["WEBHOOK", "ADDON_WEBHOOK"].includes(type)) {
                    throw new Error(`Unknown webhook type: ${opts.type}`);
                }
                req.type = type;
            }
            // Live Clockify returns {workspaceWebhookCount, webhooks: [...]};
            // the typed SDK return is wider than the runtime shape, so we
            // normalise here rather than upstream.
            // wireBody bridges the narrower generated `type` (a WebhookType literal
            // union) since the CLI accepts a free-form --type filter string.
            const response = (await client.webhooks.list(wireBody<ClockifyApi.ListWebhooksRequest>(req))) as
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

    webhooks
        .command("create")
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
            try {
                assertSafeWebhookUrl(opts.url);
            } catch (err) {
                throw new Error(
                    `webhooks.create: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
            const triggerSourceType = (opts.triggerSourceType ?? "WORKSPACE_ID") as ClockifyApi.WebhookEventTriggerSourceType;
            const triggerSource = opts.triggerSource
                ? splitList(String(opts.triggerSource))
                : triggerSourceType === "WORKSPACE_ID"
                  ? [workspaceId]
                  : [];
            const body: ClockifyRequestBody<ClockifyApi.WebhookRequest> = {
                name: opts.name,
                url: opts.url,
                webhookEvent: opts.event as ClockifyApi.WebhookEventType,
                triggerSourceType,
                triggerSource,
            };
            const created = (await client.webhooks.create(
                wireBody<ClockifyApi.WebhookRequest>({
                    workspaceId,
                    body,
                }),
            )) as {
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

    webhooks
        .command("delete")
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
