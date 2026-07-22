import { describe, expect, it } from "vitest";

import { invoiceUpdateBodyFromExisting } from "../invoice-body.js";

/** A representative GET /invoices/{id} response (trimmed to the relevant fields). */
function existingInvoice(): Record<string, unknown> {
    return {
        id: "inv-1",
        clientId: "client-1",
        companyId: "company-1",
        currency: "USD",
        number: "INV-001",
        issuedDate: "2026-06-01T00:00:00Z",
        dueDate: "2026-07-01T00:00:00Z",
        note: "Original note",
        subject: "Original subject",
        billFrom: "ACME Inc.",
        clientAddress: "1 Main St",
        taxType: "SIMPLE",
        visibleZeroFields: ["TAX", "DISCOUNT"],
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
        expect(body).not.toHaveProperty("discount");
        expect(body).not.toHaveProperty("tax");
        expect(body).not.toHaveProperty("tax2");
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

    it("carries every allowed replacement field, including tax configuration", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice());
        expect(body).toMatchObject({
            billFrom: "ACME Inc.",
            clientAddress: "1 Main St",
            clientId: "client-1",
            companyId: "company-1",
            currency: "USD",
            dueDate: "2026-07-01T00:00:00Z",
            issuedDate: "2026-06-01T00:00:00Z",
            note: "Original note",
            number: "INV-001",
            subject: "Original subject",
            taxType: "SIMPLE",
            visibleZeroFields: ["TAX", "DISCOUNT"],
        });
    });

    it("never copies read-only/computed fields the PUT rejects", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice());
        for (const readOnly of [
            "amount",
            "balance",
            "status",
            "subtotal",
            "taxAmount",
            "items",
            "id",
        ]) {
            expect(body).not.toHaveProperty(readOnly);
        }
    });

    it("lets a caller's *Percent patch override the carried-forward value", () => {
        const body = invoiceUpdateBodyFromExisting(existingInvoice(), {
            taxPercent: 20,
            discountPercent: 0,
        });
        expect(body.taxPercent).toBe(20);
        expect(body.discountPercent).toBe(0);
    });

    it("applies note/subject from the patch (the create-time follow-up path)", () => {
        // Create POSTs a placeholder note/subject; the follow-up PUT applies the real ones.
        const placeholder = {
            ...existingInvoice(),
            note: "INPUT BILL INFO HERE",
            subject: "SUBJECT",
        };
        const body = invoiceUpdateBodyFromExisting(placeholder, {
            note: "Real note",
            subject: "Real subject",
        });
        expect(body.note).toBe("Real note");
        expect(body.subject).toBe("Real subject");
    });

    it("lets a valid patch reconstruct a non-numeric GET percentage", () => {
        const body = invoiceUpdateBodyFromExisting(
            { ...existingInvoice(), tax: "oops" },
            { taxPercent: 7 },
        );
        expect(body.taxPercent).toBe(7);
    });

    it.each([
        ["currency", { ...existingInvoice(), currency: "" }],
        ["number", { ...existingInvoice(), number: "" }],
        ["issuedDate", { ...existingInvoice(), issuedDate: "not-a-date" }],
        ["dueDate", { ...existingInvoice(), dueDate: "not-a-date" }],
        ["discountPercent", { ...existingInvoice(), discount: Number.NaN }],
        ["taxPercent", { ...existingInvoice(), tax: Number.POSITIVE_INFINITY }],
        ["tax2Percent", { ...existingInvoice(), tax2: "missing" }],
    ])(
        "rejects before mutation when required replacement field %s cannot be reconstructed",
        (field, existing) => {
            expect(() => invoiceUpdateBodyFromExisting(existing)).toThrow(
                new RegExp(String(field), "i"),
            );
        },
    );

    it("preserves required zero percentages and optional empty strings", () => {
        const body = invoiceUpdateBodyFromExisting({
            ...existingInvoice(),
            billFrom: "",
            clientAddress: "",
            discount: 0,
            tax: 0,
            tax2: 0,
        });

        expect(body).toMatchObject({
            billFrom: "",
            clientAddress: "",
            discountPercent: 0,
            taxPercent: 0,
            tax2Percent: 0,
        });
    });

    it("keeps only supported visible-zero field values from the GET response", () => {
        expect(
            invoiceUpdateBodyFromExisting({ ...existingInvoice(), visibleZeroFields: "TAX_2" })
                .visibleZeroFields,
        ).toBe("TAX_2");
        expect(
            invoiceUpdateBodyFromExisting({
                ...existingInvoice(),
                visibleZeroFields: ["TAX", "UNKNOWN"],
            }).visibleZeroFields,
        ).toBeUndefined();
    });
});
