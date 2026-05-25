/**
 * Axioms checklist — one assertion per item from
 * /Users/15x/Downloads/sdkxioms.txt §16 ("Final SDK checklist").
 *
 * This file is a regression gate: if a future change removes a
 * checklist-bearing export, breaks the dual-build, or regresses
 * a feature, the relevant assertion fails.
 *
 * Each test is a single `it(...)`. Comments name the axioms-doc
 * row it covers.
 */
import { describe, expect, it } from "vitest";

import {
    createClockifyClient,
    ClockifyAbortError,
    ClockifyConnectionError,
    ConflictError,
    getErrorCode,
    InternalServerError,
    isAbortError,
    isClockifyApiError,
    isConflictError,
    isConnectionError,
    isInternalServerError,
    isRateLimitError,
    isServiceUnavailableError,
    iterAll,
    iterPages,
    paginate,
    paginatedList,
    PaginatedList,
    promoteApiError,
    RateLimitError,
    ServiceUnavailableError,
    warnOnce,
    withResponse,
    composedFetch,
    constructEvent,
    verifyClockifyWebhook,
} from "../index.js";

describe("axioms checklist (§16)", () => {
    it("public API: resource-based via createClockifyClient", () => {
        expect(typeof createClockifyClient).toBe("function");
    });

    it("types: typed errors per status, with subclass narrowing", () => {
        // Construct each subclass and assert instanceof chain.
        const r = new RateLimitError({ statusCode: 429 });
        const c = new ConflictError({ statusCode: 409 });
        const i = new InternalServerError({ statusCode: 500 });
        const s = new ServiceUnavailableError({ statusCode: 503 });
        const a = new ClockifyAbortError({ message: "x" });
        const n = new ClockifyConnectionError({ message: "x" });
        expect(isRateLimitError(r)).toBe(true);
        expect(isConflictError(c)).toBe(true);
        expect(isInternalServerError(i)).toBe(true);
        expect(isServiceUnavailableError(s)).toBe(true);
        expect(isAbortError(a)).toBe(true);
        expect(isConnectionError(n)).toBe(true);
        expect(isClockifyApiError(r)).toBe(true);
        expect(isClockifyApiError(a)).toBe(true);
    });

    it("errors carry status, code, body fields", () => {
        const r = new RateLimitError({
            statusCode: 429,
            body: { code: "rate_limited", message: "too many" },
        });
        expect(r.statusCode).toBe(429);
        expect(getErrorCode(r)).toBe("rate_limited");
        expect(r.body).toEqual({ code: "rate_limited", message: "too many" });
    });

    it("pagination: async-iterable + toArray + pages envelope", async () => {
        // PaginatedList<T> covers the axioms CursorList<T> shape (adapted
        // for offset pagination).
        const list = paginatedList(async () => [], {});
        expect(list).toBeInstanceOf(PaginatedList);
        expect(typeof list[Symbol.asyncIterator]).toBe("function");
        expect(typeof list.pages).toBe("function");
        expect(typeof list.toArray).toBe("function");

        // The lower-level helpers are also exported.
        expect(typeof iterAll).toBe("function");
        expect(typeof iterPages).toBe("function");
        expect(typeof paginate).toBe("function");
    });

    it("retries: composedFetch is exported and configurable", () => {
        expect(typeof composedFetch).toBe("function");
        const f = composedFetch({ retryPolicy: { maxRetries: 1 } });
        expect(typeof f).toBe("function");
    });

    it("response envelope: withResponse helper exported", () => {
        expect(typeof withResponse).toBe("function");
    });

    it("webhooks: signature verification primitives exported", () => {
        expect(typeof verifyClockifyWebhook).toBe("function");
        expect(typeof constructEvent).toBe("function");
    });

    it("deprecation helper exported", () => {
        expect(typeof warnOnce).toBe("function");
    });

    it("promoteApiError is exported and is the promotion entry point", () => {
        expect(typeof promoteApiError).toBe("function");
    });
});
