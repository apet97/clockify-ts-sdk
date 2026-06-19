import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { toMajor, toMinor } from "../money.js";

const majorAmount = fc
    .double({ min: -1_000_000, max: 1_000_000, noNaN: true, noDefaultInfinity: true })
    .map((amount) => Math.round(amount * 100) / 100);

describe("money property: round-trip", () => {
    it("toMajor(toMinor(x, 'major')) returns the 2-decimal major amount", () => {
        fc.assert(
            fc.property(majorAmount, (amount) => {
                expect(toMajor(toMinor(amount, "major"))).toBeCloseTo(amount, 2);
            }),
        );
    });
});

describe("money property: sign preservation", () => {
    it("negative major amounts map to negative minor units", () => {
        expect(toMinor(-19.99, "major")).toBe(-1999);
        fc.assert(
            fc.property(majorAmount, (amount) => {
                const minor = toMinor(amount, "major");
                if (amount > 0) expect(minor).toBeGreaterThanOrEqual(0);
                if (amount < 0) expect(minor).toBeLessThanOrEqual(0);
                expect(minor).toBe(Math.round(amount * 100));
                expect(Number.isInteger(minor)).toBe(true);
            }),
        );
    });
});

describe("money property: half-cent and float-dust rounding", () => {
    it("matches Math.round after scaling by 100", () => {
        expect(toMinor(0.005, "major")).toBe(Math.round(0.005 * 100));
        expect(toMinor(-0.005, "major")).toBe(Math.round(-0.005 * 100));
        expect(toMinor(0.005, "major")).toBe(1);
    });

    it("recovers exact cent integers from cent-derived major amounts", () => {
        fc.assert(
            fc.property(fc.integer({ min: -100_000, max: 100_000 }), (cents) => {
                expect(toMinor(cents / 100, "major")).toBe(cents);
            }),
        );
    });
});

describe("money property: minor unit", () => {
    it("rounds minor-unit inputs without rescaling", () => {
        fc.assert(
            fc.property(
                fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
                (amount) => {
                    expect(toMinor(amount, "minor")).toBe(Math.round(amount));
                },
            ),
        );
    });
});
