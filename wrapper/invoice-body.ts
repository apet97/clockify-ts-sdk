/**
 * Pure helper for building a safe `PUT /invoices/{id}` body. No I/O — the caller
 * GETs the current invoice and passes it in, then PUTs the returned body.
 *
 * Two live-verified Clockify quirks (ai-assistant addon, June 2026) make a naive
 * `update(patch)` silently corrupt invoices:
 *
 *  1. **PUT replaces the whole document.** A sparse body drops every field it
 *     omits (note, subject, billFrom, clientAddress, …). So the body is rebuilt
 *     from the current invoice's editable fields, then the patch is overlaid.
 *     Read-only/computed fields the GET returns (amount, balance, items, status,
 *     subtotal, taxAmount, …) are deliberately NOT copied — the PUT rejects them.
 *  2. **Tax/discount are asymmetric on the wire.** The GET returns
 *     `discount`/`tax`/`tax2` as ×100-scaled integers (10% reads back as `1000`),
 *     but the PUT body wants `discountPercent`/`taxPercent`/`tax2Percent` as plain
 *     percents. Copying the GET names verbatim silently ZEROES tax/discount on
 *     every update. This maps name AND scale (÷100); a `*Percent` value supplied
 *     in `patch` overrides the carried-forward one.
 *
 * Status changes do NOT go through this body — Clockify uses a separate
 * `PATCH /invoices/{id}/status` endpoint for those.
 */

import type { ClockifyApi, ClockifyRequestBody } from "./requests.js";

type InvoiceUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateInvoicesRequest>;

/**
 * Invoice fields that are safe to send back on a PUT. Mirrors the editable
 * surface Clockify accepts; everything else the GET returns is read-only or
 * computed and would be rejected.
 */
export const INVOICE_EDITABLE_FIELDS = [
    "clientId",
    "companyId",
    "currency",
    "dueDate",
    "issuedDate",
    "billFrom",
    "clientAddress",
    "note",
    "number",
    "subject",
    "taxType",
    "visibleZeroFields",
] as const;

/**
 * GET field name → PUT field name for the three percent fields. The PUT also
 * needs the value divided by 100 (see {@link invoiceUpdateBodyFromExisting}).
 */
export const INVOICE_PERCENT_FIELD_MAP: ReadonlyArray<readonly [getKey: string, putKey: string]> = [
    ["discount", "discountPercent"],
    ["tax", "taxPercent"],
    ["tax2", "tax2Percent"],
];

/**
 * Build a clean PUT body from the current invoice (a GET response) plus an
 * optional patch. See the module doc for the two quirks this guards against.
 */
export function invoiceUpdateBodyFromExisting(
    existing: Record<string, unknown>,
    patch: Partial<InvoiceUpdateBody> = {},
): InvoiceUpdateBody {
    const taxTypes = new Set<ClockifyApi.TaxType>(["COMPOUND", "SIMPLE", "NONE"]);
    const zeroFields = new Set<ClockifyApi.VisibleZeroFieldsInvoice>(["TAX", "TAX_2", "DISCOUNT"]);
    const taxType = taxTypes.has(existing.taxType as ClockifyApi.TaxType)
        ? (existing.taxType as ClockifyApi.TaxType)
        : undefined;
    const visibleZeroFields = validVisibleZeroFields(existing.visibleZeroFields, zeroFields);
    const candidate: Partial<InvoiceUpdateBody> = {
        ...(typeof existing.billFrom === "string" ? { billFrom: existing.billFrom } : {}),
        ...(typeof existing.clientAddress === "string"
            ? { clientAddress: existing.clientAddress }
            : {}),
        ...(typeof existing.clientId === "string" ? { clientId: existing.clientId } : {}),
        ...(typeof existing.companyId === "string" ? { companyId: existing.companyId } : {}),
        ...(typeof existing.currency === "string" ? { currency: existing.currency } : {}),
        ...(typeof existing.dueDate === "string" ? { dueDate: existing.dueDate } : {}),
        ...(typeof existing.issuedDate === "string" ? { issuedDate: existing.issuedDate } : {}),
        ...(typeof existing.note === "string" ? { note: existing.note } : {}),
        ...(typeof existing.number === "string" ? { number: existing.number } : {}),
        ...(typeof existing.subject === "string" ? { subject: existing.subject } : {}),
        ...(taxType !== undefined ? { taxType } : {}),
        ...(visibleZeroFields !== undefined ? { visibleZeroFields } : {}),
        ...(typeof existing.discount === "number"
            ? { discountPercent: existing.discount / 100 }
            : {}),
        ...(typeof existing.tax === "number" ? { taxPercent: existing.tax / 100 } : {}),
        ...(typeof existing.tax2 === "number" ? { tax2Percent: existing.tax2 / 100 } : {}),
        ...patch,
    };

    return {
        ...candidate,
        currency: requiredString(candidate.currency, "currency"),
        discountPercent: requiredNumber(candidate.discountPercent, "discountPercent"),
        dueDate: requiredDate(candidate.dueDate, "dueDate"),
        issuedDate: requiredDate(candidate.issuedDate, "issuedDate"),
        number: requiredString(candidate.number, "number"),
        tax2Percent: requiredNumber(candidate.tax2Percent, "tax2Percent"),
        taxPercent: requiredNumber(candidate.taxPercent, "taxPercent"),
    };
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new TypeError(`Cannot reconstruct invoice replacement: ${field} is required.`);
    }
    return value;
}

function requiredDate(value: unknown, field: string): string {
    const date = requiredString(value, field);
    if (!Number.isFinite(Date.parse(date))) {
        throw new TypeError(`Cannot reconstruct invoice replacement: ${field} must be a date.`);
    }
    return date;
}

function requiredNumber(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`Cannot reconstruct invoice replacement: ${field} is required.`);
    }
    return value;
}

function validVisibleZeroFields(
    value: unknown,
    allowed: ReadonlySet<ClockifyApi.VisibleZeroFieldsInvoice>,
): InvoiceUpdateBody["visibleZeroFields"] | undefined {
    if (typeof value === "string" && allowed.has(value as ClockifyApi.VisibleZeroFieldsInvoice)) {
        return value as ClockifyApi.VisibleZeroFieldsInvoice;
    }
    if (
        Array.isArray(value) &&
        value.every(
            (item): item is ClockifyApi.VisibleZeroFieldsInvoice =>
                typeof item === "string" &&
                allowed.has(item as ClockifyApi.VisibleZeroFieldsInvoice),
        )
    ) {
        return value;
    }
    return undefined;
}
