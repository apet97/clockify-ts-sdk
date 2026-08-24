/**
 * Invoice line-item tools — wraps `client.invoiceItems.{create, delete}` plus
 * a focused read over `client.invoices.get` (the GET returns the line items,
 * so the list tool projects them out rather than calling a second route).
 *
 * Line items are addressed by their `order` position, not by an id, and a
 * delete renumbers the rest.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { invoiceItemUnitPriceToWire } from "clockify-sdk-ts-115/money";
import { type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../../result.js";

const INVOICE_ITEM_TAXES = ["TAX1", "TAX2", "TAX1TAX2", "NONE"] as const satisfies readonly ClockifyApi.ApplyTaxes[];

export function registerInvoiceItemTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_invoices_items_list",
        {
            title: "List invoice line items",
            description:
                "Return just the line items of an invoice — a focused projection of clockify_invoices_get for when only the items matter.",
            inputSchema: { invoiceId: z.string().min(1) },
        },
        async (args) => {
            const invoice = (await ctx.client.invoices.get({
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
            })) as { items?: unknown[] };
            const items = Array.isArray(invoice.items) ? invoice.items : [];
            return successResult("clockify_invoices_items_list", items, {
                workspaceId: ctx.workspaceId,
                invoiceId: args.invoiceId,
                count: items.length,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_items_add",
        {
            title: "Add an invoice line item",
            description:
                "Append one line item to an existing invoice. Give `unitPrice` in the workspace currency's MINOR units (cents) — the tool scales it to the item wire value for you. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                invoiceId: z.string().min(1),
                description: z.string().min(1),
                itemType: z
                    .string()
                    .min(1)
                    .describe(
                        "Name of an EXISTING workspace invoice item type. Item types are created in the Clockify UI and there is no API route that lists them; the API rejects an unknown name with 404 \"Invoice item type with name X not found\". Read an existing invoice with clockify_invoices_items_list to see the names this workspace uses.",
                    ),
                quantity: zNumberLike(z.number().positive()),
                unitPrice: zNumberLike(z.number().int()).describe(
                    "Unit price in minor units (cents), for example 100000 for 1,000.00.",
                ),
                applyTaxes: z.enum(INVOICE_ITEM_TAXES).default("NONE"),
            },
        },
        {
            // The stored preview IS the request body, so the ×100 scale is applied
            // here rather than in `execute`: an operator confirming a dry_run sees
            // the exact bytes the write will send. `invoiceItemUnitPriceToWire`
            // throws RangeError above the exact-integer envelope, which the guarded
            // tool surfaces as a clean tool error instead of a silent overflow.
            preview: (args) =>
                ({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    body: {
                        applyTaxes: args.applyTaxes ?? "NONE",
                        description: args.description,
                        itemType: args.itemType,
                        quantity: args.quantity,
                        unitPrice: invoiceItemUnitPriceToWire(args.unitPrice),
                    },
                }) satisfies ClockifyApi.AddInvoiceItemRequest,
            execute: async (request) => {
                const updated = await ctx.client.invoiceItems.create(request);
                return successResult(
                    "clockify_invoices_items_add",
                    updated,
                    { workspaceId: request.workspaceId, invoiceId: request.invoiceId },
                    {
                        entity: "invoice_item",
                        ids: {
                            workspaceId: request.workspaceId,
                            invoiceId: request.invoiceId,
                        },
                        warnings: [
                            {
                                code: "invoice_item_id_unavailable",
                                message:
                                    "The line item was added, but invoice items have no stable id. Read the invoice items to get the new order value before a later delete.",
                            },
                        ],
                        next: [
                            {
                                tool: "clockify_invoices_items_list",
                                args: { invoiceId: request.invoiceId },
                                reason: "Read back the line items and their order values.",
                            },
                        ],
                    },
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_items_delete",
        {
            title: "Delete an invoice line item",
            description:
                "Permanently remove one line item from an invoice. The item is addressed by its `order` position, not by an id — read clockify_invoices_items_list first, because deleting one item renumbers the rest. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                invoiceId: z.string().min(1),
                order: z
                    .number()
                    .int()
                    .min(1)
                    .describe("Line-item order value from clockify_invoices_items_list. 1-based."),
            },
        },
        {
            preview: (args) => ({
                action: "delete",
                entity: "invoice_item",
                id: String(args.order),
                request: {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    order: args.order,
                } satisfies ClockifyApi.DeleteInvoiceItemsRequest,
            }),
            execute: async (preview) => {
                await ctx.client.invoiceItems.delete(preview.request);
                return successResult(
                    "clockify_invoices_items_delete",
                    { deleted: true, order: preview.id },
                    {
                        workspaceId: preview.request.workspaceId,
                        invoiceId: preview.request.invoiceId,
                    },
                    writeReceipt("deleted", "invoice_item", preview.id, {
                        next: [
                            {
                                tool: "clockify_invoices_items_list",
                                args: { invoiceId: preview.request.invoiceId },
                                reason: "Confirm the removal and re-read the renumbered order values.",
                            },
                        ],
                    }),
                );
            },
        },
    );
}
