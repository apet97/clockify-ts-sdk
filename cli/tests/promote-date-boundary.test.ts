/**
 * promoteDateBoundary turns a `--start`/`--end` flag into a wire timestamp. A bare
 * YYYY-MM-DD is promoted to start/end-of-day UTC; an RFC3339 value passes through.
 * The bare-date branch must reject impossible (2026-13-45) and silent-rollover
 * (2026-02-30) dates before they reach the wire — the regex alone lets them through.
 */
import { describe, expect, it } from "vitest";

import { promoteDateBoundary } from "../src/commands/helpers.js";

describe("promoteDateBoundary", () => {
    it("promotes a valid bare date to start/end-of-day UTC", () => {
        expect(promoteDateBoundary("2026-06-22", "start", "start")).toBe("2026-06-22T00:00:00Z");
        expect(promoteDateBoundary("2026-06-22", "end", "end")).toBe("2026-06-22T23:59:59Z");
    });

    it("passes a valid RFC3339 timestamp through unchanged", () => {
        expect(promoteDateBoundary("2026-06-22T09:30:00Z", "start", "start")).toBe(
            "2026-06-22T09:30:00Z",
        );
    });

    it("rejects an impossible bare date (month/day out of range)", () => {
        expect(() => promoteDateBoundary("2026-13-45", "start", "start")).toThrow(
            /not a valid calendar date/,
        );
    });

    it("rejects a silent-rollover bare date (2026-02-30 -> 2026-03-02)", () => {
        expect(() => promoteDateBoundary("2026-02-30", "end", "end")).toThrow(
            /not a valid calendar date/,
        );
    });

    it("rejects a non-date string", () => {
        expect(() => promoteDateBoundary("nope", "start", "start")).toThrow(/not a valid date/);
    });
});
