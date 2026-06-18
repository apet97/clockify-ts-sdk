/**
 * Invoice tools — wraps client.invoices.{list, get, create, update,
 * delete, updateStatus, export}. The single-invoice GET also returns
 * line items, so a separate `_items_list` tool would only be a
 * formatting helper; defer to a workflow port.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { invoiceUpdateBodyFromExisting } from "clockify-sdk-ts-115/invoice-body";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, successResult, writeReceipt } from "../result.js";

const INVOICE_STATUSES = ["UNSENT", "SENT", "PAID", "PARTIALLY_PAID", "VOID", "OVERDUE"] as const;

// Clockify invoice endpoints require RFC3339 datetimes; promote
// date-only input (YYYY-MM-DD) to midnight UTC so CLI users typing
// natural dates don't 400.
function normaliseInvoiceDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

export function registerInvoicesTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_invoices_list",
        {
            title: "List invoices",
            description: "List invoices in the pinned workspace, optionally filtered by invoice status.",
            inputSchema: {
                status: z.enum(INVOICE_STATUSES).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const req: Record<string, unknown> = { workspaceId: ctx.workspaceId };
            if (args.status) req.statuses = args.status;
            const response = (await ctx.client.invoices.list(req as never)) as
                | { invoices?: unknown[]; total?: number }
                | unknown[];
            const invoices = Array.isArray(response) ? response : response.invoices ?? [];
            const total = Array.isArray(response) ? invoices.length : response.total ?? invoices.length;
            return successResult("clockify_invoices_list", invoices, {
                workspaceId: ctx.workspaceId,
                count: invoices.length,
                total,
            });
        },
    );

    defineTool(
        server,
        "clockify_invoices_get",
        {
            title: "Get an invoice",
            description: "Fetch a single invoice by ID, including its line items.",
            inputSchema: { invoiceId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const invoice = await ctx.client.invoices.get({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            });
            return successResult("clockify_invoices_get", invoice, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            });
        },
    );

    defineTool(
        server,
        "clockify_invoices_create",
        {
            title: "Create an invoice draft",
            description: "Draft a new invoice. Dates accept YYYY-MM-DD (promoted to midnight UTC) or full RFC3339.",
            inputSchema: {
                clientId: z.string().min(1),
                number: z.string().min(1),
                currency: z.string().min(1).describe("ISO currency code, e.g. USD."),
                issuedDate: z.string().min(1),
                dueDate: z.string().min(1),
                timeViewMode: z.string().optional(),
                note: z.string().optional().describe("Billing note. POST drops it; applied via a follow-up update."),
                subject: z.string().optional().describe("Invoice subject. POST drops it; applied via a follow-up update."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const body: Record<string, unknown> = {
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
                number: args.number,
                currency: args.currency,
                issuedDate: normaliseInvoiceDate(args.issuedDate),
                dueDate: normaliseInvoiceDate(args.dueDate),
            };
            if (args.timeViewMode) body.timeViewMode = args.timeViewMode;
            const created = (await ctx.client.invoices.create(body as never)) as { id?: string };
            // POST /invoices SILENTLY DROPS note/subject (live-verified) — apply
            // them via the verified GET-then-PUT path so the billing doc is truthful.
            if ((args.note !== undefined || args.subject !== undefined) && created?.id) {
                const patch: Record<string, unknown> = {};
                if (args.note !== undefined) patch.note = args.note;
                if (args.subject !== undefined) patch.subject = args.subject;
                const existing = (await ctx.client.invoices.get({
                    workspaceId: ctx.workspaceId,
                    invoiceId: created.id,
                })) as Record<string, unknown>;
                await ctx.client.invoices.update({
                    workspaceId: ctx.workspaceId,
                    invoiceId: created.id,
                    ...invoiceUpdateBodyFromExisting(existing, patch),
                } as never);
            }
            return successResult("clockify_invoices_create", created, {
                workspaceId: ctx.workspaceId,
            }, writeReceipt("created", "invoice", { id: created?.id, name: args.number }));
        },
    );

    defineTool(
        server,
        "clockify_invoices_update",
        {
            title: "Update an invoice",
            description:
                "Update invoice metadata. Reads the invoice then replaces it, preserving untouched fields and mapping tax/discount correctly. Status changes go through clockify_invoices_update_status.",
            inputSchema: {
                invoiceId: z.string().min(1),
                clientId: z.string().optional(),
                number: z.string().optional(),
                currency: z.string().optional(),
                issuedDate: z.string().optional(),
                dueDate: z.string().optional(),
                note: z.string().optional(),
                subject: z.string().optional(),
                taxPercent: z.number().min(0).max(100).optional().describe("Primary tax rate as a percent (e.g. 15 for 15%)."),
                tax2Percent: z.number().min(0).max(100).optional().describe("Secondary tax rate as a percent."),
                discountPercent: z.number().min(0).max(100).optional().describe("Discount as a percent."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            // PUT /invoices REPLACES the document, and tax/discount are asymmetric
            // on the wire (GET returns discount/tax/tax2 ×100 ints; PUT wants
            // *Percent). Read the current invoice and rebuild a clean body so a
            // sparse update never wipes untouched fields or silently zeroes
            // tax/discount.
            const existing = (await ctx.client.invoices.get({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            })) as Record<string, unknown>;
            const patch: Record<string, unknown> = {};
            if (args.clientId) patch.clientId = args.clientId;
            if (args.number) patch.number = args.number;
            if (args.currency) patch.currency = args.currency;
            if (args.issuedDate) patch.issuedDate = normaliseInvoiceDate(args.issuedDate);
            if (args.dueDate) patch.dueDate = normaliseInvoiceDate(args.dueDate);
            if (args.note !== undefined) patch.note = args.note;
            if (args.subject !== undefined) patch.subject = args.subject;
            if (args.taxPercent !== undefined) patch.taxPercent = args.taxPercent;
            if (args.tax2Percent !== undefined) patch.tax2Percent = args.tax2Percent;
            if (args.discountPercent !== undefined) patch.discountPercent = args.discountPercent;
            const updated = await ctx.client.invoices.update({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                ...invoiceUpdateBodyFromExisting(existing, patch),
            } as never);
            return successResult("clockify_invoices_update", updated, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            }, writeReceipt("updated", "invoice", args.invoiceId));
        },
    );

    defineTool(
        server,
        "clockify_invoices_delete",
        {
            title: "Delete an invoice",
            description:
                "Permanently delete an invoice. Billing-impactful; coordinate before running. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                invoiceId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "invoice", id: args.invoiceId };
            const confirmation = requireConfirmation(ctx, "clockify_invoices_delete", "invoice_delete", args, preview);
            if (confirmation) return confirmation;
            await ctx.client.invoices.delete({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            });
            return successResult(
                "clockify_invoices_delete",
                { deleted: true, invoiceId: args.invoiceId },
                { workspaceId: ctx.workspaceId, invoiceId: args.invoiceId },
                writeReceipt("deleted", "invoice", args.invoiceId),
            );
        },
    );

    defineTool(
        server,
        "clockify_invoices_update_status",
        {
            title: "Update invoice status",
            description: "Move an invoice between statuses (UNSENT, SENT, PAID, PARTIALLY_PAID, VOID, OVERDUE).",
            inputSchema: {
                invoiceId: z.string().min(1),
                status: z.enum(INVOICE_STATUSES),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const updated = await ctx.client.invoices.updateStatus({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                body: { status: args.status },
            } as never);
            return successResult("clockify_invoices_update_status", updated, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            }, writeReceipt("updated", "invoice", args.invoiceId));
        },
    );

    defineTool(
        server,
        "clockify_invoices_export",
        {
            title: "Export an invoice (PDF)",
            description: "Export an invoice. Clockify supports PDF only at this endpoint; use clockify_reports_export for CSV/XLSX data.",
            inputSchema: {
                invoiceId: z.string().min(1),
                userLocale: z.string().optional().describe("Locale for the rendered document, e.g. en-US."),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const exported = await ctx.client.invoices.export({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                userLocale: args.userLocale ?? "en-US",
            });
            return successResult("clockify_invoices_export", exported, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            });
        },
    );

    defineTool(
        server,
        "clockify_invoices_import_time",
        {
            title: "Import time into an invoice",
            description: "Import time entries (and optionally expenses) into an existing invoice over a date range.",
            inputSchema: {
                invoiceId: z.string().min(1),
                from: z.string().min(1).describe("ISO start of the import window"),
                to: z.string().min(1).describe("ISO end of the import window"),
                importExpenses: z.boolean().default(false).optional(),
                timeEntryGroupType: z.enum(["SINGLE_ITEM", "GROUPED", "DETAILED"]).default("GROUPED").optional(),
                projectFilter: z.record(z.unknown()).optional().describe('Project filter; status is required, e.g. { "status": "ACTIVE" }'),
                extra: z.record(z.unknown()).optional().describe("Additional import grouping fields"),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const { invoiceId, extra, importExpenses, timeEntryGroupType, projectFilter, from, to } = args;
            const imported = await ctx.client.invoiceItems.import({
                importExpenses: importExpenses ?? false,
                timeEntryGroupType: timeEntryGroupType ?? "GROUPED",
                ...(extra ?? {}),
                // status is required upstream; default it but let the caller's filter win.
                projectFilter: { status: "ACTIVE", ...(projectFilter ?? {}) },
                from,
                to,
                invoiceId,
                workspaceId: ctx.workspaceId,
            } as never);
            return successResult("clockify_invoices_import_time", imported, {
                workspaceId: ctx.workspaceId,
                invoiceId,
            });
        },
    );
}
