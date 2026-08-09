import { describe, expect, it } from "vitest";

import { formatIsoDuration, parseDuration } from "../src/duration.js";
import { errorCodeForMessage } from "../src/error-codes.js";

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

    it.each(["1 0m", "1. 5h", "1\t2s"])(
        "rejects whitespace that would join numeric components in %j",
        (input) => {
            expect(() => parseDuration(input)).toThrow(/could not parse duration/);
        },
    );

    it("rejects trailing/interior garbage even when a space precedes the unit", () => {
        // Regression: a space before the unit used to mask trailing junk, silently
        // dropping it (e.g. "2 h x" parsed as 2h). It must throw, not guess.
        expect(() => parseDuration("2 h x")).toThrow(/could not parse duration/);
        expect(() => parseDuration("1 hx")).toThrow(/could not parse duration/);
        expect(() => parseDuration("1h30m oops")).toThrow(/could not parse duration/);
    });

    it("parses ISO 8601 durations (Clockify wire format)", () => {
        expect(parseDuration("PT1H30M")).toBe(5400);
        expect(parseDuration("PT45M")).toBe(2700);
        expect(parseDuration("PT30S")).toBe(30);
        expect(parseDuration("PT1H")).toBe(3600);
    });

    it("rejects empty / unparseable input", () => {
        expect(() => parseDuration("")).toThrow(/duration is missing/);
        expect(() => parseDuration("two hours")).toThrow(/could not parse duration/);
        expect(() => parseDuration("PT")).toThrow(/could not parse ISO duration/);
    });

    it("parse failures classify as invalid_request, not the catch-all error code", () => {
        for (const bad of ["", "two hours", "PT"]) {
            let message = "";
            try {
                parseDuration(bad);
            } catch (err) {
                message = err instanceof Error ? err.message : String(err);
            }
            expect(errorCodeForMessage(message)).toBe("invalid_request");
        }
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
