import { describe, expect, it } from "vitest";

import { REPORT_PERIODS, resolveInstant, resolvePeriod, resolveRelativeDay } from "../dates.js";

// A fixed anchor so every assertion is deterministic. 2026-06-15 is a Monday.
const NOW = new Date("2026-06-15T12:00:00.000Z");

describe("resolveRelativeDay", () => {
    it("resolves the relative words and numeric offsets", () => {
        expect(resolveRelativeDay(NOW, { date: "today" })).toBe("2026-06-15");
        expect(resolveRelativeDay(NOW, { date: "now" })).toBe("2026-06-15");
        expect(resolveRelativeDay(NOW, { date: "yesterday" })).toBe("2026-06-14");
        expect(resolveRelativeDay(NOW, { date: "tomorrow" })).toBe("2026-06-16");
        expect(resolveRelativeDay(NOW, { dayOffset: 0 })).toBe("2026-06-15");
        expect(resolveRelativeDay(NOW, { dayOffset: -2 })).toBe("2026-06-13");
        expect(resolveRelativeDay(NOW, {})).toBe("2026-06-15");
    });

    it("passes a real ISO day through and rejects an impossible one", () => {
        expect(resolveRelativeDay(NOW, { date: "2026-03-10" })).toBe("2026-03-10");
        expect(resolveRelativeDay(NOW, { date: "2026-13-40" })).toBeUndefined();
        expect(resolveRelativeDay(NOW, { date: "whenever" })).toBeUndefined();
    });

    it("resolves weekdays: bare = next incl. today, next = strictly after, last = strictly before", () => {
        // NOW is a Monday (getUTCDay() === 1)
        expect(NOW.getUTCDay()).toBe(1);
        expect(resolveRelativeDay(NOW, { date: "monday" })).toBe("2026-06-15"); // today counts
        expect(resolveRelativeDay(NOW, { date: "this monday" })).toBe("2026-06-15");
        expect(resolveRelativeDay(NOW, { date: "next monday" })).toBe("2026-06-22"); // strictly after
        expect(resolveRelativeDay(NOW, { date: "last monday" })).toBe("2026-06-08"); // strictly before
        expect(resolveRelativeDay(NOW, { date: "wednesday" })).toBe("2026-06-17");
        expect(resolveRelativeDay(NOW, { date: "last friday" })).toBe("2026-06-12");
    });

    it("resolves a month-name partial to the current year and rejects overflow", () => {
        expect(resolveRelativeDay(NOW, { date: "June 1" })).toBe("2026-06-01");
        expect(resolveRelativeDay(NOW, { date: "Jun 5" })).toBe("2026-06-05");
        expect(resolveRelativeDay(NOW, { date: "3 March" })).toBe("2026-03-03");
        expect(resolveRelativeDay(NOW, { date: "February 30" })).toBeUndefined();
    });
});

describe("resolvePeriod", () => {
    it("anchors month and year boundaries to now", () => {
        expect(resolvePeriod(NOW, "this_month").dateRangeStart).toBe("2026-06-01T00:00:00.000Z");
        expect(resolvePeriod(NOW, "this_month").dateRangeEnd).toBe(NOW.toISOString());
        const lastMonth = resolvePeriod(NOW, "last_month");
        expect(lastMonth.dateRangeStart).toBe("2026-05-01T00:00:00.000Z");
        expect(lastMonth.dateRangeEnd).toBe("2026-05-31T23:59:59.999Z");
        expect(resolvePeriod(NOW, "this_year").dateRangeStart).toBe("2026-01-01T00:00:00.000Z");
        const lastYear = resolvePeriod(NOW, "last_year");
        expect(lastYear.dateRangeStart).toBe("2025-01-01T00:00:00.000Z");
        expect(lastYear.dateRangeEnd).toBe("2025-12-31T23:59:59.999Z");
    });

    it("weeks start on Monday and last/next week don't overlap this week", () => {
        const thisWeek = resolvePeriod(NOW, "this_week");
        const lastWeek = resolvePeriod(NOW, "last_week");
        const nextWeek = resolvePeriod(NOW, "next_week");
        expect(new Date(thisWeek.dateRangeStart).getUTCDay()).toBe(1); // Monday
        expect(new Date(lastWeek.dateRangeStart).getUTCDay()).toBe(1);
        expect(new Date(lastWeek.dateRangeEnd).getUTCDay()).toBe(0); // Sunday
        expect(lastWeek.dateRangeEnd < thisWeek.dateRangeStart).toBe(true);
        expect(nextWeek.dateRangeStart > thisWeek.dateRangeStart).toBe(true);
    });

    it("rolling windows look back exactly N days", () => {
        expect(resolvePeriod(NOW, "last_7_days").dateRangeStart).toBe("2026-06-08T12:00:00.000Z");
        expect(resolvePeriod(NOW, "last_30_days").dateRangeStart).toBe("2026-05-16T12:00:00.000Z");
    });

    it("every REPORT_PERIODS keyword resolves to an ordered range", () => {
        for (const period of REPORT_PERIODS) {
            const range = resolvePeriod(NOW, period);
            expect(range.dateRangeStart <= range.dateRangeEnd, `${period} should be ordered`).toBe(true);
        }
    });
});

describe("resolveInstant", () => {
    it("normalizes a full ISO datetime through", () => {
        expect(resolveInstant(NOW, "2026-06-10T08:30:00Z", "start")).toBe("2026-06-10T08:30:00.000Z");
    });

    it("anchors a day reference to the start or end edge", () => {
        expect(resolveInstant(NOW, "yesterday", "start")).toBe("2026-06-14T00:00:00.000Z");
        expect(resolveInstant(NOW, "yesterday", "end")).toBe("2026-06-14T23:59:59.999Z");
    });

    it("maps a period keyword (spaces or dashes) to its edge", () => {
        expect(resolveInstant(NOW, "last week", "start")).toBe(resolvePeriod(NOW, "last_week").dateRangeStart);
        expect(resolveInstant(NOW, "last-7-days", "end")).toBe(resolvePeriod(NOW, "last_7_days").dateRangeEnd);
    });

    it("returns undefined for an unparseable reference", () => {
        expect(resolveInstant(NOW, "sometime", "start")).toBeUndefined();
    });
});
