import { describe, expect, it } from "vitest";

import { getRateLimit, getRateLimitFromError, type RateLimitSnapshot } from "../rate-limit.js";
import { ClockifyApiError } from "../src/errors/index.js";

describe("getRateLimit", () => {
    it("parses all three X-RateLimit-* headers", () => {
        const reset = Math.floor(Date.now() / 1000) + 60; // epoch sec, 60s in the future
        const headers = new Headers({
            "X-RateLimit-Remaining": "4980",
            "X-RateLimit-Limit": "5000",
            "X-RateLimit-Reset": String(reset),
        });
        const snap: RateLimitSnapshot = getRateLimit(headers);
        expect(snap.remaining).toBe(4980);
        expect(snap.limit).toBe(5000);
        expect(snap.resetAt).toBeInstanceOf(Date);
        // Reset Date should round-trip to within 1ms of `reset * 1000`
        expect(snap.resetAt!.getTime()).toBe(reset * 1000);
    });

    it("is case-insensitive on header names", () => {
        const headers = new Headers({
            "x-ratelimit-remaining": "100",
            "x-ratelimit-limit": "200",
        });
        const snap = getRateLimit(headers);
        expect(snap.remaining).toBe(100);
        expect(snap.limit).toBe(200);
    });

    it("returns undefined fields when headers are missing", () => {
        const headers = new Headers({ "content-type": "application/json" });
        const snap = getRateLimit(headers);
        expect(snap.remaining).toBeUndefined();
        expect(snap.limit).toBeUndefined();
        expect(snap.resetAt).toBeUndefined();
    });

    it("parses HTTP-date Reset header", () => {
        const futureDate = new Date(Date.now() + 60_000);
        const headers = new Headers({
            "X-RateLimit-Reset": futureDate.toUTCString(),
        });
        const snap = getRateLimit(headers);
        expect(snap.resetAt).toBeInstanceOf(Date);
        // Tolerate sub-second precision loss
        expect(Math.abs(snap.resetAt!.getTime() - futureDate.getTime())).toBeLessThan(1000);
    });

    it("ignores non-numeric Remaining/Limit values", () => {
        const headers = new Headers({
            "X-RateLimit-Remaining": "not-a-number",
            "X-RateLimit-Limit": "",
        });
        const snap = getRateLimit(headers);
        expect(snap.remaining).toBeUndefined();
        expect(snap.limit).toBeUndefined();
    });
});

describe("getRateLimitFromError", () => {
    it("extracts rate-limit from a ClockifyApiError's rawResponse", () => {
        const headers = new Headers({
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Limit": "100",
        });
        const err = new ClockifyApiError({
            statusCode: 429,
            body: { code: "rate_limited" },
            rawResponse: {
                headers,
                status: 429,
                statusText: "Too Many Requests",
                url: "https://x",
                redirected: false,
                type: "default",
            },
        });
        const snap = getRateLimitFromError(err);
        expect(snap?.remaining).toBe(0);
        expect(snap?.limit).toBe(100);
    });

    it("returns undefined for non-API errors / null / undefined", () => {
        expect(getRateLimitFromError(new Error("plain"))).toBeUndefined();
        expect(getRateLimitFromError(null)).toBeUndefined();
        expect(getRateLimitFromError(undefined)).toBeUndefined();
        expect(getRateLimitFromError("not an error")).toBeUndefined();
    });

    it("returns undefined when ClockifyApiError has no rawResponse", () => {
        const err = new ClockifyApiError({ statusCode: 500 });
        expect(getRateLimitFromError(err)).toBeUndefined();
    });
});
