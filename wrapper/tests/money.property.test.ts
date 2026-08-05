import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { invoiceItemUnitPriceFromWire, invoiceItemUnitPriceToWire, toMajor, toMinor } from "../money.js";

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

describe("money property: exact-integer envelope (±2^53−1)", () => {
    const MAX_SAFE = Number.MAX_SAFE_INTEGER;

    it("accepts a major amount whose ×100 minor result stays inside the envelope", () => {
        const safeMajor = 90_000_000_000_000; // × 100 = 9e15, still below MAX_SAFE_INTEGER (~9.007e15).
        expect(() => toMinor(safeMajor, "major")).not.toThrow();
        expect(() => toMinor(-safeMajor, "major")).not.toThrow();
    });

    it("rejects a major amount whose ×100 minor result overflows the envelope", () => {
        const overflowMajor = 100_000_000_000_000; // × 100 = 1e16, past MAX_SAFE_INTEGER.
        expect(() => toMinor(overflowMajor, "major")).toThrow(RangeError);
        expect(() => toMinor(-overflowMajor, "major")).toThrow(RangeError);
    });

    it("rejects a minor-unit amount already outside the envelope", () => {
        expect(() => toMinor(MAX_SAFE + 2, "minor")).toThrow(RangeError);
        expect(() => toMajor(MAX_SAFE + 2)).toThrow(RangeError);
    });

    it("accepts the exact boundary and rejects one past it", () => {
        expect(() => toMinor(MAX_SAFE, "minor")).not.toThrow();
        expect(() => toMajor(MAX_SAFE)).not.toThrow();
        expect(() => toMinor(-MAX_SAFE, "minor")).not.toThrow();
        expect(() => toMajor(-MAX_SAFE)).not.toThrow();
    });

    it("propagates the envelope guard through the invoice-item minor×100 wire scale", () => {
        fc.assert(
            fc.property(fc.integer({ min: -MAX_SAFE, max: MAX_SAFE }), (minor) => {
                if (Number.isSafeInteger(minor * 100)) {
                    expect(() => invoiceItemUnitPriceToWire(minor)).not.toThrow();
                } else {
                    expect(() => invoiceItemUnitPriceToWire(minor)).toThrow(RangeError);
                }
            }),
            { numRuns: 200 },
        );
    });

    // wrapper/money.ts is governed at a 100% mutation floor (docs/mutation-score-contract.json)
    // and mutation proof is GitHub-only, so nothing here can be measured locally. `toThrow(RangeError)`
    // above only pins the error TYPE; it leaves every string-literal fragment of the shared
    // assertSafeMinorUnits message (including which caller name it embeds) free to mutate
    // undetected. Pin the exact message per call site so a surviving string mutant is impossible,
    // not just unmeasured.
    it("pins the exact RangeError message from each call site, including which caller it names", () => {
        const capture = (thunk: () => unknown): string => {
            try {
                thunk();
                throw new Error("expected thunk to throw");
            } catch (error) {
                if (error instanceof RangeError) return error.message;
                throw error;
            }
        };
        const envelope =
            "is outside the exact-integer envelope (±9007199254740991); " +
            "Clockify money fields must fit an exact integer number of minor units.";

        expect(capture(() => toMinor(MAX_SAFE + 2, "minor"))).toBe(`toMinor: ${MAX_SAFE + 2} ${envelope}`);
        expect(capture(() => toMajor(MAX_SAFE + 2))).toBe(`toMajor: ${MAX_SAFE + 2} ${envelope}`);
        expect(capture(() => invoiceItemUnitPriceToWire(1e15))).toBe(
            `invoiceItemUnitPriceToWire: ${1e15 * 100} ${envelope}`,
        );
        expect(capture(() => invoiceItemUnitPriceFromWire(MAX_SAFE + 2))).toBe(
            `invoiceItemUnitPriceFromWire: ${MAX_SAFE + 2} ${envelope}`,
        );
    });
});
