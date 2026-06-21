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

    it("rejects every kind of month-day overflow (buildDay day-of-month guard)", () => {
        // Each of these has a valid month + valid year but an out-of-range day,
        // so buildDay's `d.getUTCDate() !== day` clause must reject (not roll over).
        expect(resolveRelativeDay(NOW, { date: "April 31" })).toBeUndefined();
        expect(resolveRelativeDay(NOW, { date: "June 31" })).toBeUndefined();
        expect(resolveRelativeDay(NOW, { date: "February 29" })).toBeUndefined(); // 2026 is not a leap year
        // The maximum valid day for the month is accepted.
        expect(resolveRelativeDay(NOW, { date: "January 31" })).toBe("2026-01-31");
        expect(resolveRelativeDay(NOW, { date: "April 30" })).toBe("2026-04-30");
    });

    it("accepts Feb 29 in a leap year but not in a common year (buildDay against now's year)", () => {
        const leapNow = new Date("2028-06-15T12:00:00.000Z"); // 2028 is a leap year
        expect(resolveRelativeDay(leapNow, { date: "February 29" })).toBe("2028-02-29");
        expect(resolveRelativeDay(leapNow, { date: "February 30" })).toBeUndefined();
    });

    it("accepts ordinal suffixes and both word/day orderings", () => {
        expect(resolveRelativeDay(NOW, { date: "June 1st" })).toBe("2026-06-01");
        expect(resolveRelativeDay(NOW, { date: "2nd July" })).toBe("2026-07-02");
        expect(resolveRelativeDay(NOW, { date: "March 23rd" })).toBe("2026-03-23");
        expect(resolveRelativeDay(NOW, { date: "4th may" })).toBe("2026-05-04");
    });

    it("rejects abbreviations shorter than 3 chars and non-month words", () => {
        // word.length < 3 guard: "Ju" is a prefix of June/July but too short to disambiguate.
        expect(resolveRelativeDay(NOW, { date: "Ju 5" })).toBeUndefined();
        // A 3+ char non-month word has no matching month index.
        expect(resolveRelativeDay(NOW, { date: "foobar 5" })).toBeUndefined();
        // Missing the day component entirely is not a month-name partial.
        expect(resolveRelativeDay(NOW, { date: "June" })).toBeUndefined();
        // A bare 3-letter prefix that uniquely matches still resolves.
        expect(resolveRelativeDay(NOW, { date: "Mar 9" })).toBe("2026-03-09");
    });

    it("parses every month name (kills MONTHS literal mutants Aug-Dec)", () => {
        expect(resolveRelativeDay(NOW, { date: "August 15" })).toBe("2026-08-15");
        expect(resolveRelativeDay(NOW, { date: "September 7" })).toBe("2026-09-07");
        expect(resolveRelativeDay(NOW, { date: "October 3" })).toBe("2026-10-03");
        expect(resolveRelativeDay(NOW, { date: "November 9" })).toBe("2026-11-09");
        expect(resolveRelativeDay(NOW, { date: "December 25" })).toBe("2026-12-25");
    });

    it("matches every weekday name (kills WEEKDAYS literal mutants tue/thu/sat)", () => {
        // NOW is Monday 2026-06-15; bare weekday = next occurrence on/after today.
        expect(resolveRelativeDay(NOW, { date: "tuesday" })).toBe("2026-06-16");
        expect(resolveRelativeDay(NOW, { date: "thursday" })).toBe("2026-06-18");
        expect(resolveRelativeDay(NOW, { date: "saturday" })).toBe("2026-06-20");
    });

    it("rejects an ISO-shaped prefix whose month/day are structurally impossible", () => {
        // Date.parse is lenient about day rollover (Feb 30 → Mar), so isRealDay only
        // rejects truly unparseable components like month 13 / day 99.
        expect(resolveRelativeDay(NOW, { date: "2026-13-40" })).toBeUndefined();
        expect(resolveRelativeDay(NOW, { date: "2026-06-09T08:00:00Z" })).toBe("2026-06-09");
    });

    it("a 'this <weekday>' / bare weekday must match a real weekday name", () => {
        // The weekday branch only fires for indexOf >= 0; a non-weekday word
        // falls through to the month-name path (and then undefined here).
        expect(resolveRelativeDay(NOW, { date: "this someday" })).toBeUndefined();
        expect(resolveRelativeDay(NOW, { date: "next sunday" })).toBe("2026-06-21");
        expect(resolveRelativeDay(NOW, { date: "previous monday" })).toBe("2026-06-08");
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

    it("last_month wraps to the previous December when now is January", () => {
        const jan = new Date("2026-01-10T09:00:00.000Z");
        const lm = resolvePeriod(jan, "last_month");
        expect(lm.dateRangeStart).toBe("2025-12-01T00:00:00.000Z");
        expect(lm.dateRangeEnd).toBe("2025-12-31T23:59:59.999Z");
    });

    it("next_month wraps to the following January when now is December", () => {
        const dec = new Date("2026-12-10T09:00:00.000Z");
        const nm = resolvePeriod(dec, "next_month");
        expect(nm.dateRangeStart).toBe("2027-01-01T00:00:00.000Z");
        expect(nm.dateRangeEnd).toBe("2027-01-31T23:59:59.999Z");
    });

    it("last_quarter wraps year and spans exactly its 3 months when now is in Q1", () => {
        // Feb (Q1, qStart=0) → last quarter is Q4 of the previous year: Oct–Dec.
        const feb = new Date("2026-02-20T00:00:00.000Z");
        const lq = resolvePeriod(feb, "last_quarter");
        expect(lq.dateRangeStart).toBe("2025-10-01T00:00:00.000Z");
        expect(lq.dateRangeEnd).toBe("2025-12-31T23:59:59.999Z");
    });

    it("next_quarter wraps year when now is in Q4", () => {
        // Nov (Q4, qStart=9) → next quarter is Q1 of the next year: Jan–Mar.
        const nov = new Date("2026-11-20T00:00:00.000Z");
        const nq = resolvePeriod(nov, "next_quarter");
        expect(nq.dateRangeStart).toBe("2027-01-01T00:00:00.000Z");
        expect(nq.dateRangeEnd).toBe("2027-03-31T23:59:59.999Z");
    });

    it("a within-year quarter spans its exact 3 months (qm+2 end-month math)", () => {
        // May is in Q2 (Apr–Jun, qStart=3). this_quarter starts Apr 1.
        const may = new Date("2026-05-15T00:00:00.000Z");
        expect(resolvePeriod(may, "this_quarter").dateRangeStart).toBe("2026-04-01T00:00:00.000Z");
        // last_quarter from May is Q1: Jan 1 – Mar 31 (qm+2 = month 2 = March, 31 days).
        const lq = resolvePeriod(may, "last_quarter");
        expect(lq.dateRangeStart).toBe("2026-01-01T00:00:00.000Z");
        expect(lq.dateRangeEnd).toBe("2026-03-31T23:59:59.999Z");
        // next_quarter from May is Q3: Jul 1 – Sep 30 (qm+2 = September, 30 days).
        const nq = resolvePeriod(may, "next_quarter");
        expect(nq.dateRangeStart).toBe("2026-07-01T00:00:00.000Z");
        expect(nq.dateRangeEnd).toBe("2026-09-30T23:59:59.999Z");
    });

    it("last_week / next_week span exactly 7 days ending Sunday (6 * DAY_MS end math)", () => {
        // NOW is Monday 2026-06-15. Last week = Mon 06-08 .. Sun 06-14.
        const lw = resolvePeriod(NOW, "last_week");
        expect(lw.dateRangeStart).toBe("2026-06-08T00:00:00.000Z");
        expect(lw.dateRangeEnd).toBe("2026-06-14T23:59:59.999Z");
        // Next week = Mon 06-22 .. Sun 06-28.
        const nw = resolvePeriod(NOW, "next_week");
        expect(nw.dateRangeStart).toBe("2026-06-22T00:00:00.000Z");
        expect(nw.dateRangeEnd).toBe("2026-06-28T23:59:59.999Z");
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

    it("parses a zone-LESS ISO datetime as UTC, not the host timezone", () => {
        // A datetime with no trailing Z / offset must be anchored to UTC so the
        // resolved instant is identical on every host TZ (module's determinism
        // contract). Pre-fix, Date.parse used the host zone here. The result is
        // independent of the runner's TZ — assert the concrete UTC instant.
        expect(resolveInstant(NOW, "2026-06-10T08:30:00", "start")).toBe(
            "2026-06-10T08:30:00.000Z",
        );
        // `end` edge: a full datetime passes through normalized regardless of edge.
        expect(resolveInstant(NOW, "2026-06-10T08:30:00", "end")).toBe(
            "2026-06-10T08:30:00.000Z",
        );
    });

    it("preserves an explicit offset in a full ISO datetime", () => {
        // An explicit-offset input keeps its zone: 08:30+02:00 is 06:30Z.
        expect(resolveInstant(NOW, "2026-06-10T08:30:00+02:00", "start")).toBe(
            "2026-06-10T06:30:00.000Z",
        );
        // Compact offset form (no colon) is honored too.
        expect(resolveInstant(NOW, "2026-06-10T08:30:00-0500", "start")).toBe(
            "2026-06-10T13:30:00.000Z",
        );
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

    it("trims surrounding whitespace before resolving", () => {
        // The leading/trailing spaces must be stripped (trim), or none of the
        // branches below would match.
        expect(resolveInstant(NOW, "  yesterday  ", "start")).toBe("2026-06-14T00:00:00.000Z");
        expect(resolveInstant(NOW, "  2026-06-10T08:30:00Z  ", "start")).toBe(
            "2026-06-10T08:30:00.000Z",
        );
    });

    it("rejects a malformed ISO datetime (T-branch) instead of falling through", () => {
        // Matches the `\d{4}-\d{2}-\d{2}T` shape but is not a real instant.
        expect(resolveInstant(NOW, "2026-13-99T99:99:99Z", "start")).toBeUndefined();
    });

    it("a bare day (no T) anchors to the requested edge, not the datetime branch", () => {
        expect(resolveInstant(NOW, "2026-06-10", "start")).toBe("2026-06-10T00:00:00.000Z");
        expect(resolveInstant(NOW, "2026-06-10", "end")).toBe("2026-06-10T23:59:59.999Z");
    });

    it("normalizes mixed/multiple spaces and dashes in a period keyword", () => {
        // The /[\s-]+/g replace must collapse runs of spaces+dashes into single _.
        expect(resolveInstant(NOW, "LAST - 7 - DAYS", "start")).toBe(
            resolvePeriod(NOW, "last_7_days").dateRangeStart,
        );
        expect(resolveInstant(NOW, "this   quarter", "end")).toBe(
            resolvePeriod(NOW, "this_quarter").dateRangeEnd,
        );
    });
});
