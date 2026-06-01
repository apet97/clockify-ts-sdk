import { describe, expect, it } from "vitest";

import { RateLimitError } from "../errors.js";
import { toOperationErrorReceipt, toOperationReceipt } from "../operation-receipt.js";
import type { RawResponse } from "../src/core/index.js";
import type { ResponseAwarePromise } from "../with-response.js";

function responsePromise<T>(
    data: T,
    init?: { status?: number; headers?: Record<string, string> },
): ResponseAwarePromise<T> {
    const rawResponse = new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: init?.headers,
    }) as unknown as RawResponse;
    const promise = Object.assign(Promise.resolve(data), {
        withRawResponse: async () => ({ data, rawResponse }),
    });
    return promise as ResponseAwarePromise<T>;
}

describe("operation-receipt", () => {
    it("turns a raw-response promise into a structured receipt", async () => {
        const receipt = await toOperationReceipt(
            responsePromise(
                { id: "tag-1" },
                {
                    status: 201,
                    headers: {
                        "x-request-id": "req-123",
                        "x-ratelimit-limit": "100",
                        "x-ratelimit-remaining": "99",
                    },
                },
            ),
            {
                action: "tag.create",
                changed: true,
                warnings: ["sandbox-only"],
                next: ["Store the returned id for cleanup."],
            },
        );

        expect(receipt).toMatchObject({
            ok: true,
            action: "tag.create",
            data: { id: "tag-1" },
            status: 201,
            requestId: "req-123",
            changed: true,
            warnings: ["sandbox-only"],
            next: ["Store the returned id for cleanup."],
        });
        expect(receipt.rateLimit?.limit).toBe(100);
        expect(receipt.rateLimit?.remaining).toBe(99);
    });

    it("supports changed as a function of the raw response", async () => {
        const receipt = await toOperationReceipt(responsePromise({ reused: true }), {
            action: "work-package.ensure",
            changed: (result) => result.status >= 200 && result.status < 300 && !result.data.reused,
        });

        expect(receipt.changed).toBe(false);
        expect(receipt.rateLimit).toBeUndefined();
    });

    it("classifies SDK errors into recovery-oriented receipts", () => {
        const receipt = toOperationErrorReceipt(
            "tag.create",
            new RateLimitError({ statusCode: 429, message: "Too many requests" }),
        );

        expect(receipt.ok).toBe(false);
        expect(receipt.action).toBe("tag.create");
        expect(receipt.code).toBe("rate_limited");
        expect(receipt.status).toBe(429);
        expect(receipt.retryable).toBe(true);
        expect(receipt.recovery.length).toBeGreaterThan(0);
    });

    it("falls back for non-SDK errors and keeps caller recovery", () => {
        const receipt = toOperationErrorReceipt("tags.list", new Error("network down"), [
            "Check CLOCKIFY_API_KEY and network connectivity.",
        ]);

        expect(receipt.code).toBe("unknown");
        expect(receipt.message).toBe("network down");
        expect(receipt.retryable).toBe(false);
        expect(receipt.recovery).toEqual(["Check CLOCKIFY_API_KEY and network connectivity."]);
    });
});
