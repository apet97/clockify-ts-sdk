import { describe, expect, it } from "vitest";

import { CLOCKIFY_ERROR_CODES } from "../error-codes.js";
import {
    AddonTokenRestrictionError,
    classifyClockifyError,
    getStableErrorCode,
    mapAddonTokenRestriction,
} from "../errors.js";
import { ClockifyApiError } from "../src/errors/index.js";

function H(map: Record<string, string>): { headers: { get(name: string): string | null } } {
    const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
    return { headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } };
}

describe("error-code wiring: reachable codes are actually emitted", () => {
    it("addon_token_restricted classifies to its named code", () => {
        const err = new AddonTokenRestrictionError({
            method: "GET",
            path: "/v1/workspaces",
            statusCode: 401,
        });

        expect(err.code).toBe("addon_token_restricted");
        expect(getStableErrorCode(err)).toBe("addon_token_restricted");
    });

    it("addon_token_restricted maps a 401 marker body to the named code", () => {
        const raw = new ClockifyApiError({
            statusCode: 401,
            body: { message: "API is not accessible" },
        });
        const mapped = mapAddonTokenRestriction(raw, {
            authScheme: "addonToken",
            method: "GET",
            path: "/v1/workspaces",
        });

        expect(getStableErrorCode(mapped)).toBe("addon_token_restricted");
    });

    it("bare 401 still stays auth_or_permission", () => {
        expect(getStableErrorCode(new ClockifyApiError({ statusCode: 401, message: "Unauthorized" }))).toBe(
            "auth_or_permission",
        );
    });

    it("429 with Retry-After classifies to the retry-after code", () => {
        const err = new ClockifyApiError({ statusCode: 429, rawResponse: H({ "Retry-After": "30" }) as never });

        expect(getStableErrorCode(err)).toBe("rate_limited_retry_after");
    });

    it("429 with X-RateLimit-Reset also classifies to the retry-after code", () => {
        const reset = String(Math.floor(Date.now() / 1000) + 60);
        const err = new ClockifyApiError({
            statusCode: 429,
            rawResponse: H({ "X-RateLimit-Reset": reset }) as never,
        });

        expect(getStableErrorCode(err)).toBe("rate_limited_retry_after");
    });

    it("bare 429 still stays rate_limited", () => {
        expect(getStableErrorCode(new ClockifyApiError({ statusCode: 429 }))).toBe("rate_limited");
    });

    it("active_resource_delete_blocked matches the live 400 message", () => {
        for (const kind of ["project", "task", "client"] as const) {
            const err = new ClockifyApiError({
                statusCode: 400,
                message: `Cannot delete an active ${kind}`,
            });

            expect(getStableErrorCode(err)).toBe("active_resource_delete_blocked");
        }
    });

    it("active_resource_delete_blocked also matches body.message", () => {
        const err = new ClockifyApiError({
            statusCode: 400,
            body: { message: "Cannot delete an active project" },
        });

        expect(getStableErrorCode(err)).toBe("active_resource_delete_blocked");
    });

    it("unrelated 400 still stays invalid_request", () => {
        expect(getStableErrorCode(new ClockifyApiError({ statusCode: 400, message: "name is required" }))).toBe(
            "invalid_request",
        );
    });

    it("classification carries recovery and retry data for a wired code", () => {
        const c = classifyClockifyError(
            new ClockifyApiError({ statusCode: 429, rawResponse: H({ "Retry-After": "5" }) as never }),
        );

        expect(c?.code).toBe("rate_limited_retry_after");
        expect(c?.retryable).toBe(true);
    });

    it("registry honesty flags unreachable codes and wired codes", () => {
        const by = (code: string) => CLOCKIFY_ERROR_CODES.find((entry) => entry.code === code);
        for (const code of ["host_routing_required", "dead_route", "name_reserved_after_delete"]) {
            expect((by(code) as { reachable?: boolean } | undefined)?.reachable, code).toBe(false);
        }
        for (const code of ["addon_token_restricted", "rate_limited_retry_after", "active_resource_delete_blocked"]) {
            expect((by(code) as { reachable?: boolean } | undefined)?.reachable, code).toBe(true);
        }
    });
});
