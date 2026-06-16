/**
 * Build a safe `PUT /invoices/{id}` body for a client invoice. Clockify's invoice
 * update is REPLACE semantics: fields you omit are wiped, and the GET returns
 * tax/discount as ×100 integers while the PUT wants `*Percent` floats. The
 * `invoice-body` helper carries forward the editable fields and maps the percent
 * scale so you don't silently zero out tax/discount.
 *
 * Env: none (this example is pure — it builds a body from a fixture).
 * Mode: mock-safe — makes no API calls.
 * Cleanup: none.
 * Expected output:
 *   PUT body preserves tax/discount: { ..., taxPercent: 20, discountPercent: 10, ... }
 *
 * Run: `npx tsx examples/invoice-client.ts`
 */
import { invoiceUpdateBodyFromExisting } from "clockify-sdk-ts-115";

// Pretend this came from `client.invoices.get({ workspaceId, invoiceId })`.
const existingInvoice = {
    id: "invoice_123",
    number: "INV-2026-001",
    note: "Thanks for your business",
    tax: 2000, // ×100 integer on the GET → 20%
    discount: 1000, // ×100 integer on the GET → 10%
    currency: "USD",
};

// Carry everything forward, change only the note.
const body = invoiceUpdateBodyFromExisting(existingInvoice, {
    note: "Updated note — net 30",
});

console.log("PUT body preserves tax/discount:", body);
if (body.taxPercent !== 20 || body.discountPercent !== 10) {
    console.error("tax/discount were not preserved — this would over/under-bill the client");
    process.exit(1);
}
