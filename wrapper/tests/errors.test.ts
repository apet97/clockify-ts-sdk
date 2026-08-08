import { describe, expect, it, vi } from "vitest";

import {
    AddonTokenRestrictionError,
    BadRequestError,
    ClockifyAbortError,
    ClockifyConnectionError,
    classifyClockifyError,
    clockifyErrorDetail,
    ConflictError,
    getErrorCode,
    getRequestIdFromError,
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

/** Case-SENSITIVE header double: `get` only matches the literal key passed in.
 *  Used to prove the parsers fall back to the lowercase header name via `??`
 *  (a `&&` mutant of that fallback would drop the lowercase-only value). */
function Hexact(map: Record<string, string>): {
    headers: { get(name: string): string | null };
} {
    return {
        headers: {
            get: (name: string) => (name in map ? (map[name] as string) : null),
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

    it("treats Retry-After: 0 as 0ms (retry immediately), not undefined", () => {
        const before = Date.now();
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "0" }) as never,
        });
        const after = Date.now();
        expect(err.retryAfterMs).toBe(0);
        // rateLimitResetAt for a 0-second delay is ~now, NOT a bogus 1999/2000 date
        // (regression: new Date("0") parses to 1999-12-31, ~26.5 years in the past).
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
        expect(err.rateLimitResetAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(err.rateLimitResetAt!.getTime()).toBeLessThanOrEqual(after);
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

    it("falls back to the lowercase Retry-After header name (?? not &&)", () => {
        // Hexact only answers the exact key; the parser must try "Retry-After"
        // (null here) THEN "retry-after". A `&&` mutant of that fallback would
        // short-circuit to null and lose the value.
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: Hexact({ "retry-after": "12" }) as never,
        });
        expect(err.retryAfterMs).toBe(12_000);
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
    });

    it("falls back to the lowercase X-RateLimit-Reset header name (?? not &&)", () => {
        const futureSec = Math.floor(Date.now() / 1000) + 90;
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: Hexact({ "x-ratelimit-reset": String(futureSec) }) as never,
        });
        expect(err.retryAfterMs).toBeGreaterThan(80_000);
        expect(err.rateLimitResetAt!.getTime()).toBe(futureSec * 1000);
    });

    it("parseRateLimitResetAt: positive Retry-After seconds yield now + N reset date (seconds > 0 branch)", () => {
        // The `seconds > 0` branch turns a positive delay into an absolute
        // now + N*1000 reset. A 30s Retry-After lands ~30s in the future,
        // distinctly different from the `new Date("30")` HTTP-date fallback.
        const before = Date.now();
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "30" }) as never,
        });
        const after = Date.now();
        expect(err.rateLimitResetAt!.getTime()).toBeGreaterThanOrEqual(before + 30_000);
        expect(err.rateLimitResetAt!.getTime()).toBeLessThanOrEqual(after + 30_000);
    });

    it("a negative Retry-After seconds value falls through to the HTTP-date path (>= 0 boundary)", () => {
        // "-5" parses as a finite -5, failing `seconds >= 0`; the parser then tries
        // it as an HTTP-date (which fails too), so retryAfterMs is undefined. A
        // `||` mutant of that guard would wrongly accept -5 → -5000ms.
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "-5" }) as never,
        });
        expect(err.retryAfterMs).toBeUndefined();
    });

    it("ignores a non-positive X-RateLimit-Reset delta for retryAfterMs but keeps the reset Date (dateMs > 0 boundary)", () => {
        // A reset exactly equal to 'now' (epoch == current second) has dateMs <= 0,
        // so retryAfterMs must stay undefined; the informational reset Date persists.
        const nowSec = Math.floor(Date.now() / 1000);
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "X-RateLimit-Reset": String(nowSec) }) as never,
        });
        expect(err.retryAfterMs).toBeUndefined();
        expect(err.rateLimitResetAt!.getTime()).toBe(nowSec * 1000);
    });

    it("is an instance of ClockifyApiError (preserves existing catch sites)", () => {
        const err = new RateLimitError({ statusCode: 429 });
        expect(err).toBeInstanceOf(ClockifyApiError);
        expect(err).toBeInstanceOf(RateLimitError);
        expect(err.name).toBe("RateLimitError");
        expect(err.statusCode).toBe(429);
    });
});

