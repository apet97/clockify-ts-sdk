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
import { collectPagedList } from "../paging.js";

/** One page big enough that a normal invoice's payments fit in a single read. */
const PAYMENT_PAGE_SIZE = 200;
/** Backstop so a server that ignores paging cannot spin the id recovery forever. */
const MAX_PAYMENT_PAGES = 25;

/**
 * Every payment id on an invoice, read through the whole paginated list.
 *
 * Page 1 alone is not enough: an invoice with more payments than one page holds
 * would hide the new id from the recovery diff, which would then report a
 * successful write as inconclusive.
 */
async function listPaymentIds(ctx: Context, invoiceId: string): Promise<Set<string>> {
    const items = await collectPagedList(
        (page) =>
            ctx.client.invoicePayments.list({
                workspaceId: ctx.workspaceId,
                invoiceId,
                page,
                "page-size": PAYMENT_PAGE_SIZE,
            }),
        { pageSize: PAYMENT_PAGE_SIZE, maxPages: MAX_PAYMENT_PAGES },
    );
    return new Set(
        items
            .map((item) => (item as { id?: unknown }).id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
}

/**
 * The single payment id that appeared between two reads of the payments list,
 * or `undefined` when the diff cannot name one.
 *
 * `POST /invoices/{id}/payments` answers with the updated INVOICE, not the
 * created payment (live-proven — `invoices.payments.post-returns-invoice` in
 * `spec/evidence/discrepancies.md`), so the id has to be recovered by diffing
 * ids around the write. A zero-sized diff (a read that missed it) and an
 * ambiguous diff (a concurrent writer added one too) are both reported rather
 * than guessed: naming the wrong id sends a caller's reconcile or delete at the
 * wrong record.
 */
export function recoverCreatedPaymentId(before: ReadonlySet<string>, after: ReadonlySet<string>): string | undefined {
    const added = [...after].filter((id) => !before.has(id));
    return added.length === 1 ? added[0] : undefined;
}

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
                "Record one payment against an invoice. `amount` is in MINOR units (cents). Payments are additive and the API does not deduplicate, so a repeated call records a second payment. The API answers with the updated invoice, so `data.paymentId` is recovered by diffing the payments list around the write and is null when the diff names no single new payment. Run dry_run first, then retry with the returned confirm_token.",
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
            // The two list reads are execution-time observation around the POST,
            // not name resolution, so the stored preview stays byte-identical and
            // the confirm_token keeps its integrity payload.
            execute: async (request) => {
                const before = await listPaymentIds(ctx, request.invoiceId);
                const invoice = await ctx.client.invoicePayments.create(request);
                const paymentId = recoverCreatedPaymentId(before, await listPaymentIds(ctx, request.invoiceId));
                const next = [
                    {
                        tool: "clockify_invoices_payments_list",
                        args: { invoiceId: request.invoiceId },
                        reason: "Read back the recorded payments and the invoice balance.",
                    },
                ];
                if (paymentId === undefined) {
                    return successResult(
                        "clockify_invoices_payments_create",
                        { invoice, paymentId: null },
                        { workspaceId: request.workspaceId, invoiceId: request.invoiceId },
                        {
                            entity: "invoice_payment",
                            warnings: [
                                {
                                    code: "payment_id_unrecovered",
                                    message:
                                        "The payment was recorded, but its id could not be recovered: the payments list gained no single new id (a concurrent writer, or a read that missed it). List the payments to identify it before any reconcile or delete.",
                                },
                            ],
                            next,
                        },
                    );
                }
                return successResult(
                    "clockify_invoices_payments_create",
                    { invoice, paymentId },
                    { workspaceId: request.workspaceId, invoiceId: request.invoiceId },
                    writeReceipt("created", "invoice_payment", paymentId, { next }),
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
