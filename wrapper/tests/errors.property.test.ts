import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
    AddonTokenRestrictionError,
    classifyClockifyError,
    ClockifyAbortError,
    ClockifyConnectionError,
    ConflictError,
    getErrorCode,
    InternalServerError,
    mapAddonTokenRestriction,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
} from "../errors.js";
import { ClockifyApiError } from "../src/errors/index.js";

function raw(headers: Record<string, string>) {
    const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    return {
        headers: {
            get: (name: string) => lower.get(name.toLowerCase()) ?? null,
        },
    } as never;
}

describe("RateLimitError properties", () => {
    it("Retry-After seconds parse to exact milliseconds", () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 86_400 }), (seconds) => {
                const err = new RateLimitError({
                    statusCode: 429,
                    rawResponse: raw({ "Retry-After": String(seconds) }),
                });

                expect(err.retryAfterMs).toBe(seconds * 1000);
            }),
        );
    });

    it("future X-RateLimit-Reset parses to delay and absolute reset date", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 10_000 }), (offsetSeconds) => {
                const now = Date.now();
                const reset = Math.floor(now / 1000) + offsetSeconds;
                const err = new RateLimitError({
                    statusCode: 429,
                    rawResponse: raw({ "X-RateLimit-Reset": String(reset) }),
                });

                expect(err.retryAfterMs).toBeGreaterThan(0);
                expect(Math.abs(err.retryAfterMs! - (reset * 1000 - now))).toBeLessThan(1_500);
                expect(err.rateLimitResetAt?.getTime()).toBe(reset * 1000);
            }),
        );
    });

    it("past X-RateLimit-Reset has no retry delay but still exposes reset date", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 10_000 }), (offsetSeconds) => {
                const reset = Math.floor(Date.now() / 1000) - offsetSeconds;
                const err = new RateLimitError({
                    statusCode: 429,
                    rawResponse: raw({ "X-RateLimit-Reset": String(reset) }),
                });

                expect(err.retryAfterMs).toBeUndefined();
                expect(err.rateLimitResetAt?.getTime()).toBe(reset * 1000);
            }),
        );
    });

    it("garbage or absent rate-limit headers produce undefined parsed fields", () => {
        fc.assert(
            fc.property(
                fc.string().filter(
                    (value) =>
                        Number.isNaN(Number.parseInt(value, 10)) &&
                        Number.isNaN(Date.parse(value)),
                ),
                (value) => {
                    const err = new RateLimitError({
                        statusCode: 429,
                        rawResponse: raw({ "Retry-After": value, "X-RateLimit-Reset": value }),
                    });
                    const empty = new RateLimitError({ statusCode: 429, rawResponse: raw({}) });

                    expect(err.retryAfterMs).toBeUndefined();
                    expect(err.rateLimitResetAt).toBeUndefined();
                    expect(empty.retryAfterMs).toBeUndefined();
                    expect(empty.rateLimitResetAt).toBeUndefined();
                },
            ),
        );
    });

    it("Retry-After HTTP-date is used when seconds parsing fails", () => {
        fc.assert(
            fc.property(fc.integer({ min: 1, max: 60 }), (minutes) => {
                const future = new Date(Date.now() + minutes * 60_000).toUTCString();
                const err = new RateLimitError({
                    statusCode: 429,
                    rawResponse: raw({ "Retry-After": future }),
                });

                expect(err.retryAfterMs).toBeGreaterThan(0);
                expect(err.rateLimitResetAt).toBeInstanceOf(Date);
            }),
        );
    });
});

describe("Clockify error promotion and classification edges", () => {
    it("promoteApiError is idempotent for promoted subclasses and maps known statuses", () => {
        const already = new RateLimitError({ statusCode: 429 });
        expect(promoteApiError(already)).toBe(already);

        expect(promoteApiError(new ClockifyApiError({ statusCode: 409 }))).toBeInstanceOf(
            ConflictError,
        );
        expect(promoteApiError(new ClockifyApiError({ statusCode: 500 }))).toBeInstanceOf(
            InternalServerError,
        );
        expect(promoteApiError(new ClockifyApiError({ statusCode: 503 }))).toBeInstanceOf(
            ServiceUnavailableError,
        );
    });

    it("promoteApiError maps non-status abort and connection causes", () => {
        expect(
            promoteApiError(
                new ClockifyApiError({
                    message: "aborted",
                    cause: new DOMException("aborted", "AbortError"),
                }),
            ),
        ).toBeInstanceOf(ClockifyAbortError);

        expect(
            promoteApiError(
                new ClockifyApiError({ message: "fetch failed", cause: new TypeError("fetch failed") }),
            ),
        ).toBeInstanceOf(ClockifyConnectionError);

        const noStatusNoCause = new ClockifyApiError({ message: "plain" });
        expect(promoteApiError(noStatusNoCause)).toBe(noStatusNoCause);
        expect(promoteApiError(new Error("plain"))).toBeInstanceOf(Error);
    });

    it("classifies 429 retry-after, addon restriction, and active-delete messages precisely", () => {
        expect(
            classifyClockifyError(
                new ClockifyApiError({
                    statusCode: 429,
                    rawResponse: raw({ "Retry-After": "1" }),
                }),
            )?.code,
        ).toBe("rate_limited_retry_after");

        expect(
            classifyClockifyError(
                new ClockifyApiError({
                    statusCode: 401,
                    body: { message: "API is not accessible for add-ons" },
                }),
            )?.code,
        ).toBe("addon_token_restricted");

        expect(
            classifyClockifyError(
                new ClockifyApiError({
                    statusCode: 400,
                    message: "cannot delete an active project",
                }),
            )?.code,
        ).toBe("active_resource_delete_blocked");
    });

    it("getErrorCode ignores empty code strings and reads nested non-empty strings", () => {
        expect(
            getErrorCode(new ClockifyApiError({ statusCode: 400, body: { code: "" } })),
        ).toBeUndefined();
        expect(
            getErrorCode(
                new ClockifyApiError({
                    statusCode: 400,
                    body: { error: { code: "validation_error" } },
                }),
            ),
        ).toBe("validation_error");
    });

    it("mapAddonTokenRestriction only maps addon-token marker 401s", () => {
        const err = new ClockifyApiError({ statusCode: 401, body: "API is not accessible" });
        expect(mapAddonTokenRestriction(err, { authScheme: "apiKey" })).toBe(err);
        expect(
            mapAddonTokenRestriction(err, {
                authScheme: "addonToken",
                method: "GET",
                path: "/v1/workspaces",
            }),
        ).toBeInstanceOf(AddonTokenRestrictionError);
        expect(
            mapAddonTokenRestriction(new ClockifyApiError({ statusCode: 401 }), {
                authScheme: "addonToken",
            }),
        ).toBeInstanceOf(ClockifyApiError);
    });
});
