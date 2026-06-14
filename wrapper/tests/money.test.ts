import { describe, expect, it } from "vitest";

import {
    CLOCKIFY_AMOUNT_UNITS,
    INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE,
    invoiceItemUnitPriceFromWire,
    invoiceItemUnitPriceToWire,
    toMajor,
    toMinor,
} from "../money.js";

describe("toMinor", () => {
    it("scales a major amount to integer minor units", () => {
        expect(toMinor(125, "major")).toBe(12500);
        expect(toMinor(125.5, "major")).toBe(12550);
    });

    it("passes a minor amount through, rounded to an integer", () => {
        expect(toMinor(12500, "minor")).toBe(12500);
        expect(toMinor(12500.4, "minor")).toBe(12500);
    });

    it("rounds AFTER the ×100 so float dust never under-bills (19.99 → 1999)", () => {
        // 19.99 * 100 === 1998.9999999999998 in IEEE-754; a truncating
        // conversion would bill 1998. The single helper rounds correctly.
        expect(toMinor(19.99, "major")).toBe(1999);
    });

    it("maps zero to zero in both units (no bogus empty→0 surprises)", () => {
        expect(toMinor(0, "major")).toBe(0);
        expect(toMinor(0, "minor")).toBe(0);
    });
});

describe("toMajor", () => {
    it("converts integer minor units to a major-unit number", () => {
        expect(toMajor(12500)).toBe(125);
        expect(toMajor(1999)).toBe(19.99);
    });

    it("round-trips through toMinor", () => {
        expect(toMinor(toMajor(12500), "major")).toBe(12500);
    });
});

describe("invoice item unitPrice wire scale", () => {
    it("is minor×100 (hundredths of a cent) on the wire", () => {
        expect(INVOICE_ITEM_UNIT_PRICE_WIRE_SCALE).toBe(100);
        // A $125.00 unit price is 12500 minor → 1_250_000 on the wire,
        // because Clockify computes amount = unitPrice × quantity / 100.
        expect(invoiceItemUnitPriceToWire(12500)).toBe(1_250_000);
        expect(invoiceItemUnitPriceFromWire(1_250_000)).toBe(12500);
    });

    it("round-trips a unit price through the wire scale", () => {
        expect(invoiceItemUnitPriceFromWire(invoiceItemUnitPriceToWire(500))).toBe(500);
    });
});

describe("CLOCKIFY_AMOUNT_UNITS", () => {
    it("records the per-resource wire unit: expenses MAJOR, invoices/payments/rates minor", () => {
        expect(CLOCKIFY_AMOUNT_UNITS.expense).toBe("major");
        expect(CLOCKIFY_AMOUNT_UNITS.invoice).toBe("minor");
        expect(CLOCKIFY_AMOUNT_UNITS.invoicePayment).toBe("minor");
        expect(CLOCKIFY_AMOUNT_UNITS.rate).toBe("minor");
    });
});
