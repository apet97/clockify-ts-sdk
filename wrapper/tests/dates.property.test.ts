import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { REPORT_PERIODS, resolveInstant, resolvePeriod } from "../dates.js";

const anyNow = fc
    .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31, 23, 59, 59, 999) })
    .map((ms) => new Date(ms));

const QUARTER_START_MONTHS = new Set([0, 3, 6, 9]);

describe("dates property: well-formed ordered UTC ranges", () => {
    it("start <= end and both are parseable Z instants for every period", () => {
        fc.assert(
            fc.property(anyNow, fc.constantFrom(...REPORT_PERIODS), (now, period) => {
                const range = resolvePeriod(now, period);
                expect(range.dateRangeStart.endsWith("Z")).toBe(true);
                expect(range.dateRangeEnd.endsWith("Z")).toBe(true);
                expect(range.dateRangeStart <= range.dateRangeEnd).toBe(true);
                expect(Number.isNaN(Date.parse(range.dateRangeStart))).toBe(false);
                expect(Number.isNaN(Date.parse(range.dateRangeEnd))).toBe(false);
            }),
        );
    });
});

describe("dates property: quarter boundaries", () => {
    it("this_quarter starts on day 1 of the current quarter month", () => {
        fc.assert(
            fc.property(anyNow, (now) => {
                const start = new Date(resolvePeriod(now, "this_quarter").dateRangeStart);
                expect(QUARTER_START_MONTHS.has(start.getUTCMonth())).toBe(true);
                expect(start.getUTCDate()).toBe(1);
                expect(start.getUTCHours()).toBe(0);
                expect(start.getUTCMilliseconds()).toBe(0);
                expect(Math.floor(start.getUTCMonth() / 3)).toBe(
                    Math.floor(now.getUTCMonth() / 3),
                );
                expect(start.getUTCFullYear()).toBe(now.getUTCFullYear());
            }),
        );
    });

    it("last and next quarter ranges do not overlap this quarter", () => {
        fc.assert(
            fc.property(anyNow, (now) => {
                const last = resolvePeriod(now, "last_quarter");
                const current = resolvePeriod(now, "this_quarter");
                const next = resolvePeriod(now, "next_quarter");
                expect(last.dateRangeEnd < current.dateRangeStart).toBe(true);
                expect(next.dateRangeStart > current.dateRangeStart).toBe(true);
                const lastStart = new Date(last.dateRangeStart);
                expect(QUARTER_START_MONTHS.has(lastStart.getUTCMonth())).toBe(true);
                expect(lastStart.getUTCDate()).toBe(1);
            }),
        );
    });
});

describe("dates property: adjacent calendar ranges", () => {
    it("week ranges are Monday-anchored and non-overlapping", () => {
        fc.assert(
            fc.property(anyNow, (now) => {
                const last = resolvePeriod(now, "last_week");
                const current = resolvePeriod(now, "this_week");
                const next = resolvePeriod(now, "next_week");
                expect(new Date(current.dateRangeStart).getUTCDay()).toBe(1);
                expect(new Date(last.dateRangeStart).getUTCDay()).toBe(1);
                expect(new Date(next.dateRangeStart).getUTCDay()).toBe(1);
                expect(last.dateRangeEnd < current.dateRangeStart).toBe(true);
                expect(next.dateRangeStart > current.dateRangeStart).toBe(true);
            }),
        );
    });

    it("month ranges start on day 1 and do not overlap this month", () => {
        fc.assert(
            fc.property(anyNow, (now) => {
                const last = resolvePeriod(now, "last_month");
                const current = resolvePeriod(now, "this_month");
                const next = resolvePeriod(now, "next_month");
                expect(new Date(last.dateRangeStart).getUTCDate()).toBe(1);
                expect(new Date(next.dateRangeStart).getUTCDate()).toBe(1);
                expect(last.dateRangeEnd < current.dateRangeStart).toBe(true);
                expect(next.dateRangeStart > current.dateRangeStart).toBe(true);
            }),
        );
    });

    it("year ranges cover the full prior/following calendar years", () => {
        fc.assert(
            fc.property(anyNow, (now) => {
                const year = now.getUTCFullYear();
                expect(resolvePeriod(now, "last_year").dateRangeStart).toBe(
                    `${year - 1}-01-01T00:00:00.000Z`,
                );
                expect(resolvePeriod(now, "last_year").dateRangeEnd).toBe(
                    `${year - 1}-12-31T23:59:59.999Z`,
                );
                expect(resolvePeriod(now, "next_year").dateRangeStart).toBe(
                    `${year + 1}-01-01T00:00:00.000Z`,
                );
                expect(resolvePeriod(now, "next_year").dateRangeEnd).toBe(
                    `${year + 1}-12-31T23:59:59.999Z`,
                );
            }),
        );
    });
});

describe("dates property: resolveInstant period edges", () => {
    it("agrees with resolvePeriod for start and end edges", () => {
        fc.assert(
            fc.property(anyNow, fc.constantFrom(...REPORT_PERIODS), (now, period) => {
                const range = resolvePeriod(now, period);
                expect(resolveInstant(now, period, "start")).toBe(range.dateRangeStart);
                expect(resolveInstant(now, period, "end")).toBe(range.dateRangeEnd);
            }),
        );
    });
});
