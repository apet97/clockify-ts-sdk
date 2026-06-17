import { describe, expect, it } from "vitest";

import { formatIsoDuration, formatSeconds, parseDuration } from "../src/duration.js";

describe("parseDuration", () => {
    it("parses bare numbers as minutes", () => {
        expect(parseDuration("30")).toBe(1800);
        expect(parseDuration("90")).toBe(5400);
        expect(parseDuration("0.5")).toBe(30);
    });

    it("parses single units", () => {
        expect(parseDuration("30s")).toBe(30);
        expect(parseDuration("45m")).toBe(2700);
        expect(parseDuration("2h")).toBe(7200);
        expect(parseDuration("1d")).toBe(86_400);
    });

    it("parses combined units", () => {
        expect(parseDuration("1h30m")).toBe(5400);
        expect(parseDuration("1h30m15s")).toBe(5415);
        expect(parseDuration("2d3h")).toBe(2 * 86_400 + 3 * 3_600);
    });

    it("tolerates whitespace between numbers and units", () => {
        expect(parseDuration("2 h")).toBe(7200);
        expect(parseDuration("1h 30m")).toBe(5400);
    });

    it("rejects trailing/interior garbage even when a space precedes the unit", () => {
        // Regression: a space before the unit used to mask trailing junk, silently
        // dropping it (e.g. "2 h x" parsed as 2h). It must throw, not guess.
        expect(() => parseDuration("2 h x")).toThrow(/cannot parse duration/);
        expect(() => parseDuration("1 hx")).toThrow(/cannot parse duration/);
        expect(() => parseDuration("1h30m oops")).toThrow(/cannot parse duration/);
    });

    it("parses ISO 8601 durations (Clockify wire format)", () => {
        expect(parseDuration("PT1H30M")).toBe(5400);
        expect(parseDuration("PT45M")).toBe(2700);
        expect(parseDuration("PT30S")).toBe(30);
        expect(parseDuration("PT1H")).toBe(3600);
    });

    it("rejects empty / unparseable input", () => {
        expect(() => parseDuration("")).toThrow(/duration is empty/);
        expect(() => parseDuration("two hours")).toThrow(/cannot parse duration/);
        expect(() => parseDuration("PT")).toThrow(/cannot parse ISO duration/);
    });
});

describe("formatIsoDuration", () => {
    it("formats Clockify durations compactly", () => {
        expect(formatIsoDuration("PT1H30M")).toBe("1h30m");
        expect(formatIsoDuration("PT45M")).toBe("45m");
        expect(formatIsoDuration("PT2H")).toBe("2h");
        expect(formatIsoDuration("PT30S")).toBe("30s");
    });

    it("returns 0s for null / undefined / empty", () => {
        expect(formatIsoDuration(null)).toBe("0s");
        expect(formatIsoDuration(undefined)).toBe("0s");
        expect(formatIsoDuration("")).toBe("0s");
    });

    it("passes through unrecognized shapes", () => {
        expect(formatIsoDuration("not-iso")).toBe("not-iso");
    });
});

describe("formatSeconds", () => {
    it("formats compact human strings", () => {
        expect(formatSeconds(89)).toBe("1m29s");
        expect(formatSeconds(3601)).toBe("1h0m1s");
        expect(formatSeconds(7200)).toBe("2h0m0s");
        expect(formatSeconds(45)).toBe("45s");
    });

    it("handles zero and negative inputs", () => {
        expect(formatSeconds(0)).toBe("0s");
        expect(formatSeconds(-10)).toBe("0s");
        expect(formatSeconds(Number.NaN)).toBe("0s");
    });
});
