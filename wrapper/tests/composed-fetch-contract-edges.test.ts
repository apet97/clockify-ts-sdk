import { describe, expect, it, vi } from "vitest";

import {
    composedFetch,
    getRequestIdFromError,
    REQUEST_ID_HEADER,
    USER_AGENT_HEADER,
    type RequestContext,
} from "../composed-fetch.js";

type RedirectFailure = Error & {
    readonly status: number;
    readonly location: string | undefined;
};

function rejectionOf(promise: Promise<Response>): Promise<unknown> {
    return promise.then(
        () => {
            throw new Error("expected composedFetch to reject");
        },
        (error: unknown) => error,
    );
}

function nonCloneableBody(): ReadableStream<Uint8Array> {
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode("non-cloneable"));
            controller.close();
        },
    });
    Object.defineProperty(body, "tee", {
        value: () => {
            throw new TypeError("body cannot be replayed");
        },
    });
    return body;
}

function streamingPut(body: ReadableStream<Uint8Array>): RequestInit {
    return {
        method: "PUT",
        body,
        duplex: "half",
    } as RequestInit;
}

describe("composedFetch request metadata edge contracts", () => {
    it("passes the exact string target and caller request id to the hook context", async () => {
        const beforeRequest = vi.fn<(context: RequestContext) => void>();
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const target = "https://example.test/string-target";
        const f = composedFetch({
            fetch: dispatch,
            hooks: { beforeRequest },
            userAgent: false,
        });

        await f(target, { headers: { [REQUEST_ID_HEADER]: "caller-request-id" } });

        expect(beforeRequest).toHaveBeenCalledOnce();
        expect(beforeRequest.mock.calls[0]![0]).toMatchObject({
            url: target,
            requestId: "caller-request-id",
        });
    });

    it("leaves User-Agent absent when injection is disabled and no caller value exists", async () => {
        let dispatchedHeaders: Headers | undefined;
        const dispatch = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
            dispatchedHeaders = new Headers(init?.headers);
            return new Response(null, { status: 204 });
        });
        const f = composedFetch({ fetch: dispatch, requestId: false, userAgent: false });

        await f("https://example.test/no-user-agent");

        expect(dispatchedHeaders?.has(USER_AGENT_HEADER)).toBe(false);
        expect(dispatchedHeaders?.get(USER_AGENT_HEADER)).toBeNull();
    });

    it("matches record headers without treating an unrelated first key as the request id", () => {
        expect(
            getRequestIdFromError({
                rawResponse: {
                    headers: {
                        "content-type": "application/json",
                        "X-REQUEST-ID": "record-request-id",
                    },
                },
            }),
        ).toBe("record-request-id");
    });

    it("falls back to record headers when the Headers global is unavailable", () => {
        vi.stubGlobal("Headers", undefined);
        try {
            expect(
                getRequestIdFromError({
                    rawResponse: { headers: { "x-request-id": "runtime-neutral-id" } },
                }),
            ).toBe("runtime-neutral-id");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("composedFetch replay preflight edge contracts", () => {
    it("rejects an enabled retryable body before hooks or dispatch when replay preflight fails", async () => {
        const beforeRequest = vi.fn();
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            hooks: { beforeRequest },
            retryPolicy: {
                maxRetries: 1,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["PUT"],
            },
        });

        await expect(
            f("https://example.test/preflight", streamingPut(nonCloneableBody())),
        ).rejects.toThrow("body cannot be replayed");
        expect(beforeRequest).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not preflight when maxRetries is zero", async () => {
        const beforeRequest = vi.fn();
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            hooks: { beforeRequest },
            retryPolicy: {
                maxRetries: 0,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["PUT"],
            },
        });

        await expect(
            f("https://example.test/no-retries", streamingPut(nonCloneableBody())),
        ).rejects.toThrow("body cannot be replayed");
        expect(beforeRequest).toHaveBeenCalledOnce();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("does not preflight when the method is outside the configured retry set", async () => {
        const beforeRequest = vi.fn();
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            hooks: { beforeRequest },
            retryPolicy: {
                maxRetries: 1,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["GET"],
            },
        });

        await expect(
            f("https://example.test/non-retryable-put", streamingPut(nonCloneableBody())),
        ).rejects.toThrow("body cannot be replayed");
        expect(beforeRequest).toHaveBeenCalledOnce();
        expect(dispatch).not.toHaveBeenCalled();
    });
});

describe("composedFetch redirect classification edge contracts", () => {
    it("preserves the complete blocked-redirect error contract when Location is present", async () => {
        const location = "https://evil.example/steal";
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response(null, { status: 302, headers: { Location: location } }),
            );
        const f = composedFetch({ fetch: dispatch, userAgent: false, requestId: false });

        const error = (await rejectionOf(
            f("https://example.test/redirect-with-location"),
        )) as RedirectFailure;

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("RedirectNotAllowedError");
        expect(error.status).toBe(302);
        expect(error.location).toBe(location);
        expect(error.message).toBe(
            'composedFetch: refusing to follow HTTP 302 redirect to "https://evil.example/steal" — auth headers are not re-sent across redirects; every Clockify endpoint answers with a direct 2xx/4xx.',
        );
    });

    it("omits the Location clause when the blocked redirect has no Location header", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 302 }));
        const f = composedFetch({ fetch: dispatch, userAgent: false, requestId: false });

        const error = (await rejectionOf(
            f("https://example.test/redirect-without-location"),
        )) as RedirectFailure;

        expect(error.location).toBeUndefined();
        expect(error.message).toBe(
            "composedFetch: refusing to follow HTTP 302 redirect — auth headers are not re-sent across redirects; every Clockify endpoint answers with a direct 2xx/4xx.",
        );
    });

    it("classifies status 300 as a blocked redirect under manual handling", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 300 }));
        const f = composedFetch({ fetch: dispatch, userAgent: false, requestId: false });

        const error = (await rejectionOf(
            f("https://example.test/multiple-choices"),
        )) as RedirectFailure;

        expect(error.name).toBe("RedirectNotAllowedError");
        expect(error.status).toBe(300);
    });
});
