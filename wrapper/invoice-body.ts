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
    patch: Record<string, unknown> = {},
): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const key of INVOICE_EDITABLE_FIELDS) {
        if (existing[key] !== undefined) body[key] = existing[key];
    }
    for (const [getKey, putKey] of INVOICE_PERCENT_FIELD_MAP) {
        const value = existing[getKey];
        if (typeof value === "number") body[putKey] = value / 100;
    }
    // The caller's patch wins — including an explicit *Percent override.
    Object.assign(body, patch);
    return body;
}
