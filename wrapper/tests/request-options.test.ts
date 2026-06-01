import { describe, expect, it } from "vitest";

import {
    requestOptions,
    withHeaders,
    withIdempotencyKey,
    withRequestTimeout,
    type ClockifyRequestOptions,
} from "../request-options.js";

describe("request-options", () => {
    it("preserves generated request options behind a stable public type", () => {
        const abortController = new AbortController();
        const options = requestOptions({
            timeoutInSeconds: 5,
            maxRetries: 1,
            abortSignal: abortController.signal,
            queryParams: { page: "2" },
            headers: { "X-Test": "yes" },
        });

        expect(options.timeoutInSeconds).toBe(5);
        expect(options.maxRetries).toBe(1);
        expect(options.abortSignal).toBe(abortController.signal);
        expect(options.queryParams).toEqual({ page: "2" });
        expect(options.headers).toEqual({ "X-Test": "yes" });
    });

    it("stringifies header values", () => {
        expect(withHeaders({ "X-Trace": "abc", "X-Retry": 1, "X-Flag": true })).toEqual({
            headers: { "X-Trace": "abc", "X-Retry": "1", "X-Flag": "true" },
        });
    });

    it("builds idempotency-key options", () => {
        expect(withIdempotencyKey(" create-tag-123 ")).toEqual({
            headers: { "Idempotency-Key": "create-tag-123" },
        });
    });

    it("rejects empty idempotency keys", () => {
        expect(() => withIdempotencyKey("  ")).toThrow(TypeError);
    });

    it("builds timeout options", () => {
        expect(withRequestTimeout(2.5)).toEqual({ timeoutInSeconds: 2.5 });
    });

    it("rejects invalid timeouts", () => {
        expect(() => withRequestTimeout(0)).toThrow(RangeError);
        expect(() => withRequestTimeout(Number.NaN)).toThrow(RangeError);
    });

    it("does not expose addonToken through the public type", () => {
        const options = { headers: { "X-Test": "yes" } } satisfies ClockifyRequestOptions;
        expect(options.headers).toEqual({ "X-Test": "yes" });
        // @ts-expect-error addonToken is intentionally omitted from the public type.
        const withToken: ClockifyRequestOptions = { addonToken: "nope" };
        void withToken;
    });
});
