import { describe, expect, it } from "vitest";

import {
    ConflictError,
    InternalServerError,
    isConflictError,
    isInternalServerError,
    isRateLimitError,
    isServiceUnavailableError,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
} from "../errors.js";
import { ClockifyApiError } from "../src/errors/index.js";

/** Headers double matching the `HeaderReader` shape (just `get`). */
function H(map: Record<string, string>): { headers: { get(name: string): string | null } } {
    const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
    return {
        headers: {
            get: (name: string) => lower.get(name.toLowerCase()) ?? null,
        },
    };
}

describe("RateLimitError", () => {
    it("parses Retry-After as seconds", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "30" }) as never,
        });
        expect(err.retryAfterMs).toBe(30_000);
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
        expect(err.rateLimitResetAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("parses Retry-After as HTTP-date", () => {
        const future = new Date(Date.now() + 45_000);
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": future.toUTCString() }) as never,
        });
        expect(err.retryAfterMs).toBeGreaterThanOrEqual(40_000);
        expect(err.retryAfterMs).toBeLessThanOrEqual(50_000);
        // HTTP-date has seconds resolution, so round both sides to the
        // nearest second before comparing.
        const resetSec = Math.floor(err.rateLimitResetAt!.getTime() / 1000);
        const futureSec = Math.floor(future.getTime() / 1000);
        expect(resetSec).toBe(futureSec);
    });

    it("parses X-RateLimit-Reset epoch seconds when Retry-After absent", () => {
        const futureSec = Math.floor(Date.now() / 1000) + 60;
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "X-RateLimit-Reset": String(futureSec) }) as never,
        });
        expect(err.retryAfterMs).toBeGreaterThan(50_000);
        expect(err.retryAfterMs).toBeLessThan(70_000);
        expect(err.rateLimitResetAt!.getTime()).toBe(futureSec * 1000);
    });

    it("returns undefined when no rate-limit headers are present", () => {
        const err = new RateLimitError({ statusCode: 429, rawResponse: H({}) as never });
        expect(err.retryAfterMs).toBeUndefined();
        expect(err.rateLimitResetAt).toBeUndefined();
    });

    it("is an instance of ClockifyApiError (preserves existing catch sites)", () => {
        const err = new RateLimitError({ statusCode: 429 });
        expect(err).toBeInstanceOf(ClockifyApiError);
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.name).toBe("RateLimitError");
        expect(err.statusCode).toBe(429);
    });
});

describe("ConflictError / InternalServerError / ServiceUnavailableError", () => {
    it("each carries its status code and proper name", () => {
        const c = new ConflictError({ statusCode: 409, body: { msg: "dup" } });
        const i = new InternalServerError({ statusCode: 500 });
        const s = new ServiceUnavailableError({ statusCode: 503 });
        expect([c.name, c.statusCode, c.body]).toEqual(["ConflictError", 409, { msg: "dup" }]);
        expect([i.name, i.statusCode]).toEqual(["InternalServerError", 500]);
        expect([s.name, s.statusCode]).toEqual(["ServiceUnavailableError", 503]);
        expect(c).toBeInstanceOf(ClockifyApiError);
        expect(i).toBeInstanceOf(ClockifyApiError);
        expect(s).toBeInstanceOf(ClockifyApiError);
    });
});

describe("promoteApiError", () => {
    it("promotes a base ClockifyApiError 429 → RateLimitError", () => {
        const raw = new ClockifyApiError({
            statusCode: 429,
            body: { error: "rate limited" },
            rawResponse: H({ "Retry-After": "10" }) as never,
        });
        const promoted = promoteApiError(raw);
        expect(promoted).toBeInstanceOf(RateLimitError);
        expect((promoted as RateLimitError).retryAfterMs).toBe(10_000);
        expect((promoted as RateLimitError).body).toEqual({ error: "rate limited" });
    });

    it("promotes 409 → ConflictError, 500 → InternalServerError, 503 → ServiceUnavailableError", () => {
        for (const [status, ctor] of [
            [409, ConflictError],
            [500, InternalServerError],
            [503, ServiceUnavailableError],
        ] as const) {
            const raw = new ClockifyApiError({ statusCode: status });
            const promoted = promoteApiError(raw);
            expect(promoted).toBeInstanceOf(ctor);
        }
    });

    it("returns the original error unchanged for unknown statuses", () => {
        const raw = new ClockifyApiError({ statusCode: 418 });
        expect(promoteApiError(raw)).toBe(raw);
    });

    it("returns non-ClockifyApiError values unchanged", () => {
        const native = new Error("nope");
        expect(promoteApiError(native)).toBe(native);
        expect(promoteApiError("string")).toBe("string");
        expect(promoteApiError(null)).toBe(null);
        expect(promoteApiError(undefined)).toBe(undefined);
    });

    it("does not re-promote an already-promoted subclass", () => {
        const already = new RateLimitError({ statusCode: 429 });
        expect(promoteApiError(already)).toBe(already);
    });

    it("returns the original error when statusCode is undefined", () => {
        const noStatus = new ClockifyApiError({ message: "transport blew up" });
        expect(promoteApiError(noStatus)).toBe(noStatus);
    });
});

describe("type guards", () => {
    it("isRateLimitError matches statusCode 429 on a base ClockifyApiError", () => {
        expect(isRateLimitError(new ClockifyApiError({ statusCode: 429 }))).toBe(true);
        expect(isRateLimitError(new ClockifyApiError({ statusCode: 500 }))).toBe(false);
        expect(isRateLimitError(new Error("plain"))).toBe(false);
        expect(isRateLimitError(null)).toBe(false);
    });

    it("isConflictError, isInternalServerError, isServiceUnavailableError each match their status", () => {
        expect(isConflictError(new ClockifyApiError({ statusCode: 409 }))).toBe(true);
        expect(isConflictError(new ClockifyApiError({ statusCode: 400 }))).toBe(false);
        expect(isInternalServerError(new ClockifyApiError({ statusCode: 500 }))).toBe(true);
        expect(isInternalServerError(new ClockifyApiError({ statusCode: 503 }))).toBe(false);
        expect(isServiceUnavailableError(new ClockifyApiError({ statusCode: 503 }))).toBe(true);
        expect(isServiceUnavailableError(new ClockifyApiError({ statusCode: 502 }))).toBe(false);
    });
});
