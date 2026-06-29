import { ClockifyConnectionError, ConflictError } from "clockify-sdk-ts-115/errors";
import { describe, expect, it } from "vitest";

import { FAILURE_HINTS, failureCode, failureHint } from "../src/diagnose.js";

// Build a REAL ClockifyApiError (the production shape) rather than a plain
// Error+statusCode. A plain Error skips the SDK classifier and takes the
// HTTP-status fallback in errorCodeForError -- the opposite path from production,
// which masks the 402 -> feature_unavailable regression. 402 is not in the
// subclass-promotion table, so a ConflictError carrying an arbitrary statusCode
// classifies exactly as the base ClockifyApiError(status) the runtime throws.
const http = (status: number, message = "x") => new ConflictError({ statusCode: status, message });

describe("failureCode", () => {
    it("classifies HTTP status the same way errorResult does", () => {
        expect(failureCode(http(401))).toBe("auth_or_permission");
        expect(failureCode(http(403))).toBe("auth_or_permission");
        expect(failureCode(http(404))).toBe("not_found");
        expect(failureCode(http(429))).toBe("rate_limited");
        expect(failureCode(http(402))).toBe("feature_unavailable");
        expect(failureCode(http(409))).toBe("conflict");
        expect(failureCode(http(500))).toBe("clockify_upstream_error");
        expect(failureCode(http(503))).toBe("clockify_upstream_error");
    });

    it("uses the SDK cause-aware classifier for a connection error (statusCode null)", () => {
        const err = new ClockifyConnectionError({ message: "request to workspace API failed", cause: new Error("ENOTFOUND") });
        expect(failureCode(err)).toBe("connection_error");
    });

    it("falls back to the message matcher for non-SDK aborts", () => {
        expect(failureCode(new Error("operation aborted"))).toBe("aborted");
    });
});

describe("failureHint", () => {
    it("gives a 401/403 hint that points at Profile > API key", () => {
        const out = failureHint(http(401));
        expect(out.hint).toBe(FAILURE_HINTS.auth_or_permission);
        expect(out.hint).toContain("Profile");
        expect(out.retryable).toBe(false);
    });

    it("gives a 404 hint that points at the 24-character workspace id", () => {
        const out = failureHint(http(404));
        expect(out.hint).toContain("24-character workspace id");
        expect(out.retryable).toBe(false);
    });

    it("gives a network hint and marks it retryable", () => {
        const err = new ClockifyConnectionError({ message: "fetch failed", cause: new Error("ECONNRESET") });
        const out = failureHint(err);
        expect(out.hint).toBe(FAILURE_HINTS.connection_error);
        expect(out.retryable).toBe(true);
    });

    it("gives a rate-limit hint and marks it retryable", () => {
        const out = failureHint(http(429));
        expect(out.hint).toBe(FAILURE_HINTS.rate_limited);
        expect(out.retryable).toBe(true);
    });

    it("gives a 5xx upstream hint and marks it retryable", () => {
        expect(failureHint(http(500)).retryable).toBe(true);
        expect(failureHint(http(500)).hint).toBe(FAILURE_HINTS.clockify_upstream_error);
    });

    it("falls back to the registry recovery for a code without a custom hint", () => {
        // 409 -> conflict, which is NOT in FAILURE_HINTS, so the registry text wins.
        const out = failureHint(http(409));
        expect(out.hint).not.toBe(""); // registry recoveryForCode("conflict")
        expect(FAILURE_HINTS.conflict).toBeUndefined();
        expect(out.retryable).toBe(false);
    });

    it("honors an explicitly supplied code (doctor-tool path)", () => {
        expect(failureHint(http(500), "auth_or_permission").hint).toBe(FAILURE_HINTS.auth_or_permission);
    });
});
