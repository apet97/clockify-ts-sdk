/**
 * Invoice payment tools — wraps `client.invoicePayments.{list, create,
 * delete}`. Payments are additive and the API does not deduplicate, so a
 * repeated create records a second payment.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../../result.js";

export function registerInvoicePaymentTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_invoices_payments_list",
        {
            title: "List invoice payments",
            description: "List recorded payments against an invoice, paginated.",
            inputSchema: {
                invoiceId: z.string().min(1),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
            },
        },
        async (args) => {
            const payments = (await ctx.client.invoicePayments.list({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            })) as unknown[];
            const items = Array.isArray(payments) ? payments : [];
            return successResult("clockify_invoices_payments_list", items, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                count: items.length,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_payments_create",
        {
            title: "Record an invoice payment",
            description:
                "Record one payment against an invoice. `amount` is in MINOR units (cents). Payments are additive and the API does not deduplicate, so a repeated call records a second payment. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                invoiceId: z.string().min(1),
                amount: zNumberLike(z.number().int().positive()).describe(
                    "Payment amount in minor units (cents).",
                ),
                paymentDate: z
                    .string()
                    .min(1)
                    .optional()
                    .describe("RFC3339 timestamp; the API defaults to now when omitted."),
                note: z.string().optional(),
            },
        },
        {
            preview: (args) =>
                ({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    body: {
                        amount: args.amount,
                        ...(args.paymentDate !== undefined ? { paymentDate: args.paymentDate } : {}),
                        ...(args.note !== undefined ? { note: args.note } : {}),
                    },
                }) satisfies ClockifyApi.AddInvoicePaymentRequest,
            execute: async (request) => {
                const created = await ctx.client.invoicePayments.create(request);
                return successResult(
                    "clockify_invoices_payments_create",
                    created,
                    { workspaceId: request.workspaceId, invoiceId: request.invoiceId },
                    writeReceipt("created", "invoice_payment", request.invoiceId, {
                        next: [
                            {
                                tool: "clockify_invoices_payments_list",
                                args: { invoiceId: request.invoiceId },
                                reason: "Read back the recorded payments and the invoice balance.",
                            },
                        ],
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_payments_delete",
        {
            title: "Delete an invoice payment",
            description:
                "Permanently remove one recorded payment from an invoice, which changes the invoice balance and may move its status. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                invoiceId: z.string().min(1),
                paymentId: z.string().min(1),
            },
        },
        {
            preview: (args) => ({
                action: "delete",
                entity: "invoice_payment",
                id: args.paymentId,
                request: {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    paymentId: args.paymentId,
                } satisfies ClockifyApi.DeleteInvoicePaymentsRequest,
            }),
            execute: async (preview) => {
                await ctx.client.invoicePayments.delete(preview.request);
                return successResult(
                    "clockify_invoices_payments_delete",
                    { deleted: true, paymentId: preview.id },
                    {
                        workspaceId: preview.request.workspaceId,
                        invoiceId: preview.request.invoiceId,
                    },
                    writeReceipt("deleted", "invoice_payment", preview.id, {
                        next: [
                            {
                                tool: "clockify_invoices_payments_list",
                                args: { invoiceId: preview.request.invoiceId },
                                reason: "Confirm the removal and the resulting balance.",
                            },
                        ],
                    }),
                );
            },
        },
    );
}
