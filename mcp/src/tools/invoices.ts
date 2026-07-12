/**
 * Invoice tools — wraps client.invoices.{list, filter, get, create, update,
 * delete, updateStatus, export, import} and client.invoicePayments.list.
 * `clockify_invoices_info` hits the richer POST /invoices/info projection;
 * `clockify_invoices_items_list` is a focused view over the GET (which also
 * returns line items); `clockify_invoices_payments_list` reads recorded
 * payments.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { invoiceUpdateBodyFromExisting } from "clockify-sdk-ts-115/invoice-body";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../result.js";

const INVOICE_STATUSES = ["UNSENT", "SENT", "PAID", "PARTIALLY_PAID", "VOID", "OVERDUE"] as const;
const INVOICE_SORT_COLUMNS = ["ID", "CLIENT", "DUE_ON", "ISSUE_DATE", "AMOUNT", "BALANCE"] as const;
const INVOICE_SORT_ORDERS = ["ASCENDING", "DESCENDING"] as const;
type InvoiceObject = Record<string, unknown>;
type InvoiceUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateInvoicesRequest>;
type InvoicePatch = Partial<InvoiceUpdateBody>;

function invoiceUpdateBody(existing: InvoiceObject, patch: InvoicePatch): InvoiceUpdateBody {
    return invoiceUpdateBodyFromExisting(existing, patch);
}

function sameInvoiceBody(left: InvoiceUpdateBody, right: InvoiceUpdateBody): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

// Clockify invoice endpoints require RFC3339 datetimes; promote
// date-only input (YYYY-MM-DD) to midnight UTC so CLI users typing
// natural dates don't 400.
function normaliseInvoiceDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

const invoiceDateSchema = z
    .string()
    .min(1)
    .refine(
        (value) => Number.isFinite(Date.parse(normaliseInvoiceDate(value))),
        "must be a valid date or RFC3339 datetime",
    );

export function registerInvoicesTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_invoices_list",
        {
            title: "List invoices",
            description:
                "List invoices in the pinned workspace, optionally filtered by one or more invoice statuses and sorted by a column/order.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                // Accept a single status (back-compat) or several; both fold into the
                // typed `statuses` array the GET route honours.
                status: z.enum(INVOICE_STATUSES).optional(),
                statuses: z.array(z.enum(INVOICE_STATUSES)).optional(),
                sortColumn: z
                    .enum(INVOICE_SORT_COLUMNS)
                    .optional()
                    .describe("Sort column: ID | CLIENT | DUE_ON | ISSUE_DATE | AMOUNT | BALANCE."),
                sortOrder: z
                    .enum(INVOICE_SORT_ORDERS)
                    .optional()
                    .describe("Sort order: ASCENDING | DESCENDING."),
            },
        },
        async (args) => {
            // ListInvoicesRequest is typed for the live GET route: `statuses` is an
            // InvoiceStatus[] and `sort-column`/`sort-order` are first-class query params,
            // so no untyped escape is needed. Merge single `status` + `statuses[]` and
            // dedupe so callers can use either shape.
            const statuses = [
                ...(args.status ? [args.status] : []),
                ...(args.statuses ?? []),
            ].filter((s, i, all) => all.indexOf(s) === i);
            const req: ClockifyApi.ListInvoicesRequest = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (statuses.length > 0) req.statuses = statuses;
            if (args.sortColumn) req["sort-column"] = args.sortColumn;
            if (args.sortOrder) req["sort-order"] = args.sortOrder;
            const response = (await ctx.client.invoices.list(req)) as
                | { invoices?: unknown[]; total?: number }
                | unknown[];
            const invoices = Array.isArray(response) ? response : (response.invoices ?? []);
            const total = Array.isArray(response)
                ? invoices.length
                : (response.total ?? invoices.length);
            return successResult("clockify_invoices_list", invoices, {
                workspaceId: ctx.workspaceId,
                count: invoices.length,
                total,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
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

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_create",
        {
            title: "Create an invoice draft",
            description:
                "Draft a new invoice. Dates accept YYYY-MM-DD (promoted to midnight UTC) or full RFC3339.",
            inputSchema: {
                clientId: z.string().min(1),
                number: z.string().min(1),
                currency: z.string().min(1).describe("ISO currency code, e.g. USD."),
                issuedDate: invoiceDateSchema,
                dueDate: invoiceDateSchema,
                timeViewMode: z.enum(["TIME_SENSITIVE_VIEW", "AGGREGATED_TIME_VIEW"]).optional(),
                note: z
                    .string()
                    .optional()
                    .describe(
                        "Not accepted on create; create the draft, then use invoices_update.",
                    ),
                subject: z
                    .string()
                    .optional()
                    .describe(
                        "Not accepted on create; create the draft, then use invoices_update.",
                    ),
            },
        },
        {
            preview: async (args) => {
                if (args.note !== undefined || args.subject !== undefined) {
                    throw new TypeError(
                        "Clockify drops note and subject on invoice creation. Create the draft first, then call guarded clockify_invoices_update with the returned invoiceId.",
                    );
                }
                const body: ClockifyRequestBody<ClockifyApi.InvoiceCreateRequest> = {
                    clientId: args.clientId,
                    number: args.number,
                    currency: args.currency,
                    issuedDate: normaliseInvoiceDate(args.issuedDate),
                    dueDate: normaliseInvoiceDate(args.dueDate),
                };
                if (args.timeViewMode !== undefined) body.timeViewMode = args.timeViewMode;
                return {
                    action: "create",
                    entity: "invoice",
                    number: args.number,
                    request: { workspaceId: ctx.workspaceId, body },
                };
            },
            execute: async (preview) => {
                const created = (await ctx.client.invoices.create(preview.request)) as {
                    id?: string;
                };
                return successResult(
                    "clockify_invoices_create",
                    created,
                    {
                        workspaceId: ctx.workspaceId,
                    },
                    writeReceipt("created", "invoice", { id: created?.id, name: preview.number }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_update",
        {
            title: "Update an invoice",
            description:
                "Update invoice metadata. Reads the invoice then replaces it, preserving untouched fields and mapping tax/discount correctly. Status changes go through clockify_invoices_update_status.",
            inputSchema: {
                invoiceId: z.string().min(1),
                clientId: z.string().min(1).optional(),
                number: z.string().min(1).optional(),
                currency: z.string().min(1).optional(),
                issuedDate: invoiceDateSchema.optional(),
                dueDate: invoiceDateSchema.optional(),
                note: z.string().optional(),
                subject: z.string().optional(),
                taxPercent: z
                    .number()
                    .min(0)
                    .max(100)
                    .optional()
                    .describe("Primary tax rate as a percent (e.g. 15 for 15%)."),
                tax2Percent: z
                    .number()
                    .min(0)
                    .max(100)
                    .optional()
                    .describe("Secondary tax rate as a percent."),
                discountPercent: z
                    .number()
                    .min(0)
                    .max(100)
                    .optional()
                    .describe("Discount as a percent."),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                // PUT /invoices REPLACES the document, and tax/discount are asymmetric
                // on the wire (GET returns discount/tax/tax2 ×100 ints; PUT wants
                // *Percent). Read the current invoice and rebuild a clean body so a
                // sparse update never wipes untouched fields or silently zeroes
                // tax/discount.
                const existing = (await ctx.client.invoices.get({
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                })) as InvoiceObject;
                const patch: InvoicePatch = {};
                if (args.clientId !== undefined) patch.clientId = args.clientId;
                if (args.number !== undefined) patch.number = args.number;
                if (args.currency !== undefined) patch.currency = args.currency;
                if (args.issuedDate !== undefined)
                    patch.issuedDate = normaliseInvoiceDate(args.issuedDate);
                if (args.dueDate !== undefined) patch.dueDate = normaliseInvoiceDate(args.dueDate);
                if (args.note !== undefined) patch.note = args.note;
                if (args.subject !== undefined) patch.subject = args.subject;
                if (args.taxPercent !== undefined) patch.taxPercent = args.taxPercent;
                if (args.tax2Percent !== undefined) patch.tax2Percent = args.tax2Percent;
                if (args.discountPercent !== undefined)
                    patch.discountPercent = args.discountPercent;
                if (Object.keys(patch).length === 0) {
                    throw new TypeError(
                        "Invoice update is a no-op; supply at least one changed field.",
                    );
                }
                const currentBody = invoiceUpdateBody(existing, {});
                const body = invoiceUpdateBody(existing, patch);
                if (sameInvoiceBody(currentBody, body)) {
                    throw new TypeError(
                        "Invoice update is a no-op; supplied fields match current state.",
                    );
                }
                const request: ClockifyApi.UpdateInvoicesRequest = {
                    ...body,
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                };
                return { action: "update", entity: "invoice", id: args.invoiceId, request };
            },
            execute: async (preview) => {
                const updated = await ctx.client.invoices.update(preview.request);
                return successResult(
                    "clockify_invoices_update",
                    updated,
                    { workspaceId: ctx.workspaceId, invoiceId: preview.id },
                    writeReceipt("updated", "invoice", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_delete",
        {
            title: "Delete an invoice",
            description:
                "Permanently delete an invoice. Billing-impactful; coordinate before running. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: { invoiceId: z.string().min(1) },
        },
        {
            preview: async (args) => ({
                action: "delete",
                entity: "invoice",
                id: args.invoiceId,
                request: { workspaceId: ctx.workspaceId, invoiceId: args.invoiceId },
            }),
            execute: async (preview) => {
                await ctx.client.invoices.delete(preview.request);
                return successResult(
                    "clockify_invoices_delete",
                    { deleted: true, invoiceId: preview.id },
                    { workspaceId: ctx.workspaceId, invoiceId: preview.id },
                    writeReceipt("deleted", "invoice", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_update_status",
        {
            title: "Update invoice status",
            description:
                "Move an invoice between statuses (UNSENT, SENT, PAID, PARTIALLY_PAID, VOID, OVERDUE).",
            inputSchema: {
                invoiceId: z.string().min(1),
                status: z.enum(INVOICE_STATUSES),
            },
            idempotent: true,
        },
        {
            preview: async (args) => ({
                action: "update_status",
                entity: "invoice",
                id: args.invoiceId,
                status: args.status,
                request: {
                    workspaceId: ctx.workspaceId,
                    invoiceId: args.invoiceId,
                    body: { invoiceStatus: args.status },
                },
            }),
            execute: async (preview) => {
                const updated = await ctx.client.invoices.updateStatus(preview.request);
                return successResult(
                    "clockify_invoices_update_status",
                    updated,
                    { workspaceId: ctx.workspaceId, invoiceId: preview.id },
                    writeReceipt("updated", "invoice", preview.id),
                );
            },
        },
    );

    defineTool(
        server,
        "clockify_invoices_export",
        {
            title: "Export an invoice (PDF)",
            description:
                "Export an invoice. Clockify supports PDF only at this endpoint; use clockify_reports_export for CSV/XLSX data.",
            inputSchema: {
                invoiceId: z.string().min(1),
                userLocale: z
                    .string()
                    .optional()
                    .describe("Locale for the rendered document, e.g. en-US."),
            },
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

    defineGuardedTool(
        server,
        ctx,
        "clockify_invoices_import_time",
        {
            title: "Import time into an invoice",
            description:
                "Import time entries (and optionally expenses) into an existing invoice over a date range.",
            inputSchema: {
                invoiceId: z.string().min(1),
                from: invoiceDateSchema.describe("ISO start of the import window"),
                to: invoiceDateSchema.describe("ISO end of the import window"),
                importExpenses: z.boolean().default(false).optional(),
                timeEntryGroupType: z
                    .enum(["SINGLE_ITEM", "GROUPED", "DETAILED"])
                    .default("GROUPED")
                    .optional(),
                projectFilter: z
                    .object({
                        contains: z
                            .enum(["CONTAINS", "DOES_NOT_CONTAIN", "CONTAINS_ONLY"])
                            .optional(),
                        ids: z.array(z.string()).optional(),
                        status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE").optional(),
                    })
                    .strict()
                    .optional()
                    .describe('Project filter; status is required, e.g. { "status": "ACTIVE" }'),
                expenseFieldsForDetailedGroup: z
                    .array(z.enum(["PROJECT", "TASK", "CATEGORY", "NOTE", "DATE", "USER"]))
                    .optional(),
                expensesGroupBy: z.enum(["CATEGORY", "PROJECT", "USER"]).optional(),
                expensesGroupType: z.enum(["GROUPED", "DETAILED"]).optional(),
                roundTimeEntryDuration: z.boolean().optional(),
                timeEntryFieldsForDetailedGroup: z
                    .array(z.enum(["PROJECT", "TASK", "TAGS", "DESCRIPTION", "DATE", "USER"]))
                    .optional(),
                timeEntryPrimaryGroupBy: z.enum(["USER", "PROJECT", "DATE"]).optional(),
                timeEntrySecondaryGroupBy: z
                    .enum(["PROJECT", "USER", "TASK", "DATE", "DESCRIPTION", "NONE"])
                    .optional(),
            },
        },
        {
            preview: async (args) => {
                const { invoiceId, projectFilter } = args;
                const typedProjectFilter: ClockifyApi.ContainsArchivedFilterRequest = {
                    status: projectFilter?.status ?? "ACTIVE",
                };
                if (projectFilter?.contains !== undefined) {
                    typedProjectFilter.contains = projectFilter.contains;
                }
                if (projectFilter?.ids !== undefined) typedProjectFilter.ids = projectFilter.ids;
                const body: ClockifyRequestBody<ClockifyApi.ImportInvoiceItemsRequest> = {
                    from: args.from,
                    to: args.to,
                    importExpenses: args.importExpenses ?? false,
                    timeEntryGroupType: args.timeEntryGroupType ?? "GROUPED",
                    projectFilter: typedProjectFilter,
                };
                if (args.expenseFieldsForDetailedGroup !== undefined) {
                    body.expenseFieldsForDetailedGroup = args.expenseFieldsForDetailedGroup;
                }
                if (args.expensesGroupBy !== undefined) body.expensesGroupBy = args.expensesGroupBy;
                if (args.expensesGroupType !== undefined)
                    body.expensesGroupType = args.expensesGroupType;
                if (args.roundTimeEntryDuration !== undefined) {
                    body.roundTimeEntryDuration = args.roundTimeEntryDuration;
                }
                if (args.timeEntryFieldsForDetailedGroup !== undefined) {
                    body.timeEntryFieldsForDetailedGroup = args.timeEntryFieldsForDetailedGroup;
                }
                if (args.timeEntryPrimaryGroupBy !== undefined) {
                    body.timeEntryPrimaryGroupBy = args.timeEntryPrimaryGroupBy;
                }
                if (args.timeEntrySecondaryGroupBy !== undefined) {
                    body.timeEntrySecondaryGroupBy = args.timeEntrySecondaryGroupBy;
                }
                const request: ClockifyApi.ImportInvoiceItemsRequest = {
                    workspaceId: ctx.workspaceId,
                    invoiceId,
                    body,
                };
                return { action: "import_time", entity: "invoice", id: invoiceId, request };
            },
            execute: async (preview) => {
                const imported = await ctx.client.invoiceItems.import(preview.request);
                return successResult("clockify_invoices_import_time", imported, {
                    workspaceId: ctx.workspaceId,
                    invoiceId: preview.id,
                });
            },
        },
    );

    defineTool(
        server,
        "clockify_invoices_info",
        {
            title: "Filter invoice info",
            description:
                "Search invoice 'info' records (POST /invoices/info) by status / invoice-number filters, sorted and paginated. Complements clockify_invoices_list with the richer info projection.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                statuses: z.array(z.enum(INVOICE_STATUSES)).optional(),
                invoiceNumber: z
                    .string()
                    .optional()
                    .describe("Filter by a substring of the invoice number."),
                strictSearch: z
                    .boolean()
                    .optional()
                    .describe("When true, invoiceNumber must match exactly."),
                sortColumn: z
                    .enum(INVOICE_SORT_COLUMNS)
                    .optional()
                    .describe("Sort column: ID | CLIENT | DUE_ON | ISSUE_DATE | AMOUNT | BALANCE."),
                sortOrder: z
                    .enum(INVOICE_SORT_ORDERS)
                    .optional()
                    .describe("Sort order: ASCENDING | DESCENDING."),
            },
        },
        async (args) => {
            const response = (await ctx.client.invoices.filter({
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
                ...(args.statuses && args.statuses.length > 0 ? { statuses: args.statuses } : {}),
                ...(args.invoiceNumber ? { invoiceNumber: args.invoiceNumber } : {}),
                ...(args.strictSearch !== undefined ? { strictSearch: args.strictSearch } : {}),
                ...(args.sortColumn ? { sortColumn: args.sortColumn } : {}),
                ...(args.sortOrder ? { sortOrder: args.sortOrder } : {}),
            })) as { invoices?: unknown[]; total?: number } | unknown[];
            const invoices = Array.isArray(response) ? response : (response.invoices ?? []);
            const total = Array.isArray(response)
                ? invoices.length
                : (response.total ?? invoices.length);
            return successResult("clockify_invoices_info", invoices, {
                workspaceId: ctx.workspaceId,
                count: invoices.length,
                total,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
            });
        },
    );

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
}
