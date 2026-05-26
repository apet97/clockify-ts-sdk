/**
 * `clk115 webhooks list` / `clk115 webhooks create` / `clk115 webhooks delete <id>`.
 */
import { Command } from "commander";

import { printObject, printRecords, printSuccess } from "../output.js";
import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerWebhooksCommand: Registrar = (program, services) => {
    const webhooks = program.command("webhooks").description("Manage outbound webhooks.");

    webhooks
        .command("list")
        .description("List webhooks in the workspace.")
        .option("--type <type>", "Filter by webhook type (e.g. WEBHOOK, ADDON_WEBHOOK).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = { workspaceId };
            if (opts.type) req.type = opts.type;
            // Live Clockify returns {workspaceWebhookCount, webhooks: [...]};
            // the typed SDK return is wider than the runtime shape, so we
            // normalise here rather than upstream.
            const response = (await client.webhooks.list(req as never)) as
                | unknown[]
                | { webhooks?: unknown[] };
            const items = Array.isArray(response) ? response : response.webhooks ?? [];
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = {
                name: opts.name,
                url: opts.url,
                webhookEvent: opts.event,
            };
            if (opts.triggerSourceType) body.triggerSourceType = opts.triggerSourceType;
            if (opts.triggerSource) {
                body.triggerSource = String(opts.triggerSource)
                    .split(",")
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
            }
            const created = (await client.webhooks.create({ workspaceId, body } as never)) as {
                id?: string;
                name?: string;
                url?: string;
                webhookEvent?: string;
                enabled?: boolean;
            };
            printObject(
                {
                    id: created.id ?? "",
                    name: created.name ?? "",
                    event: created.webhookEvent ?? "",
                    url: created.url ?? "",
                    enabled: created.enabled !== false,
                },
                output,
            );
        });

    webhooks
        .command("delete")
        .argument("<id>", "Webhook ID.")
        .description("Delete a webhook subscription.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            await client.webhooks.delete({ workspaceId, webhookId: id });
            printSuccess(`deleted webhook ${id}`, output);
        });
};
