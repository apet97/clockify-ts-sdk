import { describe, expect, it } from "vitest";

import {
    AddonTokenRestrictionError,
    BadRequestError,
    ClockifyAbortError,
    ClockifyConnectionError,
    classifyClockifyError,
    ConflictError,
    getErrorCode,
    getStableErrorCode,
    InternalServerError,
    isAbortError,
    isClockifyApiError,
    isConflictError,
    isConnectionError,
    isInternalServerError,
    isRateLimitError,
    isServiceUnavailableError,
    mapAddonTokenRestriction,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
} from "../errors.js";
import { UnauthorizedError } from "../src/api/errors/index.js";
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

    it("returns undefined for Retry-After HTTP-date in the past", () => {
        const past = new Date(Date.now() - 60_000).toUTCString();
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": past }) as never,
        });
        // Past dates produce a non-positive dateMs and fall through.
        expect(err.retryAfterMs).toBeUndefined();
    });

    it("returns undefined for malformed Retry-After string", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "not-a-number-or-date" }) as never,
        });
        expect(err.retryAfterMs).toBeUndefined();
        expect(err.rateLimitResetAt).toBeUndefined();
    });

    it("returns undefined for X-RateLimit-Reset epoch seconds in the past", () => {
        const pastSec = Math.floor(Date.now() / 1000) - 60;
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "X-RateLimit-Reset": String(pastSec) }) as never,
        });
        // Past resets shouldn't yield a positive retryAfterMs; the
        // reset Date itself still parses (the field is informational).
        expect(err.retryAfterMs).toBeUndefined();
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
        expect(err.rateLimitResetAt!.getTime()).toBe(pastSec * 1000);
    });

    it("is case-insensitive on header lookup", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "retry-after": "15" }) as never,
        });
        expect(err.retryAfterMs).toBe(15_000);
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

