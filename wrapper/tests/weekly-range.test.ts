import { describe, expect, it } from "vitest";

import { isExactWeeklyRange, parseWeeklyDateTime } from "../dates.js";

describe("parseWeeklyDateTime", () => {
    it.each([
        "2026-03-23T00:00:00Z",
        "2026-03-23t00:00:00Z",
        "2026-03-23T00:00:00",
    ])("accepts %s and retains the original spelling", (value) => {
        expect(parseWeeklyDateTime(value)).toMatchObject({ raw: value, nanosOfDay: 0 });
    });

    it("accepts the reports host's nine-digit fractional precision", () => {
        expect(parseWeeklyDateTime("2026-03-23T00:00:00.123456789Z")).toMatchObject({
            raw: "2026-03-23T00:00:00.123456789Z",
            nanosOfDay: 123_456_789,
        });
    });

    it("parses fractional seconds without changing wall-clock precision", () => {
        expect(parseWeeklyDateTime("2026-03-23T12:34:56.123400000Z")).toMatchObject({
            raw: "2026-03-23T12:34:56.123400000Z",
            nanosOfDay: 45_296_123_400_000,
        });
        expect(parseWeeklyDateTime("2026-03-23T00:00:00.1")?.nanosOfDay).toBe(100_000_000);
    });

    it.each([
        "2026-02-30T00:00:00Z",
        "2025-02-29",
        "2026-04-31T00:00:00+01:00",
        "2026-13-01T00:00:00Z",
        "2026-03-00T00:00:00Z",
        "2026-03-23T24:00:00Z",
        "2026-03-23T00:60:00Z",
        "2026-03-23T00:00:60Z",
        "2026-03-23T00:00:00+24:00",
        "2026-03-23T00:00:00+01:60",
        "2026-03-23T00:00:00z",
        "2026-03-23T00:00:00+01:00",
        "2026-03-23 00:00:00Z",
        "2026-03-23T00:00Z",
        "2026-03-23",
        "2026-03-23T00:00:00.1234567890Z",
        "2026-03-23T00:00:00.",
        " 2026-03-23T00:00:00Z",
        "2026-03-23T00:00:00Z ",
    ])("rejects malformed or impossible value %s", (value) => {
        expect(parseWeeklyDateTime(value)).toBeUndefined();
    });

    it("handles years below 0100 and leap-day validation without host timezone state", () => {
        expect(parseWeeklyDateTime("0000-01-01T00:00:00")?.day).toBe(-719_528);
        expect(parseWeeklyDateTime("0099-12-31T00:00:00")?.day).toBe(-683_004);
        expect(parseWeeklyDateTime("2028-02-29T00:00:00")).toBeDefined();
        expect(parseWeeklyDateTime("2026-02-29T00:00:00")).toBeUndefined();
    });
});

describe("isExactWeeklyRange", () => {
    it.each([
        ["2026-03-23T00:00:00Z", "2026-03-30T00:00:00Z"],
        ["2026-03-23T00:00:00", "2026-03-30T00:00:00"],
        ["2026-03-23t00:00:00Z", "2026-03-30t00:00:00Z"],
    ])("accepts an exclusive seven-day wall-clock interval (%s -> %s)", (start, end) => {
        expect(isExactWeeklyRange(start, end)).toBe(true);
    });

    it.each([
        ["2026-03-23T00:00:00Z", "2026-03-29T23:59:59Z"],
        ["2026-03-23T00:00:00Z", "2026-03-29T23:59:59.999999999Z"],
        ["2026-03-23T00:00:00Z", "2026-03-29T23:59:59.000000001Z"],
    ])("accepts an inclusive seven-day wall-clock interval (%s -> %s)", (start, end) => {
        expect(isExactWeeklyRange(start, end)).toBe(true);
    });

    it.each([
        ["2026-03-23T00:00:00Z", "2026-03-29T23:59:58.999999999Z"],
        ["2026-03-23T00:00:01Z", "2026-03-30T00:00:00Z"],
        ["2026-03-23T00:00:00Z", "2026-03-31T00:00:00Z"],
        ["2026-03-23", "2026-03-29"],
        ["2026-02-30T00:00:00Z", "2026-03-09T00:00:00Z"],
    ])("rejects a range outside the exact seven-day contract (%s -> %s)", (start, end) => {
        expect(isExactWeeklyRange(start, end)).toBe(false);
    });

    it("treats unknown runtime values as invalid instead of throwing", () => {
        expect(isExactWeeklyRange(null, undefined)).toBe(false);
        expect(isExactWeeklyRange(1, "2026-03-30")).toBe(false);
    });
});
