/**
 * `clk115 invoices list` / `clk115 invoices create`.
 */
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerInvoicesCommand: Registrar = (program, services) => {
    const invoices = program.command("invoices").description("Manage invoices.");

    invoices
        .command("list")
        .description("List invoices in the workspace.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const response = (await client.invoices.list({ workspaceId })) as {
                invoices?: unknown[];
            };
            const items = response.invoices ?? [];
            const rows = items.map((raw) => {
                const inv = raw as {
                    id?: string;
                    number?: string;
                    clientId?: string;
                    clientName?: string;
                    currency?: string;
                    amount?: number;
                    status?: string;
                    issuedDate?: string;
                    dueDate?: string;
                };
                return {
                    id: inv.id ?? "",
                    number: inv.number ?? "",
                    client: inv.clientName ?? inv.clientId ?? "",
                    currency: inv.currency ?? "",
                    amount: inv.amount ?? 0,
                    status: inv.status ?? "",
                    issued: inv.issuedDate ?? "",
                    due: inv.dueDate ?? "",
                };
            });
            printRecords(rows, output);
        });

    invoices
        .command("create")
        .description("Create an invoice draft.")
        .requiredOption("--client <id>", "Client ID.")
        .requiredOption("--number <text>", "Invoice number.")
        .requiredOption("--currency <code>", "ISO currency code (e.g. USD, EUR).")
        .requiredOption("--issued <date>", "Issued date (YYYY-MM-DD or RFC3339).")
        .requiredOption("--due <date>", "Due date (YYYY-MM-DD or RFC3339).")
        .option("--time-view-mode <mode>", "Time view mode (e.g. AGGREGATED_TIME_VIEW, DETAILED_TIME_VIEW).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = {
                workspaceId,
                clientId: opts.client,
                number: opts.number,
                currency: opts.currency,
                issuedDate: normaliseInvoiceDate(opts.issued, "issued"),
                dueDate: normaliseInvoiceDate(opts.due, "due"),
            };
            if (opts.timeViewMode) body.timeViewMode = opts.timeViewMode;
            const created = (await client.invoices.create(body as never)) as {
                id?: string;
                number?: string;
                status?: string;
                currency?: string;
                amount?: number;
            };
            printObject(
                {
                    id: created.id ?? "",
                    number: created.number ?? "",
                    status: created.status ?? "",
                    currency: created.currency ?? "",
                    amount: created.amount ?? 0,
                },
                output,
            );
        });
};

// Clockify's invoice API expects an RFC3339 datetime, but CLI users
// naturally type `--issued 2026-05-26`. Promote a date-only value to
// midnight UTC so the call doesn't 400 on a format mismatch.
function normaliseInvoiceDate(value: string, label: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`--${label} is required`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T00:00:00Z`;
    }
    return value;
}