describe("generated status error exports", () => {
    it("re-exports generated status-specific classes from the errors subpath", () => {
        const err = new BadRequestError({ message: "bad request" });
        expect(err).toBeInstanceOf(ClockifyApiError);
        expect(err).toBeInstanceOf(BadRequestError);
        expect(err.statusCode).toBe(400);
        expect(err.body).toEqual({ message: "bad request" });
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
    it("isClockifyApiError matches any ClockifyApiError or subclass", () => {
        expect(isClockifyApiError(new ClockifyApiError({ statusCode: 500 }))).toBe(true);
        expect(isClockifyApiError(new RateLimitError({ statusCode: 429 }))).toBe(true);
        expect(isClockifyApiError(new ConflictError({ statusCode: 409 }))).toBe(true);
        expect(isClockifyApiError(new Error("plain"))).toBe(false);
        expect(isClockifyApiError("string")).toBe(false);
        expect(isClockifyApiError(null)).toBe(false);
        expect(isClockifyApiError(undefined)).toBe(false);
    });

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

describe("ClockifyConnectionError", () => {
    it("subclasses ClockifyApiError", () => {
        const err = new ClockifyConnectionError({
            message: "fetch failed",
            cause: new TypeError("fetch failed"),
        });
        expect(err).toBeInstanceOf(ClockifyConnectionError);
        expect(err).toBeInstanceOf(ClockifyApiError);
        expect(err.name).toBe("ClockifyConnectionError");
        expect(err.message).toContain("fetch failed");
        expect(err.cause).toBeInstanceOf(TypeError);
        expect(err.statusCode).toBeUndefined();
    });

    it("isConnectionError narrows the union", () => {
        const err: unknown = new ClockifyConnectionError({
            message: "ENETUNREACH",
            cause: new Error("ENETUNREACH"),
        });
        expect(isConnectionError(err)).toBe(true);
        expect(isConnectionError(new Error("plain"))).toBe(false);
        expect(isConnectionError(null)).toBe(false);
    });
});

describe("ClockifyAbortError", () => {
    it("subclasses ClockifyApiError", () => {
        const aborted = new DOMException("aborted", "AbortError");
        const err = new ClockifyAbortError({
            message: "request aborted",
            cause: aborted,
        });
        expect(err).toBeInstanceOf(ClockifyAbortError);
        expect(err).toBeInstanceOf(ClockifyApiError);
        expect(err.name).toBe("ClockifyAbortError");
        expect(err.cause).toBe(aborted);
        expect(err.statusCode).toBeUndefined();
    });

    it("isAbortError narrows the union", () => {
        const err: unknown = new ClockifyAbortError({
            message: "user cancelled",
            cause: new DOMException("aborted", "AbortError"),
        });
        expect(isAbortError(err)).toBe(true);
        expect(isAbortError(new Error("plain"))).toBe(false);
        expect(isAbortError(null)).toBe(false);
    });
});

describe("promoteApiError — non-status-code errors", () => {
    it("promotes network failures to ClockifyConnectionError", () => {
        const base = new ClockifyApiError({
            message: "fetch failed",
            cause: new TypeError("fetch failed"),
            // statusCode intentionally omitted
        });
        const promoted = promoteApiError(base);
        expect(promoted).toBeInstanceOf(ClockifyConnectionError);
        expect(promoted).toBeInstanceOf(ClockifyApiError);
        // preserves the original cause + message
        const c = promoted as ClockifyConnectionError;
        expect(c.cause).toBeInstanceOf(TypeError);
    });

    it("promotes AbortError causes to ClockifyAbortError", () => {
        const base = new ClockifyApiError({
            message: "aborted",
            cause: new DOMException("aborted", "AbortError"),
        });
        const promoted = promoteApiError(base);
        expect(promoted).toBeInstanceOf(ClockifyAbortError);
        expect(promoted).toBeInstanceOf(ClockifyApiError);
    });

    it("treats a plain Error with name AbortError as an abort", () => {
        const cause = new Error("aborted");
        cause.name = "AbortError";
        const base = new ClockifyApiError({ message: "aborted", cause });
        const promoted = promoteApiError(base);
        expect(promoted).toBeInstanceOf(ClockifyAbortError);
    });

    it("leaves a status-bearing error alone (existing behaviour)", () => {
        const base = new ClockifyApiError({
            statusCode: 404,
            message: "Not Found",
        });
        const promoted = promoteApiError(base);
        // 404 is handled by the generated NotFoundError emission. The
        // wrapper's promoteApiError only fills 409/429/500/503 plus
        // the non-status-code branches. 404 with no Ctor entry returns
        // the original.
        expect(promoted).toBe(base);
    });

    it("does not double-promote (idempotent)", () => {
        const base = new ClockifyApiError({
            message: "fetch failed",
            cause: new TypeError("fetch failed"),
        });
        const once = promoteApiError(base);
        const twice = promoteApiError(once);
        expect(twice).toBe(once);
    });

    it("leaves non-ClockifyApiError values unchanged", () => {
        const plain = new Error("not an api error");
        expect(promoteApiError(plain)).toBe(plain);
        expect(promoteApiError(null)).toBe(null);
        expect(promoteApiError(undefined)).toBe(undefined);
    });
});

describe("error code extraction", () => {
    it("getErrorCode reads body.code (string)", () => {
        const err = new ClockifyApiError({
            statusCode: 400,
            body: { code: "tag_already_exists", message: "duplicate" },
        });
        expect(getErrorCode(err)).toBe("tag_already_exists");
    });

    it("getErrorCode reads body.error.code (nested)", () => {
        const err = new ClockifyApiError({
            statusCode: 400,
            body: { error: { code: "validation_error", message: "bad input" } },
        });
        expect(getErrorCode(err)).toBe("validation_error");
    });

    it("getErrorCode returns undefined when no code is present", () => {
        const err = new ClockifyApiError({
            statusCode: 500,
            body: { message: "Internal Server Error" },
        });
        expect(getErrorCode(err)).toBeUndefined();
    });

    it("getErrorCode returns undefined on non-object body", () => {
        const err = new ClockifyApiError({ statusCode: 500, body: "string body" });
        expect(getErrorCode(err)).toBeUndefined();
        expect(getErrorCode(new Error("plain"))).toBeUndefined();
        expect(getErrorCode(null)).toBeUndefined();
    });

    it("RateLimitError exposes .code via getErrorCode", () => {
        const err = new RateLimitError({
            statusCode: 429,
            body: { code: "rate_limited", message: "slow down" },
        });
        expect(getErrorCode(err)).toBe("rate_limited");
    });
});

describe("stable SDK error classification", () => {
    it("maps status codes through the generated SDK recovery registry", () => {
        const err = new ClockifyApiError({
            statusCode: 404,
            message: "Not Found",
            body: { code: "tag_missing", message: "tag missing" },
        });

        const classification = classifyClockifyError(err);
        expect(classification).toMatchObject({
            code: "not_found",
            retryable: false,
            statusCode: 404,
            serverCode: "tag_missing",
        });
        expect(classification?.recovery).toContain("returned IDs");
        expect(getStableErrorCode(err)).toBe("not_found");
    });

    it("keeps retry guidance for rate limits and upstream errors", () => {
        const rateLimited = classifyClockifyError(new ClockifyApiError({ statusCode: 429 }));
        const upstream = classifyClockifyError(new ClockifyApiError({ statusCode: 502 }));

        expect(rateLimited).toMatchObject({ code: "rate_limited", retryable: true });
        expect(upstream).toMatchObject({ code: "clockify_upstream_error", retryable: true });
    });

    it("classifies non-status connection and abort failures", () => {
        const connection = classifyClockifyError(
            new ClockifyApiError({
                message: "fetch failed",
                cause: new TypeError("fetch failed"),
            }),
        );
        const abort = classifyClockifyError(
            new ClockifyApiError({
                message: "aborted",
                cause: new DOMException("aborted", "AbortError"),
            }),
        );

        expect(connection).toMatchObject({ code: "connection_error", retryable: true });
        expect(abort).toMatchObject({ code: "aborted", retryable: false });
    });

    it("returns undefined for non-SDK errors", () => {
        expect(classifyClockifyError(new Error("plain"))).toBeUndefined();
        expect(getStableErrorCode(new Error("plain"))).toBeUndefined();
    });
});

describe("mapAddonTokenRestriction", () => {
    it("maps an addon-token 401 with string body marker → AddonTokenRestrictionError", () => {
        const err = new ClockifyApiError({ statusCode: 401, body: "API is not accessible" });
        const mapped = mapAddonTokenRestriction(err, {
            authScheme: "addonToken",
            method: "GET",
            path: "/v1/workspaces",
        });
        expect(mapped).toBeInstanceOf(AddonTokenRestrictionError);
        expect(mapped).toBeInstanceOf(ClockifyApiError);
        const e = mapped as AddonTokenRestrictionError;
        expect(e.message).toContain("Clockify does not allow add-ons to call GET /v1/workspaces");
        expect(e.message).toContain("outside the add-on token's reach");
        expect(e.method).toBe("GET");
        expect(e.path).toBe("/v1/workspaces");
        expect(e.statusCode).toBe(401);
        expect(e.name).toBe("AddonTokenRestrictionError");
    });

    it("maps an addon-token 401 with object body message marker", () => {
        const err = new ClockifyApiError({
            statusCode: 401,
            body: { message: "API is not accessible for add-ons" },
        });
        const mapped = mapAddonTokenRestriction(err, { authScheme: "addonToken" });
        expect(mapped).toBeInstanceOf(AddonTokenRestrictionError);
    });

    it("maps a generated UnauthorizedError carrying the marker", () => {
        const err = new UnauthorizedError("API is not accessible", undefined);
        const mapped = mapAddonTokenRestriction(err, {
            authScheme: "addonToken",
            method: "GET",
            path: "/v1/workspaces",
        });
        expect(mapped).toBeInstanceOf(AddonTokenRestrictionError);
        expect(mapped).toBeInstanceOf(ClockifyApiError);
    });

    it("leaves an api-key 401 raw", () => {
        const err = new ClockifyApiError({ statusCode: 401, body: "API is not accessible" });
        const mapped = mapAddonTokenRestriction(err, {
            authScheme: "apiKey",
            method: "GET",
            path: "/v1/workspaces",
        });
        expect(mapped).toBe(err);
        expect(mapped).not.toBeInstanceOf(AddonTokenRestrictionError);
    });

    it("leaves an addon-token 401 WITHOUT the marker raw", () => {
        const err = new ClockifyApiError({
            statusCode: 401,
            body: { message: "Full authentication is required" },
        });
        const mapped = mapAddonTokenRestriction(err, { authScheme: "addonToken" });
        expect(mapped).toBe(err);
    });

    it("leaves a non-401 addon-token error raw", () => {
        const err = new ClockifyApiError({ statusCode: 403, body: "API is not accessible" });
        const mapped = mapAddonTokenRestriction(err, { authScheme: "addonToken" });
        expect(mapped).toBe(err);
    });

    it("returns non-ClockifyApiError values unchanged", () => {
        const plain = new Error("plain");
        expect(mapAddonTokenRestriction(plain, { authScheme: "addonToken" })).toBe(plain);
        expect(mapAddonTokenRestriction("string", { authScheme: "addonToken" })).toBe("string");
        expect(mapAddonTokenRestriction(null, { authScheme: "addonToken" })).toBe(null);
        expect(mapAddonTokenRestriction(undefined, { authScheme: "addonToken" })).toBe(undefined);
    });

    it('defaults method/path to "?" when omitted', () => {
        const err = new ClockifyApiError({ statusCode: 401, body: "API is not accessible" });
        const mapped = mapAddonTokenRestriction(err, { authScheme: "addonToken" });
        expect(mapped).toBeInstanceOf(AddonTokenRestrictionError);
        expect((mapped as AddonTokenRestrictionError).message).toContain("call ? ?");
    });

    it("preserves body and rawResponse on the mapped error", () => {
        const body = { message: "API is not accessible" };
        const rawResponse = H({ "x-request-id": "req-123" }) as never;
        const err = new ClockifyApiError({ statusCode: 401, body, rawResponse });
        const mapped = mapAddonTokenRestriction(err, {
            authScheme: "addonToken",
            method: "GET",
            path: "/v1/workspaces",
        }) as AddonTokenRestrictionError;
        expect(mapped.body).toBe(err.body);
        expect(mapped.rawResponse).toBe(err.rawResponse);
    });

    it("AddonTokenRestrictionError uses a custom message when provided", () => {
        const e = new AddonTokenRestrictionError({ method: "GET", path: "/x", message: "custom" });
        expect(e.message).toContain("custom");
        expect(e.message).not.toContain("outside the add-on token's reach");
    });
});
