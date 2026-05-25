import { describe, expect, it } from "vitest";

import { Headers } from "../src/core/fetcher/Headers.js";
import { withResponse } from "../with-response.js";

interface FakeRawResponse {
    headers: Headers;
    status: number;
    statusText: string;
    type: ResponseType;
    redirected: boolean;
    url: string;
}

/** Mock a `ResponseAwarePromise<T>` (the shape every
 *  Fern-generated SDK method returns).  */
function fakeResponsePromise<T>(data: T, raw: FakeRawResponse) {
    return Object.assign(Promise.resolve(data), {
        async withRawResponse() {
            return { data, rawResponse: raw };
        },
    });
}

describe("withResponse", () => {
    it("returns data + response + headers + requestId + status", async () => {
        const headers = new Headers();
        headers.set("X-Request-Id", "req-abc-123");
        const raw: FakeRawResponse = {
            headers,
            status: 200,
            statusText: "OK",
            type: "default",
            redirected: false,
            url: "https://example.test/x",
        };
        const promise = fakeResponsePromise({ name: "tag-1" }, raw);

        const result = await withResponse(promise);
        expect(result.data).toEqual({ name: "tag-1" });
        expect(result.status).toBe(200);
        expect(result.requestId).toBe("req-abc-123");
        expect(result.headers).toBe(headers);
        expect(result.response).toBe(raw);
    });

    it("returns undefined requestId when X-Request-Id is absent", async () => {
        const headers = new Headers();
        const raw: FakeRawResponse = {
            headers,
            status: 201,
            statusText: "Created",
            type: "default",
            redirected: false,
            url: "https://example.test/y",
        };
        const promise = fakeResponsePromise([1, 2, 3], raw);
        const result = await withResponse(promise);
        expect(result.requestId).toBeUndefined();
        expect(result.data).toEqual([1, 2, 3]);
        expect(result.status).toBe(201);
    });

    it("propagates rejection from the underlying withRawResponse", async () => {
        const failing = Object.assign(Promise.resolve("unused"), {
            async withRawResponse(): Promise<never> {
                throw new Error("upstream-500");
            },
        });
        await expect(withResponse(failing)).rejects.toThrow("upstream-500");
    });
});
