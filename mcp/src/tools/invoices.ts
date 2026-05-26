/**
 * Invoice tools — wraps client.invoices.{list, get, create, update,
 * delete, updateStatus, export}. The single-invoice GET also returns
 * line items, so a separate `_items_list` tool would only be a
 * formatting helper; defer to a workflow port.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

const INVOICE_STATUSES = ["UNSENT", "SENT", "PAID", "PARTIALLY_PAID", "VOID", "OVERDUE"] as const;

// Clockify invoice endpoints require RFC3339 datetimes; promote
// date-only input (YYYY-MM-DD) to midnight UTC so CLI users typing
// natural dates don't 400.
function normaliseInvoiceDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

export function registerInvoicesTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_invoices_list",
        {
            title: "List invoices",
            description: "List invoices in the workspace.",
            inputSchema: {
                status: z.enum(INVOICE_STATUSES).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
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
            } catch (err) {
                return errorResult("clockify_invoices_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_invoices_get",
        {
            title: "Get an invoice",
            description: "Fetch a single invoice by ID, including its line items.",
            inputSchema: { invoiceId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const invoice = await ctx.client.invoices.get({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
                return successResult("clockify_invoices_get", invoice, {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
            } catch (err) {
                return errorResult("clockify_invoices_get", err);
            }
        },
    );

    server.registerTool(
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
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                    number: args.number,
                    currency: args.currency,
                    issuedDate: normaliseInvoiceDate(args.issuedDate),
                    dueDate: normaliseInvoiceDate(args.dueDate),
                };
                if (args.timeViewMode) body.timeViewMode = args.timeViewMode;
                const created = await ctx.client.invoices.create(body as never);
                return successResult("clockify_invoices_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_invoices_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_invoices_update",
        {
            title: "Update an invoice",
            description: "Update invoice metadata. Status changes go through clockify_invoices_update_status.",
            inputSchema: {
                invoiceId: z.string().min(1),
                clientId: z.string().optional(),
                number: z.string().optional(),
                currency: z.string().optional(),
                issuedDate: z.string().optional(),
                dueDate: z.string().optional(),
                note: z.string().optional(),
                subject: z.string().optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { workspaceId: ctx.workspaceId, invoiceId: args.invoiceId };
                if (args.clientId) body.clientId = args.clientId;
                if (args.number) body.number = args.number;
                if (args.currency) body.currency = args.currency;
                if (args.issuedDate) body.issuedDate = normaliseInvoiceDate(args.issuedDate);
                if (args.dueDate) body.dueDate = normaliseInvoiceDate(args.dueDate);
                if (args.note !== undefined) body.note = args.note;
                if (args.subject !== undefined) body.subject = args.subject;
                const updated = await ctx.client.invoices.update(body as never);
                return successResult("clockify_invoices_update", updated, {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
            } catch (err) {
                return errorResult("clockify_invoices_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_invoices_delete",
        {
            title: "Delete an invoice",
            description: "Permanently delete an invoice. Billing-impactful; coordinate before running.",
            inputSchema: { invoiceId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.invoices.delete({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
                return successResult(
                    "clockify_invoices_delete",
                    { deleted: true, invoiceId: args.invoiceId },
                    { workspaceId: ctx.workspaceId, invoiceId: args.invoiceId },
                );
            } catch (err) {
                return errorResult("clockify_invoices_delete", err);
            }
        },
    );

    server.registerTool(
        "clockify_invoices_update_status",
        {
            title: "Update invoice status",
            description: "Move an invoice between statuses (UNSENT, SENT, PAID, PARTIALLY_PAID, VOID, OVERDUE).",
            inputSchema: {
                invoiceId: z.string().min(1),
                status: z.enum(INVOICE_STATUSES),
            },
        },
        async (args) => {
            try {
                const updated = await ctx.client.invoices.updateStatus({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    body: { status: args.status },
                } as never);
                return successResult("clockify_invoices_update_status", updated, {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
            } catch (err) {
                return errorResult("clockify_invoices_update_status", err);
            }
        },
    );

    server.registerTool(
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
            try {
                const exported = await ctx.client.invoices.export({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    userLocale: args.userLocale ?? "en-US",
                } as never);
                return successResult("clockify_invoices_export", exported, {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                });
            } catch (err) {
                return errorResult("clockify_invoices_export", err);
            }
        },
    );
}