describe("subclass default messages (no opts.message)", () => {
    it("each subclass falls back to its own name as the default message", () => {
        // Kills the `opts.message ?? "<Name>"` default-string mutants: with no
        // message supplied, the constructed error's message must be the class name.
        expect(new RateLimitError({ statusCode: 429 }).message).toContain("RateLimitError");
        expect(new ConflictError({ statusCode: 409 }).message).toContain("ConflictError");
        expect(new InternalServerError({ statusCode: 500 }).message).toContain(
            "InternalServerError",
        );
        expect(new ServiceUnavailableError({ statusCode: 503 }).message).toContain(
            "ServiceUnavailableError",
        );
        expect(
            new ClockifyConnectionError({ cause: new Error("x") }).message,
        ).toContain("ClockifyConnectionError");
        expect(new ClockifyAbortError({ cause: new Error("x") }).message).toContain(
            "ClockifyAbortError",
        );
    });

    it("a supplied message overrides the default for each subclass", () => {
        // Kills the LogicalOperator (`&&`) mutant of `opts.message ?? "<Name>"`:
        // when a message IS provided it must win, not be replaced by the name.
        expect(new RateLimitError({ statusCode: 429, message: "slow" }).message).toContain("slow");
        expect(new RateLimitError({ statusCode: 429, message: "slow" }).message).not.toContain(
            "RateLimitError:",
        );
        expect(new ConflictError({ statusCode: 409, message: "dup" }).message).toContain("dup");
        expect(new ClockifyAbortError({ message: "cancelled" }).message).toContain("cancelled");
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

describe("errors subpath observability exports", () => {
    it("exports the request-correlation helper used by the error examples", () => {
        expect(getRequestIdFromError({
            rawResponse: { headers: new Headers({ "x-amz-cf-id": "cf-errors-1" }) },
        })).toBe("cf-errors-1");
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

    // `cause` is a public field typed `unknown`, so a JS caller can hand back an
    // error carrying `cause: null`. `isAbortCause` has to reject it before the
    // `typeof cause === "object"` arm, because `typeof null` is "object" and the
    // property read that follows would throw inside the classifier.
    it("survives a null cause without throwing", () => {
        const base = new ClockifyApiError({ message: "wat" });
        Object.defineProperty(base, "cause", { value: null, configurable: true });
        expect(promoteApiError(base)).toBe(base);
        expect(classifyClockifyError(base)?.code).toBe("error");
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

    it("the default message is body-free, so logging it cannot leak request data", () => {
        const err = new BadRequestError({
            message: "Invalid boolean value [SENSITIVE_INPUT_XYZ]",
            code: 3000,
        });
        expect(err.message).toBe("BadRequestError\nStatus code: 400");
        expect(err.message).not.toContain("SENSITIVE_INPUT_XYZ");
        // The body is still reachable for debugging, just not by default.
        expect(err.body).toEqual({
            message: "Invalid boolean value [SENSITIVE_INPUT_XYZ]",
            code: 3000,
        });
    });

    it("clockifyErrorDetail appends the upstream explanation to the message", () => {
        const err = new BadRequestError({ message: "Client name is required" });
        expect(clockifyErrorDetail(err)).toBe(
            "BadRequestError\nStatus code: 400\nClient name is required",
        );
    });

    it("clockifyErrorDetail reads a nested body.error.message envelope", () => {
        const err = new BadRequestError({ error: { message: "bad input" } });
        expect(clockifyErrorDetail(err)).toContain("bad input");
    });

    it("clockifyErrorDetail passes a string body through", () => {
        const err = new BadRequestError("plain text failure");
        expect(clockifyErrorDetail(err)).toContain("plain text failure");
    });

    it("clockifyErrorDetail falls back to the message when the body carries no text", () => {
        const err = new BadRequestError({ code: 501 });
        expect(clockifyErrorDetail(err)).toBe(err.message);
    });

    it("clockifyErrorDetail returns a plain Error's message unchanged", () => {
        expect(clockifyErrorDetail(new Error("boom"))).toBe("boom");
    });

    it("clockifyErrorDetail stringifies a non-Error throw", () => {
        expect(clockifyErrorDetail("not an error")).toBe("not an error");
        expect(clockifyErrorDetail(undefined)).toBe("undefined");
    });

    it("classification still reads the body after it left the message", () => {
        // Before 4.0.0 the body was serialized into `message`, so the matchers
        // saw it by accident. Both envelope shapes must still classify.
        const flat = new BadRequestError({
            message: "Project doesn't belong to Workspace",
            code: 501,
        });
        const nested = new BadRequestError({ error: { message: "Client doesn't exist" } });
        expect(getStableErrorCode(flat)).toBe("not_found");
        expect(getStableErrorCode(nested)).toBe("not_found");
        expect(
            getStableErrorCode(
                new BadRequestError({ message: "Cannot delete an active client" }),
            ),
        ).toBe("active_resource_delete_blocked");
    });

    // Mutation kills. `errors.ts` sat exactly on its floor of 93 after 4.0.0,
    // so each of these targets a specific surviving ConditionalExpression
    // mutant; each was hand-applied and observed to fail before being kept.
    it("clockifyErrorDetail never splices a foreign error's body into the message", () => {
        // Kills the `instanceof ClockifyApiError` early return: forced false,
        // a non-Clockify error carrying `body` would have its text appended.
        const foreign = Object.assign(new Error("third-party failure"), {
            body: { message: "SHOULD-NOT-APPEAR" },
        });
        expect(clockifyErrorDetail(foreign)).toBe("third-party failure");
    });

    it("subclass options reach the base error instead of being dropped", () => {
        // Kills the `rawResponse` conditional spread in generatedErrorOptions:
        // forced false it is never forwarded, and the header-derived field
        // below is the only assertion in the suite that observes it. The
        // statusCode/body/cause arms are already covered elsewhere; they are
        // asserted here because one test of the whole forwarding contract
        // reads better than four scattered ones.
        const cause = new Error("root cause");
        const err = new RateLimitError({
            statusCode: 429,
            body: { message: "slow down", code: 429 },
            rawResponse: H({ "Retry-After": "30" }) as never,
            cause,
        });
        expect(err.statusCode).toBe(429);
        expect(err.body).toEqual({ message: "slow down", code: 429 });
        expect(err.cause).toBe(cause);
        // rawResponse is forwarded, not dropped: the header-derived field proves it.
        expect(err.retryAfterMs).toBe(30_000);
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

// Clockify sends `code` as a JSON NUMBER on every route this repo has
// probed — see the `"code":501` bodies quoted throughout
// spec/evidence/discrepancies.md. The string-only accessor returned
// undefined for all of them, which also left
// `classifyClockifyError().serverCode` permanently unset.
describe("getErrorCode reads Clockify's numeric body codes", () => {
    const codeError = (body: unknown): ClockifyApiError =>
        new ClockifyApiError({ statusCode: 400, body });

    it.each([
        ["validation", 501],
        ["missing auth", 1000],
        ["bad API key", 4003],
        ["bad add-on token", 4017],
        ["immutable resource", 3000],
    ])("stringifies the %s code %i", (_label, code) => {
        expect(getErrorCode(codeError({ message: "nope", code }))).toBe(String(code));
    });

    it("reads a numeric code from the nested envelope too", () => {
        expect(getErrorCode(codeError({ error: { code: 4030 } }))).toBe("4030");
    });

    it("returns zero as \"0\" rather than treating it as absent", () => {
        // Boundary: 0 is falsy but is a valid code. A truthiness check here
        // would silently drop it.
        expect(getErrorCode(codeError({ code: 0 }))).toBe("0");
    });

    it("rejects non-finite and non-code-shaped values", () => {
        for (const code of [NaN, Infinity, -Infinity, true, {}, [], null]) {
            expect(getErrorCode(codeError({ code }))).toBeUndefined();
        }
    });

    it("prefers the top-level code over the nested one", () => {
        expect(getErrorCode(codeError({ code: 501, error: { code: 4017 } }))).toBe("501");
    });

    it("falls through to the nested code when the top-level one is unusable", () => {
        expect(getErrorCode(codeError({ code: NaN, error: { code: 501 } }))).toBe("501");
        expect(getErrorCode(codeError({ code: "", error: { code: 501 } }))).toBe("501");
    });

    it("populates classifyClockifyError().serverCode", () => {
        // Regression guard: serverCode is sourced from getErrorCode, so the
        // string-only accessor left it undefined on every real Clockify error.
        expect(classifyClockifyError(codeError({ message: "bad", code: 501 }))?.serverCode).toBe(
            "501",
        );
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

    it("classifies a plan-gated 402 ClockifyApiError as feature_unavailable", () => {
        const err = new ClockifyApiError({
            statusCode: 402,
            message: "This feature is not available on your plan",
        });

        expect(classifyClockifyError(err)).toMatchObject({
            code: "feature_unavailable",
            retryable: false,
            statusCode: 402,
        });
        expect(getStableErrorCode(err)).toBe("feature_unavailable");
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

    it("a status-bearing error with an abort-shaped cause classifies by STATUS, not aborted", () => {
        // Guards the `statusCode == null && ...` conjuncts in stableCodeForClockifyError:
        // a 503 that happens to carry an AbortError cause must NOT be called "aborted"
        // or "connection_error" — it has a real HTTP status.
        const withAbortCause = new ClockifyApiError({
            statusCode: 503,
            message: "unavailable",
            cause: new DOMException("aborted", "AbortError"),
        });
        expect(getStableErrorCode(withAbortCause)).toBe("clockify_upstream_error");

        const withGenericCause = new ClockifyApiError({
            statusCode: 500,
            message: "boom",
            cause: new TypeError("fetch failed"),
        });
        expect(getStableErrorCode(withGenericCause)).toBe("clockify_upstream_error");
    });

    it("classifies a pre-promoted ClockifyAbortError / ClockifyConnectionError instance directly", () => {
        // Exercises the `instanceof` left operand of the L373/L376 disjunctions:
        // a promoted subclass instance must classify even though we don't re-inspect cause.
        expect(getStableErrorCode(new ClockifyAbortError({ message: "cancelled" }))).toBe(
            "aborted",
        );
        expect(
            getStableErrorCode(new ClockifyConnectionError({ message: "offline" })),
        ).toBe("connection_error");
    });

    it("detects the active-delete block from an object body message (not just the top message)", () => {
        // mentionsActiveDeleteBlock must inspect body.message when the top-level
        // message doesn't carry the phrase — exercises the object-body branch.
        const objBody = classifyClockifyError(
            new ClockifyApiError({
                statusCode: 400,
                message: "Bad Request",
                body: { message: "Cannot delete an active task with time entries" },
            }),
        );
        expect(objBody?.code).toBe("active_resource_delete_blocked");

        // String body also matches.
        const strBody = classifyClockifyError(
            new ClockifyApiError({
                statusCode: 400,
                message: "Bad Request",
                body: "cannot delete an active client",
            }),
        );
        expect(strBody?.code).toBe("active_resource_delete_blocked");

        // A 400 without the phrase anywhere is NOT an active-delete block.
        const noMatch = classifyClockifyError(
            new ClockifyApiError({
                statusCode: 400,
                message: "Bad Request",
                body: { message: "field is required" },
            }),
        );
        expect(noMatch?.code).not.toBe("active_resource_delete_blocked");
    });

    it("a no-status error with no cause classifies via message, not connection/abort", () => {
        // The cause != null conjunct (L376) matters: with cause == null the
        // connection_error branch must NOT fire.
        const noStatusNoCause = new ClockifyApiError({ message: "totally unknown failure" });
        expect(getStableErrorCode(noStatusNoCause)).not.toBe("connection_error");
        expect(getStableErrorCode(noStatusNoCause)).not.toBe("aborted");
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

    it("detects the marker on the body.error and body.code fields too", () => {
        // bodyMentionsAddonRestriction scans message, error, AND code — not only message.
        const viaError = mapAddonTokenRestriction(
            new ClockifyApiError({ statusCode: 401, body: { error: "API is not accessible" } }),
            { authScheme: "addonToken" },
        );
        expect(viaError).toBeInstanceOf(AddonTokenRestrictionError);

        const viaCode = mapAddonTokenRestriction(
            new ClockifyApiError({ statusCode: 401, body: { code: "API is not accessible" } }),
            { authScheme: "addonToken" },
        );
        expect(viaCode).toBeInstanceOf(AddonTokenRestrictionError);

        // An object body whose fields are non-strings (or lack the marker) is left raw.
        const noMarker = new ClockifyApiError({
            statusCode: 401,
            body: { code: 123, error: { nested: true } },
        });
        expect(mapAddonTokenRestriction(noMarker, { authScheme: "addonToken" })).toBe(noMarker);
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

// ---------------------------------------------------------------------------
// Mutation-campaign ledger (CI run 30420465438, wrapper/errors.ts @ cf28eee).
//
// The describe blocks below exist to kill that run's survived mutants by
// asserting OBSERVABLE classification/promotion behavior. 26 survivors are
// EQUIVALENT and intentionally not chased (same treatment as
// subdomain-label.ts at its 80 ceiling):
//
// - 991/995/999/1003 (L81-84): generatedErrorOptions spread conditions -> true.
//   The generated ClockifyApiError ctor destructures and assigns
//   unconditionally, so `{x: undefined}` and an absent key build identical
//   instances (`cause` is `!= null`-guarded inside the ctor).
// - 1010/1017/1023/1029/1035/1041/1047 (L124-269): `Error.captureStackTrace`
//   guard -> true. Always defined in Node/V8; the guard is for other runtimes.
// - 1011/1018/1024/1030/1036/1042/1048 (L124-269): `Error.captureStackTrace`
//   guard -> false. Equivalent on Node: V8 already omits Error-subclass
//   constructor frames from `.stack` (verified on Node 26 — a bare
//   `class B extends A extends Error` chain shows no `at new` frames), so
//   skipping the re-capture is unobservable. The call stays for non-V8
//   runtimes, which the test suite cannot observe.
// - 1108 (L376): right operand -> false is unreachable-true. promoteApiError
//   promotes every no-status+cause error to ClockifyConnectionError (whose
//   instanceof short-circuits the ||), and a pre-promoted ClockifyAbortError
//   returns at the L373 check first.
// - 1178 (L430): status == null -> false. httpStatus.includes(undefined) is
//   false for every registry entry -> same undefined.
// - 1188 (L439): cause == null -> false. The ctor drops null causes, so
//   isAbortCause only ever sees undefined, which the typeof guard rejects
//   either way.
// - 1234/1255/1259/1275 (L512-533): header-presence/isFinite guards -> true.
//   parseInt(null) -> NaN -> every downstream guard fails -> identical
//   fallthrough. (1234 is killable only with a pre-1970 fake clock.)
// - 1311 (L593): typeof-arm -> false. Boxed primitives have no .code/.error.
// ---------------------------------------------------------------------------

describe("promoteApiError preserves fields on the abort branch (mutant 1070)", () => {
    it("keeps message and cause on the promoted ClockifyAbortError", () => {
        const cause = new DOMException("cancelled", "AbortError");
        const err = new ClockifyApiError({ message: "op aborted", cause });
        const promoted = promoteApiError(err);
        expect(promoted).toBeInstanceOf(ClockifyAbortError);
        expect((promoted as ClockifyAbortError).cause).toBe(cause);
        expect((promoted as ClockifyAbortError).message).toContain("op aborted");
    });
});

describe("classification receipt key hygiene (mutants 1087/1090)", () => {
    it("omits the statusCode key entirely when the error has none", () => {
        const c = classifyClockifyError(new ClockifyConnectionError({ message: "offline" }));
        expect(c).toBeDefined();
        expect(Object.prototype.hasOwnProperty.call(c, "statusCode")).toBe(false);
    });
    it("omits the serverCode key entirely when the body has no code", () => {
        const c = classifyClockifyError(
            new ClockifyApiError({ statusCode: 404, message: "gone", body: { message: "no code here" } }),
        );
        expect(c).toBeDefined();
        expect(Object.prototype.hasOwnProperty.call(c, "serverCode")).toBe(false);
    });
});

describe("stableCode branch guards fire only on their own status (mutants 1098/1099/1122/1129/1139/1146/1150/1180)", () => {
    it("a ClockifyConnectionError carrying an AbortError-shaped cause classifies as aborted (abort shape wins)", () => {
        // Pins the L373 disjunction: the abort-shape check runs BEFORE the
        // connection instanceof check, so a pre-promoted connection error
        // wrapping an abort cause reports the abort.
        const code = getStableErrorCode(
            new ClockifyConnectionError({ message: "wrapped", cause: { name: "AbortError" } }),
        );
        expect(code).toBe("aborted");
    });
    it("a NON-401 with the addon-restriction body marker keeps its status code", () => {
        const code = getStableErrorCode(
            new ClockifyApiError({ statusCode: 403, message: "Forbidden", body: "API is not accessible" }),
        );
        expect(code).toBe("auth_or_permission");
    });
    it("a NON-429 with a Retry-After header keeps its status code", () => {
        const code = getStableErrorCode(
            new ClockifyApiError({
                statusCode: 503,
                message: "unavailable",
                rawResponse: H({ "Retry-After": "30" }) as never,
            }),
        );
        expect(code).toBe("clockify_upstream_error");
    });
    it("a NON-400 with an active-delete message keeps its status code", () => {
        const code = getStableErrorCode(
            new ClockifyApiError({ statusCode: 409, message: "Cannot delete an active project" }),
        );
        expect(code).toBe("conflict");
    });
    it("a NON-400 with a doesn't-belong message keeps its status code", () => {
        const code = getStableErrorCode(
            new ClockifyApiError({ statusCode: 500, message: "Task doesn't belong to Workspace" }),
        );
        expect(code).toBe("clockify_upstream_error");
    });
    it("an unregistered status falls back to the message registry, never an undefined code", () => {
        const c = classifyClockifyError(
            new ClockifyApiError({ statusCode: 418, message: "totally unhandled teapot" }),
        );
        expect(c?.code).toBe("error");
    });
});

describe("errorText reads the body when err.message is generic (mutants 1154-1171, 1175)", () => {
    // The generated ctor embeds the body into err.message via buildMessage,
    // which masks errorText's body arm entirely. Override the message
    // post-construction to simulate the documented wire case: a generic
    // thrown message with the meaningful text only in the body.
    function withGenericMessage(err: ClockifyApiError): ClockifyApiError {
        err.message = "Bad Request";
        return err;
    }

    it("an object body message alone drives not_found", () => {
        const err = withGenericMessage(
            new ClockifyApiError({
                statusCode: 400,
                body: { message: "Client doesn't belong to Workspace", code: 501 },
            }),
        );
        expect(getStableErrorCode(err)).toBe("not_found");
    });

    it("a string body alone drives not_found", () => {
        const err = withGenericMessage(
            new ClockifyApiError({ statusCode: 400, body: "Client doesn't belong to Workspace" }),
        );
        expect(getStableErrorCode(err)).toBe("not_found");
    });

    it("a null body classifies by status without throwing", () => {
        const err = withGenericMessage(new ClockifyApiError({ statusCode: 400, body: null }));
        expect(getStableErrorCode(err)).toBe("invalid_request");
    });

    it("a function-valued body is not inspected for messages", () => {
        const fnBody = Object.assign(() => undefined, {
            message: "Client doesn't belong to Workspace",
        });
        const err = withGenericMessage(new ClockifyApiError({ statusCode: 400, body: fnBody }));
        expect(getStableErrorCode(err)).toBe("invalid_request");
    });

    it("a non-string body.message is ignored, not stringified", () => {
        const err = withGenericMessage(
            new ClockifyApiError({
                statusCode: 400,
                body: { message: ["Client doesn't belong to Workspace"] },
            }),
        );
        expect(getStableErrorCode(err)).toBe("invalid_request");
    });

    it("tolerates the apostrophe-less 'doesnt' wire form", () => {
        const err = withGenericMessage(
            new ClockifyApiError({
                statusCode: 400,
                body: { message: "Client doesnt belong to Workspace" },
            }),
        );
        expect(getStableErrorCode(err)).toBe("not_found");
    });
});

describe("isAbortCause shape guards (mutants 1192/1195)", () => {
    it("a string cause is a connection failure, not an abort", () => {
        const err = new ClockifyApiError({ message: "socket hang up", cause: "AbortError" });
        expect(promoteApiError(err)).toBeInstanceOf(ClockifyConnectionError);
    });
    it("a function-valued cause named AbortError is not an abort", () => {
        function AbortError(): void {}
        const err = new ClockifyApiError({ message: "weird cause", cause: AbortError });
        expect(promoteApiError(err)).toBeInstanceOf(ClockifyConnectionError);
    });
});

describe("rate-limit header parser edges (mutants 1250/1253/1266/1284/1293)", () => {
    it("an HTTP-date Retry-After of exactly now yields no retryAfterMs", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
            const err = new RateLimitError({
                statusCode: 429,
                rawResponse: H({ "Retry-After": new Date().toUTCString() }) as never,
            });
            expect(err.retryAfterMs).toBeUndefined();
        } finally {
            vi.useRealTimers();
        }
    });
    it("an X-RateLimit-Reset of exactly now yields no retryAfterMs", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));
            const epochNow = String(Math.floor(Date.now() / 1000));
            const err = new RateLimitError({
                statusCode: 429,
                rawResponse: H({ "X-RateLimit-Reset": epochNow }) as never,
            });
            expect(err.retryAfterMs).toBeUndefined();
            // The absolute reset time is still reported.
            expect(err.rateLimitResetAt?.getTime()).toBe(Date.now());
        } finally {
            vi.useRealTimers();
        }
    });
    it("reads the exact-case X-RateLimit-Reset header name", () => {
        // Epoch 4102444800 = 2100-01-01T00:00:00Z, comfortably in the future.
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: Hexact({ "X-RateLimit-Reset": "4102444800" }) as never,
        });
        expect(err.retryAfterMs).toBeGreaterThan(0);
        expect(err.rateLimitResetAt?.getTime()).toBe(4102444800000);
    });
    it("reads the exact-case Retry-After header name for the reset date", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: Hexact({ "Retry-After": "30" }) as never,
        });
        expect(err.rateLimitResetAt).toBeInstanceOf(Date);
    });
    it("a negative Retry-After yields neither delay nor reset date", () => {
        const err = new RateLimitError({
            statusCode: 429,
            rawResponse: H({ "Retry-After": "-5" }) as never,
        });
        expect(err.retryAfterMs).toBeUndefined();
        expect(err.rateLimitResetAt).toBeUndefined();
    });
});

describe("getErrorCode nested-envelope edges (mutants 1308/1309/1324/1330/1331)", () => {
    it("returns undefined for a null body without throwing", () => {
        expect(getErrorCode(new ClockifyApiError({ statusCode: 400, body: null }))).toBeUndefined();
    });
    // A finite NUMBER is a valid nested code and is stringified — that is
    // the shape Clockify actually sends. This guard is about values that
    // are neither: an object has no meaningful decimal form.
    it("ignores a nested error.code that is neither string nor finite number", () => {
        expect(
            getErrorCode(new ClockifyApiError({ statusCode: 400, body: { error: { code: {} } } })),
        ).toBeUndefined();
    });
    it("ignores an empty nested error.code", () => {
        expect(
            getErrorCode(new ClockifyApiError({ statusCode: 400, body: { error: { code: "" } } })),
        ).toBeUndefined();
    });
});

describe("bodyMentionsAddonRestriction body-shape guards (mutants 1340/1341/1343)", () => {
    it("a 401 with a null body passes through unmapped without throwing", () => {
        const err = new ClockifyApiError({ statusCode: 401, body: null });
        expect(mapAddonTokenRestriction(err, { authScheme: "addonToken" })).toBe(err);
    });
    it("a function-valued body carrying the marker is not inspected", () => {
        const fnBody = Object.assign(() => undefined, { message: "API is not accessible" });
        const err = new ClockifyApiError({ statusCode: 401, body: fnBody });
        expect(mapAddonTokenRestriction(err, { authScheme: "addonToken" })).toBe(err);
    });
});
