import { describe, expect, it } from "vitest";

import { invoiceUpdateBodyFromExisting } from "../invoice-body.js";

/** A representative GET /invoices/{id} response (trimmed to the relevant fields). */
function existingInvoice(): Record<string, unknown> {
    return {
        id: "inv-1",
        clientId: "client-1",
        currency: "USD",
        number: "INV-001",
        issuedDate: "2026-06-01T00:00:00Z",
        dueDate: "2026-07-01T00:00:00Z",
        note: "Original note",
        subject: "Original subject",
        billFrom: "ACME Inc.",
        clientAddress: "1 Main St",
        taxType: "PERCENT",
        // Tax/discount come back ×100-scaled on the GET.
        discount: 1000, // 10%
        tax: 1500, // 15%
        tax2: 0,
        // Read-only / computed fields the PUT rejects — must NOT be copied.
        amount: 99999,
        balance: 50000,
        status: "SENT",
        subtotal: 90000,
        taxAmount: 1350,
        items: [{ description: "Work", quantity: 1, unitPrice: 9000000 }],
    };
}

describe("invoiceUpdateBodyFromExisting", () => {
    it("maps GET tax/discount (×100 ints) to PUT *Percent names AND divides by 100", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice());
        expect(body.discountPercent).toBe(10);
        expect(body.taxPercent).toBe(15);
        expect(body.tax2Percent).toBe(0);
        // The raw GET names must NOT leak into the PUT body.
        expect(body.discount).toBeUndefined();
        expect(body.tax).toBeUndefined();
        expect(body.tax2).toBeUndefined();
    });

    it("rebuilds the full editable set so a sparse update never wipes fields", () => {
        // Patch only the currency; note/subject/billFrom/clientAddress must survive.
        const body = invoiceUpdateBodyFromExisting(existingInvoice(), { currency: "EUR" });
        expect(body.currency).toBe("EUR");
        expect(body.note).toBe("Original note");
        expect(body.subject).toBe("Original subject");
        expect(body.billFrom).toBe("ACME Inc.");
        expect(body.clientAddress).toBe("1 Main St");
        expect(body.number).toBe("INV-001");
        // Tax/discount survive a metadata-only patch (the silent-zeroing bug).
        expect(body.taxPercent).toBe(15);
        expect(body.discountPercent).toBe(10);
    });

    it("never copies read-only/computed fields the PUT rejects", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice());
        for (const readOnly of ["amount", "balance", "status", "subtotal", "taxAmount", "items", "id"]) {
            expect(body[readOnly]).toBeUndefined();
        }
    });

    it("lets a caller's *Percent patch override the carried-forward value", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice(), { taxPercent: 20, discountPercent: 0 });
        expect(body.taxPercent).toBe(20);
        expect(body.discountPercent).toBe(0);
    });

    it("applies note/subject from the patch (the create-time follow-up path)", () => {
        // Create POSTs a placeholder note/subject; the follow-up PUT applies the real ones.
        const placeholder = { clientId: "c1", currency: "USD", note: "INPUT BILL INFO HERE", subject: "SUBJECT" };
        const body = invoiceUpdateBodyFromExisting(placeholder, { note: "Real note", subject: "Real subject" });
        expect(body.note).toBe("Real note");
        expect(body.subject).toBe("Real subject");
    });

    it("omits a percent field that is absent or non-numeric on the GET", () => {
        const body = invoiceUpdateBodyFromExisting({ clientId: "c1", tax: "oops" as unknown as number });
        expect(body.taxPercent).toBeUndefined();
        expect(body.discountPercent).toBeUndefined();
    });
});
