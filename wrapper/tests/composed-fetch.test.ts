import { describe, expect, it, vi } from "vitest";

import {
    composedFetch,
    defaultUserAgent,
    generateRequestId,
    getRequestIdFromError,
    REQUEST_ID_HEADER,
    USER_AGENT_HEADER,
    type RequestContext,
    type ResponseContext,
} from "../composed-fetch.js";
import { authenticatedBoundaryFetch } from "../internal/authenticated-boundary-fetch.js";

/** Build a mock fetch that responds with the given status + body and
 *  records every call. */
function mockFetch(
    behavior: (call: {
        input: RequestInfo | URL;
        init?: RequestInit;
    }) => Response | Promise<Response> | Error | Promise<Error>,
): { fn: typeof fetch; calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> } {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fn = (async (input, init) => {
        calls.push(init === undefined ? { input } : { input, init });
        const result = await behavior(init === undefined ? { input } : { input, init });
        if (result instanceof Error) throw result;
        return result;
    }) as typeof fetch;
    return { fn, calls };
}

type FetchOutcome =
    | { status: "fulfilled"; value: Response }
    | { status: "rejected"; reason: unknown };

function observeFetch(promise: Promise<Response>): Promise<FetchOutcome> {
    return promise.then(
        (value) => ({ status: "fulfilled", value }),
        (reason: unknown) => ({ status: "rejected", reason }),
    );
}

function deferredVoid(): { promise: Promise<void>; resolve(): void } {
    let resolve!: () => void;
    const promise = new Promise<void>((accept) => {
        resolve = accept;
    });
    return { promise, resolve };
}

async function fetchOutcomeWithin(
    outcome: Promise<FetchOutcome>,
    timeoutMs = 25,
): Promise<FetchOutcome | { status: "timed_out" }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            outcome,
            new Promise<{ status: "timed_out" }>((resolve) => {
                timer = setTimeout(() => resolve({ status: "timed_out" }), timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

describe("defaultUserAgent", () => {
    it("starts with the package name + version", () => {
        expect(defaultUserAgent()).toMatch(/^clockify-sdk-ts-115\/[\d.]+/);
    });

    it("includes Node.js runtime, platform, and arch", () => {
        const ua = defaultUserAgent();
        expect(ua).toContain("Node.js");
        expect(ua).toMatch(/\(Node\.js v[\d.]+; [a-z]+ [a-z0-9_]+\)/);
    });
});

describe("generateRequestId", () => {
    it("returns a UUID-like string", () => {
        expect(generateRequestId()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it("returns a unique value per call", () => {
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) ids.add(generateRequestId());
        expect(ids.size).toBe(100);
    });
});

describe("composedFetch — header injection", () => {
    it("injects the default User-Agent header on every request", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn });
        await f("https://example.test/x");
        const headers = new Headers(calls[0]!.init?.headers);
        expect(headers.get(USER_AGENT_HEADER)).toMatch(/^clockify-sdk-ts-115\//);
    });

    it("respects a string userAgent override", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn, userAgent: "my-app/1.0" });
        await f("https://example.test/x");
        expect(new Headers(calls[0]!.init?.headers).get(USER_AGENT_HEADER)).toBe("my-app/1.0");
    });

    it("does not touch the User-Agent header when userAgent: false", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn, userAgent: false });
        await f("https://example.test/x", { headers: { "User-Agent": "caller-set" } });
        expect(new Headers(calls[0]!.init?.headers).get(USER_AGENT_HEADER)).toBe("caller-set");
    });

    it("does not override a caller-set User-Agent header", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn });
        await f("https://example.test/x", { headers: { "User-Agent": "caller-priority" } });
        expect(new Headers(calls[0]!.init?.headers).get(USER_AGENT_HEADER)).toBe("caller-priority");
    });

    it("injects an X-Request-Id UUID per request by default", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn });
        await f("https://example.test/x");
        await f("https://example.test/y");
        const id1 = new Headers(calls[0]!.init?.headers).get(REQUEST_ID_HEADER);
        const id2 = new Headers(calls[1]!.init?.headers).get(REQUEST_ID_HEADER);
        expect(id1).toMatch(/^[0-9a-f-]{36}$/);
        expect(id2).toMatch(/^[0-9a-f-]{36}$/);
        expect(id1).not.toBe(id2);
    });

    it("accepts a custom requestId generator", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        let counter = 0;
        const f = composedFetch({ fetch: fn, requestId: () => `req-${++counter}` });
        await f("https://example.test/x");
        await f("https://example.test/y");
        expect(new Headers(calls[0]!.init?.headers).get(REQUEST_ID_HEADER)).toBe("req-1");
        expect(new Headers(calls[1]!.init?.headers).get(REQUEST_ID_HEADER)).toBe("req-2");
    });

    it("does not inject X-Request-Id when requestId: false", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn, requestId: false });
        await f("https://example.test/x");
        expect(new Headers(calls[0]!.init?.headers).get(REQUEST_ID_HEADER)).toBeNull();
    });

    it("respects a caller-set X-Request-Id", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn });
        await f("https://example.test/x", { headers: { "X-Request-Id": "caller-id-99" } });
        expect(new Headers(calls[0]!.init?.headers).get(REQUEST_ID_HEADER)).toBe("caller-id-99");
    });
});

describe("composedFetch — lifecycle hooks (no retry)", () => {
    it("invokes beforeRequest then afterResponse on success", async () => {
        const events: string[] = [];
        const ctxs: Array<RequestContext | ResponseContext> = [];
        const { fn } = mockFetch(() => new Response("ok", { status: 200 }));
        const f = composedFetch({
            fetch: fn,
            hooks: {
                beforeRequest: (ctx) => {
                    events.push("before");
                    ctxs.push(ctx);
                },
                afterResponse: (ctx) => {
                    events.push("after");
                    ctxs.push(ctx);
                },
            },
        });
        await f("https://example.test/x", { method: "POST" });
        expect(events).toEqual(["before", "after"]);
        expect(ctxs[0]!.method).toBe("POST");
        expect((ctxs[1]! as ResponseContext).response.status).toBe(200);
        expect((ctxs[1]! as ResponseContext).durationMs).toBeGreaterThanOrEqual(0);
    });

    it("invokes onError on a network failure", async () => {
        const onError = vi.fn();
        const { fn } = mockFetch(() => new Error("DNS fail"));
        const f = composedFetch({ fetch: fn, hooks: { onError } });
        await expect(f("https://example.test/x")).rejects.toThrow("DNS fail");
        expect(onError).toHaveBeenCalledOnce();
        expect(onError.mock.calls[0]![0].error).toBeInstanceOf(Error);
    });

    it("hook rejections do NOT block the request (best-effort)", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { fn } = mockFetch(() => new Response("ok"));
        const f = composedFetch({
            fetch: fn,
            hooks: {
                beforeRequest: () => {
                    throw new Error("hook boom");
                },
            },
        });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(200);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("composedFetch — retry policy", () => {
    it.each(["PUT", "DELETE"] as const)(
        "dispatches a fresh replayable %s Request with identical body bytes per attempt",
        async (method) => {
            const requests: Request[] = [];
            const bodies: string[] = [];
            const f = composedFetch({
                fetch: vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
                    expect(init).toBeUndefined();
                    expect(input).toBeInstanceOf(Request);
                    const request = input as Request;
                    requests.push(request);
                    bodies.push(await request.text());
                    return new Response(null, { status: requests.length === 1 ? 503 : 204 });
                }),
                retryPolicy: {
                    maxRetries: 1,
                    initialDelayMs: 0,
                    jitter: 0,
                    retryableMethods: [method],
                },
            });

            await expect(
                f("https://example.test/x", { method, body: "replay me" }),
            ).resolves.toHaveProperty("status", 204);
            expect(requests).toHaveLength(2);
            expect(new Set(requests).size).toBe(2);
            expect(bodies).toEqual(["replay me", "replay me"]);
        },
    );

    it("rejects a used retryable Request body before the first dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: {
                maxRetries: 1,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["PUT"],
            },
        });
        const input = new Request("https://example.test/x", {
            method: "PUT",
            body: "already used",
        });
        await input.text();

        await expect(f(input)).rejects.toBeDefined();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("rejects a locked retryable Request body before the first dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({ fetch: dispatch, retryPolicy: { maxRetries: 1 } });
        const input = new Request("https://example.test/x", {
            method: "PUT",
            body: "locked",
        });
        const reader = input.body?.getReader();
        try {
            await expect(f(input)).rejects.toBeDefined();
            expect(dispatch).not.toHaveBeenCalled();
        } finally {
            reader?.releaseLock();
        }
    });

    it.each(["used", "locked"] as const)(
        "replaces a %s original Request body before composed replay preflight",
        async (state) => {
            const input = new Request("https://example.test/x", {
                method: "PUT",
                body: "stale original body",
            });
            const reader = state === "locked" ? input.body?.getReader() : undefined;
            if (state === "used") await input.text();

            const requests: Request[] = [];
            const bodies: string[] = [];
            const dispatch = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
                expect(request).toBeInstanceOf(Request);
                expect(init).toBeUndefined();
                const actual = request as Request;
                requests.push(actual);
                bodies.push(await actual.text());
                return new Response(null, { status: requests.length === 1 ? 503 : 204 });
            });
            const f = composedFetch({
                fetch: dispatch,
                retryPolicy: {
                    maxRetries: 1,
                    initialDelayMs: 0,
                    jitter: 0,
                    retryableMethods: ["PUT"],
                },
            });

            try {
                await expect(f(input, { body: "fresh replacement body" })).resolves.toHaveProperty(
                    "status",
                    204,
                );
                expect(requests).toHaveLength(2);
                expect(new Set(requests).size).toBe(2);
                expect(bodies).toEqual(["fresh replacement body", "fresh replacement body"]);
            } finally {
                reader?.releaseLock();
            }
        },
    );

    it("rejects a non-cloneable finalized retryable body before the first dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({ fetch: dispatch, retryPolicy: { maxRetries: 1 } });
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("stream"));
                controller.close();
            },
        });
        Object.defineProperty(stream, "tee", {
            value: () => {
                throw new TypeError("cannot clone body");
            },
        });

        await expect(
            f("https://example.test/x", {
                method: "PUT",
                body: stream,
                duplex: "half",
            } as RequestInit),
        ).rejects.toThrow(/cannot clone body/i);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("preserves an already-aborted primitive reason with zero dispatches", async () => {
        const controller = new AbortController();
        controller.abort("composed-stop");
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({ fetch: dispatch, retryPolicy: { maxRetries: 1 } });

        await expect(
            f("https://example.test/x", { signal: controller.signal }),
        ).rejects.toBe("composed-stop");
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("retries after an afterResponse hook consumed the retryable body", async () => {
        // A logging-style hook that reads the body leaves the stream locked, so
        // the pre-backoff `body.cancel()` throws. Hooks must never block the
        // request: the retry proceeds and the caller sees the 200.
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response('{"retry":true}', {
                    status: 503,
                    headers: { "content-type": "application/json" },
                }),
            )
            .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: {
                afterResponse: async (ctx: ResponseContext) => {
                    await ctx.response.json();
                },
            },
        });

        await expect(f("https://example.test/x")).resolves.toHaveProperty("status", 200);
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("fires onError when an abort lands inside an async beforeRequest hook on the retry path", async () => {
        // The single-shot path already routes this through onError; the retry
        // path must not diverge, or a span opened in beforeRequest never ends.
        const sentinel = new Error("composed-abort-in-hook");
        const controller = new AbortController();
        const dispatch = vi.fn<typeof fetch>();
        const onError = vi.fn();
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: {
                beforeRequest: async () => {
                    await Promise.resolve();
                    controller.abort(sentinel);
                },
                onError,
            },
        });

        await expect(
            f("https://example.test/x", { signal: controller.signal }),
        ).rejects.toBe(sentinel);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("cancels a retryable response body before starting backoff", async () => {
        vi.useFakeTimers();
        try {
            let finishCancellation!: () => void;
            const cancellationFinished = new Promise<void>((resolve) => {
                finishCancellation = resolve;
            });
            const cancel = vi.fn(() => cancellationFinished);
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(
                    new Response(new ReadableStream<Uint8Array>({ cancel }), {
                        status: 503,
                        headers: { "Retry-After": "5" },
                    }),
                )
                .mockResolvedValueOnce(new Response(null, { status: 204 }));
            const f = composedFetch({
                fetch: dispatch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            });

            const outcome = f("https://example.test/x");
            await vi.advanceTimersByTimeAsync(0);
            expect(cancel).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(5_000);
            expect(dispatch).toHaveBeenCalledOnce();

            finishCancellation();
            await vi.advanceTimersByTimeAsync(4_999);
            expect(dispatch).toHaveBeenCalledOnce();
            await vi.advanceTimersByTimeAsync(1);
            await expect(outcome).resolves.toHaveProperty("status", 204);
            expect(dispatch).toHaveBeenCalledTimes(2);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("aborts immediately while composed retry-response cancellation is pending", async () => {
        const cancellation = deferredVoid();
        const cancel = vi.fn(() => cancellation.promise);
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response(new ReadableStream<Uint8Array>({ cancel }), {
                    status: 503,
                }),
            )
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const controller = new AbortController();
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        const outcome = observeFetch(
            f("https://example.test/x", { signal: controller.signal }),
        );
        while (cancel.mock.calls.length === 0) await Promise.resolve();

        const reason = new Error("abort pending composed response cancellation");
        controller.abort(reason);
        const raced = await fetchOutcomeWithin(outcome);
        cancellation.resolve();
        await outcome;
        await Promise.resolve();

        expect(raced).toEqual({ status: "rejected", reason });
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid maxRetries %s at construction, before any dispatch",
        (maxRetries) => {
            // SDK-5 moved retry-policy validation from the first request to
            // composedFetch() itself, matching the POST/PATCH method guard:
            // a bad policy is a config error, not a request-time condition.
            const dispatch = vi.fn<typeof fetch>();
            expect(() => composedFetch({ fetch: dispatch, retryPolicy: { maxRetries } })).toThrow(
                /maxRetries/i,
            );
            expect(dispatch).not.toHaveBeenCalled();
        },
    );

    it("does not retry by default (no retryPolicy)", async () => {
        const { fn, calls } = mockFetch(() => new Response("server err", { status: 500 }));
        const f = composedFetch({ fetch: fn });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(500);
        expect(calls.length).toBe(1);
    });

    it("retries on 503 up to maxRetries when retryPolicy is set", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("retry", { status: 503 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 1, jitter: 0 },
        });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(503);
        expect(calls).toBe(3); // initial + 2 retries
    });

    it("stops retrying on the first 2xx", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return calls < 2
                    ? new Response("first failed", { status: 502 })
                    : new Response("now ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
        });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(200);
        expect(calls).toBe(2);
    });

    it("only retries idempotent methods by default (POST not retried)", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("server", { status: 503 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
        });
        const res = await f("https://example.test/x", { method: "POST" });
        expect(res.status).toBe(503);
        expect(calls).toBe(1);
    });

    it("excludes POST and PATCH from default retryableMethods (mutation safety)", async () => {
        // Mutation safety regression: a 5xx on a non-idempotent method must
        // never trigger an auto-retry by default, because the server may have
        // already applied the write before failing the response.
        for (const method of ["POST", "PATCH"] as const) {
            let calls = 0;
            const f = composedFetch({
                fetch: (async () => {
                    calls++;
                    return new Response("server", { status: 503 });
                }) as typeof fetch,
                retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
            });
            const res = await f("https://example.test/x", { method });
            expect(res.status).toBe(503);
            expect(calls).toBe(1);
        }
    });

    it("does not retry a POST after a transport timeout (mutation safety)", async () => {
        // A transport-level failure (timeout / dropped connection) is the most
        // dangerous case to retry on a write: the request may have reached the
        // server and mutated state even though the client saw no response.
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                throw new Error("ETIMEDOUT");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
        });
        await expect(f("https://example.test/x", { method: "POST" })).rejects.toThrow("ETIMEDOUT");
        expect(calls).toBe(1);
    });

    it("does not retry a PATCH after a transport timeout (mutation safety)", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                throw new Error("ECONNRESET");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
        });
        await expect(f("https://example.test/x", { method: "PATCH" })).rejects.toThrow(
            "ECONNRESET",
        );
        expect(calls).toBe(1);
    });

    it("retries an idempotent GET after a transport timeout", async () => {
        // Counterpart to the POST/PATCH transport-timeout cases: a safe method
        // SHOULD recover via retry when the policy allows it.
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                if (calls < 3) throw new Error("ETIMEDOUT");
                return new Response("ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 5, initialDelayMs: 1, jitter: 0 },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(200);
        expect(calls).toBe(3);
    });

    it.each(["POST", "PATCH", "post", "patch"])(
        "rejects unsafe retry method %s when the policy is created",
        (method) => {
            const dispatch = vi.fn<typeof fetch>();

            expect(() =>
                composedFetch({
                    fetch: dispatch,
                    retryPolicy: { retryableMethods: ["GET", method] },
                }),
            ).toThrow(/retryableMethods cannot include (?:POST|PATCH)/i);
            expect(dispatch).not.toHaveBeenCalled();
        },
    );

    it("jitters Retry-After delays so simultaneous 429s do not retry in lockstep (SDK-4)", async () => {
        // The docblock always promised "Retry-After capped after jitter", but
        // only the X-RateLimit-Reset path jittered: every client rate-limited
        // at the same instant retried at exactly the same instant.
        vi.useFakeTimers();
        const randomSpy = vi.spyOn(Math, "random");
        try {
            const delays: number[] = [];
            const make = () =>
                composedFetch({
                    fetch: (async () =>
                        new Response("rate", {
                            status: 429,
                            headers: { "Retry-After": "5" },
                        })) as typeof fetch,
                    retryPolicy: { maxRetries: 1 },
                    hooks: {
                        onRetry: (ctx) => {
                            delays.push(ctx.delayMs);
                        },
                    },
                });
            randomSpy.mockReturnValue(0.25);
            const first = make()("https://example.test/x");
            await vi.advanceTimersByTimeAsync(10_000);
            await first;
            randomSpy.mockReturnValue(0.75);
            const second = make()("https://example.test/x");
            await vi.advanceTimersByTimeAsync(10_000);
            await second;
            expect(delays).toHaveLength(2);
            // Identical inputs, different random draws => different delays.
            expect(delays[0]).not.toBe(delays[1]);
            // Jitter on the header path is positive-only: never shorter than
            // the server asked for.
            for (const delay of delays) expect(delay).toBeGreaterThanOrEqual(5000);
        } finally {
            randomSpy.mockRestore();
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it.each([
        [
            "initialDelayMs negative",
            { initialDelayMs: -1 },
            "composedFetch: initialDelayMs must be a finite number greater than or equal to zero",
        ],
        [
            "initialDelayMs NaN",
            { initialDelayMs: Number.NaN },
            "composedFetch: initialDelayMs must be a finite number greater than or equal to zero",
        ],
        [
            "maxDelayMs negative",
            { maxDelayMs: -5 },
            "composedFetch: maxDelayMs must be a finite number greater than or equal to zero",
        ],
        [
            "maxDelayMs NaN",
            { maxDelayMs: Number.NaN },
            "composedFetch: maxDelayMs must be a finite number greater than or equal to zero",
        ],
        [
            "jitter negative",
            { jitter: -0.1 },
            "composedFetch: jitter must be a finite number from 0 through 1",
        ],
        [
            "jitter above 1",
            { jitter: 1.5 },
            "composedFetch: jitter must be a finite number from 0 through 1",
        ],
        [
            "jitter NaN",
            { jitter: Number.NaN },
            "composedFetch: jitter must be a finite number from 0 through 1",
        ],
    ])(
        "rejects an invalid retry policy at construction: %s (SDK-5)",
        (_label, retryPolicy, message) => {
            // validateRetryPolicy checked only maxRetries; a negative maxDelayMs
            // produced a tight retry loop instead of a loud config error.
            expect(() => composedFetch({ retryPolicy })).toThrow(message);
        },
    );

    it("accepts the inclusive maxDelayMs and jitter boundaries", () => {
        expect(() => composedFetch({ retryPolicy: { maxDelayMs: 0, jitter: 1 } })).not.toThrow();
    });

    it.each([
        ["negative", -1],
        ["NaN", Number.NaN],
        ["positive infinity", Number.POSITIVE_INFINITY],
    ])("rejects a %s computeDelay result before scheduling a retry", async (_label, delayMs) => {
        const f = composedFetch({
            fetch: (async () => new Response("retry", { status: 503 })) as typeof fetch,
            retryPolicy: { maxRetries: 1, computeDelay: () => delayMs },
        });

        await expect(f("https://example.test/x")).rejects.toThrow(
            /computeDelay must return a finite number greater than or equal to zero/,
        );
    });

    it("honors Retry-After header (seconds)", async () => {
        const delays: number[] = [];
        const f = composedFetch({
            fetch: (async () => {
                return new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "1" },
                });
            }) as typeof fetch,
            retryPolicy: {
                maxRetries: 1,
                initialDelayMs: 9999,
                jitter: 0,
                computeDelay: (_attempt, response) => {
                    const ra = response?.headers.get("Retry-After");
                    const ms = ra ? Number.parseInt(ra, 10) * 1000 : 9999;
                    delays.push(ms);
                    return 1; // shrink wait so the test is fast
                },
            },
        });
        await f("https://example.test/x");
        expect(delays).toEqual([1000]);
    });

    it("treats Retry-After: 0 as an immediate (0ms) retry, not exponential backoff", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "0" },
                })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 1, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x");
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(0); // 0, not the backoff value (1)
    });

    it("invokes onRetry between attempts with the delay", async () => {
        const onRetry = vi.fn();
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("err", { status: 500 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 1, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x");
        expect(calls).toBe(3);
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry.mock.calls[0]![0].nextAttempt).toBe(1);
        expect(onRetry.mock.calls[1]![0].nextAttempt).toBe(2);
        expect(onRetry.mock.calls[0]![0].delayMs).toBeGreaterThan(0);
    });
});

describe("composedFetch — metrics", () => {
    it("emits request duration and rate-limit remaining metrics", async () => {
        const metrics: Array<{ name: string; value: number; attributes?: Record<string, unknown> }> =
            [];
        const f = composedFetch({
            fetch: (async () =>
                new Response("ok", {
                    status: 200,
                    headers: { "X-RateLimit-Remaining": "42" },
                })) as typeof fetch,
            hooks: {
                onMetric: (metric) => {
                    metrics.push(metric);
                },
            },
        });

        await f("https://example.test/x");

        expect(metrics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "request.duration",
                    value: expect.any(Number),
                    attributes: expect.objectContaining({ method: "GET", outcome: "success" }),
                }),
                { name: "rate_limit.remaining", value: 42, attributes: { method: "GET" } },
            ]),
        );
    });

    it("emits retry.count when scheduling a retry", async () => {
        const metrics: string[] = [];
        const f = composedFetch({
            fetch: (async () => new Response("rate", { status: 429 })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 1, jitter: 0 },
            hooks: {
                onMetric: (metric) => {
                    metrics.push(metric.name);
                },
            },
        });

        await f("https://example.test/x");

        expect(metrics).toContain("retry.count");
    });

    it("does not require onMetric to be set", async () => {
        const f = composedFetch({
            fetch: (async () => new Response("ok", { status: 200 })) as typeof fetch,
        });

        await expect(f("https://example.test/x")).resolves.toHaveProperty("status", 200);
    });
});

describe("composedFetch — abort during retry backoff", () => {
    it("rejects promptly when the signal aborts mid-backoff", async () => {
        const controller = new AbortController();
        // A deliberately huge 5s backoff: an abort that interrupts it rejects in
        // ~10ms, one that does NOT would take the full 5s. Asserting rejection
        // under 1s proves interruption with ~100x headroom over event-loop noise,
        // so the check no longer false-reds under CPU load (unlike a tight 150ms
        // bound against a 300ms backoff).
        const backoffMs = 5000;
        const f = composedFetch({
            fetch: (async () => new Response("retry", { status: 503 })) as typeof fetch,
            retryPolicy: {
                maxRetries: 1,
                jitter: 0,
                computeDelay: () => backoffMs,
            },
        });

        const started = Date.now();
        const request = f("https://example.test/x", { method: "GET", signal: controller.signal });
        setTimeout(() => controller.abort(new Error("stop waiting")), 10);

        await expect(request).rejects.toThrow(/stop waiting|abort/i);
        // Comfortably below the 5s backoff: the abort cut the wait short.
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe("composedFetch — abort thrown by fetch itself (not during backoff)", () => {
    it("does not fire onRetry or retry.count when the in-flight fetch rejects with AbortError", async () => {
        const controller = new AbortController();
        const onError = vi.fn();
        const onRetry = vi.fn();
        const metricNames: string[] = [];
        const f = composedFetch({
            // The wrapped fetch rejects with a DOMException AbortError as soon as
            // the request is issued, simulating a cancellation/timeout mid-flight.
            fetch: (async () => {
                controller.abort();
                throw new DOMException("aborted", "AbortError");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: {
                onError,
                onRetry,
                onMetric: (metric) => {
                    metricNames.push(metric.name);
                },
            },
        });

        await expect(
            f("https://example.test/x", { method: "GET", signal: controller.signal }),
        ).rejects.toThrow(/abort/i);

        // onError is appropriate (the request failed); onRetry / retry.count are not
        // (the request was cancelled, no further attempt was ever issued).
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
        expect(metricNames).not.toContain("retry.count");
    });

    it("treats an AbortError from fetch as terminal even when the caller's signal never aborted", async () => {
        // The caller's signal stays un-aborted, so the `template.signal.aborted`
        // clause above cannot fire. Only the name-based isAbortError check can
        // stop the retry here — this is the path that guards an inner timeout
        // inside the caller's own fetch (a per-attempt deadline, say).
        const onRetry = vi.fn();
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                throw new DOMException("aborted", "AbortError");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: { onRetry },
        });

        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow(/abort/i);
        expect(calls).toBe(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it("retries a callable rejection named AbortError: abort detection needs an object", async () => {
        // Abort detection is duck-typed on purpose (constructor identity is not
        // stable across realms), but it still requires an OBJECT. A callable
        // value that merely carries the name "AbortError" — a stray class or a
        // function reference thrown by a broken fetch polyfill — is an ordinary
        // transport failure and must follow the retry path, not be mistaken for
        // a cancellation.
        const onRetry = vi.fn();
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                if (calls === 1) {
                    // eslint-disable-next-line @typescript-eslint/only-throw-error
                    throw function AbortError() {
                        /* a callable, not a DOMException */
                    };
                }
                return new Response("ok");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: { onRetry },
        });

        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(200);
        expect(calls).toBe(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});

describe("composedFetch — default retry policy (no override of the internals)", () => {
    // These tests deliberately do NOT pass computeDelay/retryableMethods so the
    // module's own DEFAULT_RETRY_POLICY + computeRetryDelay/applyJitter/mergeRetryPolicy
    // paths run for real (the override-based tests above bypass them).

    it("retries every default read-only method (GET/HEAD/OPTIONS) and skips PUT/DELETE/POST/PATCH (RETRY-001)", async () => {
        for (const method of ["GET", "HEAD", "OPTIONS"] as const) {
            let calls = 0;
            const f = composedFetch({
                fetch: (async () => {
                    calls++;
                    return new Response("x", { status: 503 });
                }) as typeof fetch,
                // initialDelayMs:0 keeps backoff at 0ms; no retryableMethods override.
                retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            });
            await f("https://example.test/x", { method });
            expect(calls, `${method} should be retried by default`).toBe(2);
        }
        for (const method of ["PUT", "DELETE", "POST", "PATCH"] as const) {
            let calls = 0;
            const f = composedFetch({
                fetch: (async () => {
                    calls++;
                    return new Response("x", { status: 503 });
                }) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            });
            await f("https://example.test/x", { method });
            expect(calls, `${method} should NOT be retried by default`).toBe(1);
        }
    });

    it("retries PUT/DELETE when retryableMethods is explicitly opted in (mirrors retryMutationMethods)", async () => {
        for (const method of ["PUT", "DELETE"] as const) {
            let calls = 0;
            const f = composedFetch({
                fetch: (async () => {
                    calls++;
                    return new Response("x", { status: 503 });
                }) as typeof fetch,
                retryPolicy: {
                    maxRetries: 1,
                    initialDelayMs: 0,
                    jitter: 0,
                    retryableMethods: ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"],
                },
            });
            await f("https://example.test/x", { method });
            expect(calls, `${method} should be retried with the explicit opt-in`).toBe(2);
        }
    });

    it("uppercases caller-supplied retryableMethods so lowercase safe opt-in still matches", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("x", { status: 503 });
            }) as typeof fetch,
            // lowercase 'put' — mergeRetryPolicy must .toUpperCase() it to match "PUT".
            retryPolicy: {
                maxRetries: 2,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["put"],
            },
        });
        await f("https://example.test/x", { method: "PUT" });
        expect(calls).toBe(3);
    });

    it("only retries the default status codes (408/429/5xx); a 404 is returned immediately", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("nope", { status: 404 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 3, initialDelayMs: 0, jitter: 0 },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(404);
        expect(calls).toBe(1);
        // And 408 IS in the default set.
        let calls408 = 0;
        const g = composedFetch({
            fetch: (async () => {
                calls408++;
                return new Response("timeout", { status: 408 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        await g("https://example.test/x", { method: "GET" });
        expect(calls408).toBe(2);
    });

    it("schedules the exact Retry-After (seconds) delay through the internal computeRetryDelay", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "2" },
                })) as typeof fetch,
            // initialDelayMs is huge so a missed Retry-After branch would be obvious;
            // jitter:0 keeps the value exact. No computeDelay override.
            retryPolicy: { maxRetries: 1, initialDelayMs: 99_999, maxDelayMs: 60_000, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(2000);
    });

    it("caps Retry-After (seconds) at maxDelayMs", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "9999" },
                })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, maxDelayMs: 5_000, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(5_000);
    });

    it("treats Retry-After: 0 as 0ms (not the exponential fallback) through computeRetryDelay", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "0" },
                })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 50_000, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(0);
    });

    it("falls back to X-RateLimit-Reset (epoch seconds, jittered) when Retry-After is absent", async () => {
        // positiveOnly jitter branch: delay * (1 + Math.random() * jitter).
        // random=0 → multiplier 1 (the base); random=1 → multiplier (1 + jitter).
        // Asserting BOTH pins the `1 +` and `* jitter` arithmetic.
        for (const [rand, lo, hi] of [
            [0, 9_000, 10_100],
            [1, 11_000, 12_100],
        ] as const) {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            try {
                const onRetry = vi.fn();
                const resetEpoch = Math.floor(Date.now() / 1000) + 10; // ~10s out
                const f = composedFetch({
                    fetch: (async () =>
                        new Response("rate", {
                            status: 429,
                            headers: { "X-RateLimit-Reset": String(resetEpoch) },
                        })) as typeof fetch,
                    retryPolicy: {
                        maxRetries: 1,
                        initialDelayMs: 50_000,
                        maxDelayMs: 60_000,
                        jitter: 0.2,
                    },
                    hooks: { onRetry },
                });
                await f("https://example.test/x", { method: "GET" });
                const delay = onRetry.mock.calls[0]![0].delayMs;
                // random=1 must inflate the ~10s base by +20% (jitter 0.2) → ~12s,
                // strictly more than the random=0 base (~10s).
                expect(delay).toBeGreaterThan(lo);
                expect(delay).toBeLessThan(hi);
            } finally {
                vi.restoreAllMocks();
            }
        }
    });

    it("uses exponential initialDelayMs * 2**attempt for the fallback (no headers)", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5); // (random-0.5)=0 → applyJitter returns delay unchanged
        try {
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () => new Response("err", { status: 500 })) as typeof fetch,
                retryPolicy: { maxRetries: 2, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0.4 },
                hooks: { onRetry },
            });
            await f("https://example.test/x", { method: "GET" });
            // attempt 0 → 100 * 2**0 = 100; attempt 1 → 100 * 2**1 = 200.
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
            expect(onRetry.mock.calls[1]![0].delayMs).toBe(200);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it("applyJitter is a no-op when jitter <= 0 (boundary), so the fallback delay is exact", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () => new Response("err", { status: 500 })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 250, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        // jitter 0 → applyJitter returns 250 unchanged (no randomness involved).
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(250);
    });

    it("applyJitter with a positive symmetric jitter stays within ±jitter of the base delay", async () => {
        // Symmetric branch: delay * (1 + (random-0.5)*jitter). With random=1 the
        // multiplier is (1 + 0.5*jitter); with random=0 it is (1 - 0.5*jitter).
        for (const [rand, expected] of [
            [1, 250 * (1 + 0.5 * 0.4)],
            [0, 250 * (1 - 0.5 * 0.4)],
        ] as const) {
            vi.spyOn(Math, "random").mockReturnValue(rand);
            try {
                const onRetry = vi.fn();
                const f = composedFetch({
                    fetch: (async () => new Response("err", { status: 500 })) as typeof fetch,
                    retryPolicy: { maxRetries: 1, initialDelayMs: 250, maxDelayMs: 60_000, jitter: 0.4 },
                    hooks: { onRetry },
                });
                await f("https://example.test/x", { method: "GET" });
                expect(onRetry.mock.calls[0]![0].delayMs).toBeCloseTo(expected, 5);
            } finally {
                vi.restoreAllMocks();
            }
        }
    });

    it("network-error retries report a 1-indexed nextAttempt and stop exactly at maxRetries", async () => {
        const onRetry = vi.fn();
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                throw new Error("ETIMEDOUT");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: { onRetry },
        });
        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow("ETIMEDOUT");
        expect(calls).toBe(3); // initial + 2 retries, then exhausted
        expect(onRetry).toHaveBeenCalledTimes(2);
        expect(onRetry.mock.calls[0]![0].nextAttempt).toBe(1);
        expect(onRetry.mock.calls[1]![0].nextAttempt).toBe(2);
        // The onRetry cause for a network error carries { error }, not { response }.
        expect(onRetry.mock.calls[0]![0].cause).toHaveProperty("error");
        expect((onRetry.mock.calls[0]![0].cause as { error: unknown }).error).toBeInstanceOf(Error);
    });

    it("retryPolicy: false disables wrapper-side retry (maxRetries forced to 0)", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("x", { status: 503 });
            }) as typeof fetch,
            retryPolicy: false,
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(503);
        expect(calls).toBe(1);
    });

    it("wraps a thrown non-Error rejection into an Error when retries exhaust", async () => {
        const f = composedFetch({
            fetch: (async () => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw "string failure";
            }) as typeof fetch,
            retryPolicy: { maxRetries: 0, initialDelayMs: 0, jitter: 0 },
        });
        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow(
            "string failure",
        );
        await f("https://example.test/x", { method: "GET" }).catch((e: unknown) => {
            expect(e).toBeInstanceOf(Error);
        });
    });

    it("preserves the original non-Error rejection as `cause`", async () => {
        const reason = { code: "ECONNRESET", syscall: "read" };
        const f = composedFetch({
            fetch: (async () => {
                // eslint-disable-next-line @typescript-eslint/only-throw-error
                throw reason;
            }) as typeof fetch,
            retryPolicy: { maxRetries: 0, initialDelayMs: 0, jitter: 0 },
        });
        const err = await f("https://example.test/x", { method: "GET" }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        // toBe, not toEqual: the diagnostic payload must be the same object.
        expect((err as Error).cause).toBe(reason);
    });
});

describe("composedFetch — request shape + metrics edges", () => {
    it("derives the URL and method from a Request object", async () => {
        const events: RequestContext[] = [];
        const { fn } = mockFetch(() => new Response("ok"));
        const f = composedFetch({
            fetch: fn,
            hooks: { beforeRequest: (ctx) => {
                events.push(ctx);
            } },
        });
        await f(new Request("https://example.test/from-request", { method: "delete" }));
        expect(events[0]!.url).toBe("https://example.test/from-request");
        expect(events[0]!.method).toBe("DELETE"); // uppercased
    });

    it("derives the URL from a URL instance", async () => {
        const events: RequestContext[] = [];
        const { fn } = mockFetch(() => new Response("ok"));
        const f = composedFetch({
            fetch: fn,
            hooks: { beforeRequest: (ctx) => {
                events.push(ctx);
            } },
        });
        await f(new URL("https://example.test/from-url?q=1"));
        expect(events[0]!.url).toBe("https://example.test/from-url?q=1");
        expect(events[0]!.method).toBe("GET"); // default when no init.method
    });

    it("exposes the injected requestId on the hook context", async () => {
        const events: RequestContext[] = [];
        const { fn } = mockFetch(() => new Response("ok"));
        const f = composedFetch({
            fetch: fn,
            requestId: () => "fixed-id",
            hooks: { beforeRequest: (ctx) => {
                events.push(ctx);
            } },
        });
        await f("https://example.test/x");
        expect(events[0]!.requestId).toBe("fixed-id");
    });

    it("does NOT emit a rate_limit.remaining metric when the header is absent or non-numeric", async () => {
        const names: string[] = [];
        const f = composedFetch({
            fetch: (async () => new Response("ok", { status: 200 })) as typeof fetch,
            hooks: { onMetric: (m) => {
                names.push(m.name);
            } },
        });
        await f("https://example.test/x");
        expect(names).toContain("request.duration");
        expect(names).not.toContain("rate_limit.remaining");

        const names2: string[] = [];
        const g = composedFetch({
            fetch: (async () =>
                new Response("ok", {
                    status: 200,
                    headers: { "X-RateLimit-Remaining": "not-a-number" },
                })) as typeof fetch,
            hooks: { onMetric: (m) => {
                names2.push(m.name);
            } },
        });
        await g("https://example.test/x");
        expect(names2).not.toContain("rate_limit.remaining");
    });

    it("marks the request.duration outcome as http_error for a non-ok response", async () => {
        const metrics: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
        const f = composedFetch({
            fetch: (async () => new Response("bad", { status: 500 })) as typeof fetch,
            hooks: { onMetric: (m) => {
                metrics.push(m);
            } },
        });
        await f("https://example.test/x");
        const dur = metrics.find((m) => m.name === "request.duration");
        expect(dur?.attributes).toMatchObject({ outcome: "http_error", status: 500 });
    });

    it("marks the request.duration outcome as error on a network failure", async () => {
        const metrics: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
        const f = composedFetch({
            fetch: (async () => {
                throw new Error("DNS fail");
            }) as typeof fetch,
            hooks: { onMetric: (m) => {
                metrics.push(m);
            } },
        });
        await expect(f("https://example.test/x")).rejects.toThrow("DNS fail");
        const dur = metrics.find((m) => m.name === "request.duration");
        expect(dur?.attributes).toMatchObject({ outcome: "error" });
    });
});

describe("getRequestIdFromError", () => {
    it("returns the X-Request-Id from a Fern ClockifyApiError-shaped object", () => {
        const err = {
            name: "ClockifyApiError",
            statusCode: 500,
            rawResponse: { headers: new Headers({ "X-Request-Id": "trace-abc" }) },
        };
        expect(getRequestIdFromError(err)).toBe("trace-abc");
    });

    it("works when rawResponse.headers is a plain Record", () => {
        const err = {
            statusCode: 500,
            rawResponse: { headers: { "x-request-id": "trace-xyz" } },
        };
        expect(getRequestIdFromError(err)).toBe("trace-xyz");
    });

    it("falls back to CloudFront's correlation id when X-Request-Id is not echoed", () => {
        const err = {
            statusCode: 400,
            rawResponse: { headers: new Headers({ "x-amz-cf-id": "cf-trace-456" }) },
        };
        expect(getRequestIdFromError(err)).toBe("cf-trace-456");
    });

    it("returns undefined when no header / no rawResponse / non-object", () => {
        expect(getRequestIdFromError(null)).toBeUndefined();
        expect(getRequestIdFromError({})).toBeUndefined();
        expect(getRequestIdFromError({ rawResponse: { headers: {} } })).toBeUndefined();
        expect(getRequestIdFromError("string error" as unknown)).toBeUndefined();
    });

    it("returns undefined when a matching Record header value is not a string", () => {
        // The case-insensitive Record branch must reject a non-string value.
        const err = {
            rawResponse: { headers: { "X-Request-Id": 12345 as unknown as string } },
        };
        expect(getRequestIdFromError(err)).toBeUndefined();
    });

    it("matches the X-Request-Id from a Headers instance with exact-case key", () => {
        const err = {
            rawResponse: { headers: new Headers({ "x-request-id": "lower-trace" }) },
        };
        expect(getRequestIdFromError(err)).toBe("lower-trace");
    });
});

describe("composedFetch — guards", () => {
    it("throws when no fetch is available", () => {
        // Force baseFetch undefined by stubbing globalThis.fetch temporarily.
        const original = globalThis.fetch;
        Reflect.deleteProperty(globalThis, "fetch");
        try {
            expect(() => composedFetch({ fetch: undefined as unknown as typeof fetch })).toThrow(
                /no `fetch` implementation found/,
            );
        } finally {
            globalThis.fetch = original;
        }
    });
});

describe("composedFetch — redirect handling (auth-header safety)", () => {
    /** A 3xx response carrying a Location header, as a real fetch would
     *  return under `redirect: "manual"`. */
    function redirectResponse(status: number, location = "https://evil.example/steal"): Response {
        return new Response(null, { status, headers: { Location: location } });
    }

    it("sets redirect: 'manual' on the request init by default", async () => {
        const { fn, calls } = mockFetch(() => new Response("ok"));
        const f = composedFetch({ fetch: fn });
        await f("https://example.test/x");
        expect(calls[0]!.init?.redirect).toBe("manual");
    });

    it("surfaces a 3xx as an error instead of returning the redirect (single-shot)", async () => {
        const { fn, calls } = mockFetch(() => redirectResponse(302));
        const f = composedFetch({ fetch: fn });
        await expect(f("https://example.test/x")).rejects.toThrow(/refusing to follow HTTP 302/);
        // The underlying fetch was called exactly once and was NOT re-issued
        // to the redirect target — auth headers never left the original host.
        expect(calls).toHaveLength(1);
    });

    it("cancels the blocked redirect's body instead of leaving the stream unread", async () => {
        // 302 is not a null-body status, so this Response really has a stream.
        // Nothing downstream can drain it (the error carries no Response), so
        // an uncancelled body would hold its socket until the GC finalizer ran.
        const res = new Response("redirect page", {
            status: 302,
            headers: { Location: "https://evil.example/steal" },
        });
        const cancel = vi.spyOn(res.body!, "cancel");
        const f = composedFetch({ fetch: (async () => res) as typeof fetch });
        await expect(f("https://example.test/x")).rejects.toThrow(/refusing to follow HTTP 302/);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("blocks every 3xx status code, not just 302", async () => {
        for (const status of [301, 303, 307, 308]) {
            const { fn } = mockFetch(() => redirectResponse(status));
            const f = composedFetch({ fetch: fn });
            await expect(f("https://example.test/x")).rejects.toThrow(
                new RegExp(`refusing to follow HTTP ${status}`),
            );
        }
    });

    it("does NOT surface a 3xx when the caller explicitly opts into redirect: 'follow'", async () => {
        // When the caller sets redirect: 'follow', the platform fetch would
        // follow it itself; the wrapper must honor that and not raise.
        const { fn, calls } = mockFetch(() => redirectResponse(302));
        const f = composedFetch({ fetch: fn });
        const res = await f("https://example.test/x", { redirect: "follow" });
        expect(res.status).toBe(302);
        expect(calls[0]!.init?.redirect).toBe("follow");
    });

    it("does not retry a blocked redirect even on a retryable method + retry policy", async () => {
        let count = 0;
        const { fn } = mockFetch(() => {
            count += 1;
            return redirectResponse(307);
        });
        const f = composedFetch({
            fetch: fn,
            // GET is retryable and 307 would normally be retryable if it were
            // in the status list — but a blocked redirect is terminal.
            retryPolicy: { maxRetries: 3, retryableStatusCodes: [307, 500] },
        });
        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow(
            /refusing to follow HTTP 307/,
        );
        expect(count).toBe(1);
    });

    it("does not retry the auth boundary's redirect-follow rejection on a retryable method (SDK-1)", async () => {
        // The boundary used to throw a plain TypeError, which matched no
        // retry-loop guard: a deterministic config error slept 1s then 2s
        // before surfacing, and fired onRetry with a "network_error" cause.
        const inner = vi.fn<typeof fetch>();
        const guarded = authenticatedBoundaryFetch(inner, false);
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: guarded,
            retryPolicy: { maxRetries: 3 },
            hooks: { onRetry },
        });

        const started = Date.now();
        await expect(
            f("https://api.clockify.me/api/v1/user", { method: "GET", redirect: "follow" }),
        ).rejects.toMatchObject({ name: "RedirectNotAllowedError" });
        expect(Date.now() - started).toBeLessThan(500);
        expect(onRetry).not.toHaveBeenCalled();
        expect(inner).not.toHaveBeenCalled();
    });

    it("fires the onError hook for a blocked redirect", async () => {
        const onError = vi.fn();
        const { fn } = mockFetch(() => redirectResponse(302));
        const f = composedFetch({ fetch: fn, hooks: { onError } });
        await expect(f("https://example.test/x")).rejects.toThrow();
        expect(onError).toHaveBeenCalledTimes(1);
        const ctx = onError.mock.calls[0]![0] as { error: unknown };
        expect((ctx.error as Error).message).toMatch(/refusing to follow HTTP 302/);
    });

    it("still returns a normal 2xx unchanged under the default manual policy", async () => {
        const { fn } = mockFetch(() => new Response("body", { status: 200 }));
        const f = composedFetch({ fetch: fn });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("body");
    });

    it("still surfaces a 4xx as a returned response, not an error", async () => {
        const { fn } = mockFetch(() => new Response("nope", { status: 404 }));
        const f = composedFetch({ fetch: fn });
        const res = await f("https://example.test/x");
        expect(res.status).toBe(404);
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign NoCoverage-reach kills (CI run 30420465438,
// wrapper/composed-fetch.ts, group nocov-reach). Each test below reaches a
// previously-uncovered line AND asserts observable behavior — dispatch
// counts, hook receipt, exact delayMs, rejection identity/message — because
// a reach-only test would move these mutants into the denominator as
// survivors instead of killing them (plan §3 trap #4).
//
// Equivalent NoCoverage mutants deliberately NOT chased (see the campaign
// ledger at the end of this file): 141, 285, 366.
// ---------------------------------------------------------------------------

describe("composedFetch — AbortError name guard on the retry path", () => {
    it("retries a non-abort DOMException (NetworkError) instead of treating it as a cancellation", async () => {
        // A DOMException with any other name is a transport failure and must
        // take the retry arm.
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                if (calls === 1) throw new DOMException("flaky handshake", "NetworkError");
                return new Response("recovered", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(200);
        expect(calls).toBe(2);
    });

    it("treats an in-flight AbortError as terminal without onRetry even when the caller signal never aborted", async () => {
        // The caller signal is never aborted, so only the thrown error's name
        // can stop the retry loop.
        const onRetry = vi.fn();
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                throw new DOMException("aborted mid-flight", "AbortError");
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: { onRetry },
        });
        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow(
            /aborted mid-flight/,
        );
        expect(calls).toBe(1);
        expect(onRetry).not.toHaveBeenCalled();
    });
});

describe("composedFetch — exhaustion with neither response nor error (mutants 237-243)", () => {
    // Only a non-conforming fetch double that RESOLVES `undefined` reaches
    // the post-loop fallback (L552-555): such an attempt skips both the
    // error arm and the response arm. `redirect: "follow"` is required so
    // assertNotRedirect returns before touching the undefined response.

    it("throws the exhausted-retries Error when every attempt yields neither response nor error", async () => {
        // S1: exact-message containment kills the emptied string literal
        // (243) and the forced toError(undefined) -> Error("undefined") arm
        // (240); the dispatch count proves the loop ran to exhaustion.
        const dispatch = vi
            .fn<typeof fetch>()
            .mockImplementation(async () => undefined as unknown as Response);
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        await expect(
            f("https://example.test/x", { method: "GET", redirect: "follow" }),
        ).rejects.toThrow("composedFetch: exhausted retries with no response and no error");
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("returns the last real response when the final attempt yields neither response nor error", async () => {
        // S2: lastResponse must win over the fallback throw — asserted by
        // IDENTITY, so a substituted response cannot pass.
        const first = new Response("srv", { status: 503 });
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(first)
            .mockResolvedValueOnce(undefined as unknown as Response);
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        const res = await f("https://example.test/x", { method: "GET", redirect: "follow" });
        expect(res).toBe(first);
        expect(res.status).toBe(503);
        expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("rethrows the last network error rather than the exhausted-retries fallback", async () => {
        // S3: rejection IDENTITY (toBe, not toThrow) — toError must return
        // the original Error instance, and the `lastError != null` arm must
        // win over the fallback message.
        const netErr = new Error("net-flake");
        const dispatch = vi
            .fn<typeof fetch>()
            .mockRejectedValueOnce(netErr)
            .mockResolvedValueOnce(undefined as unknown as Response);
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
        });
        await expect(
            f("https://example.test/x", { method: "GET", redirect: "follow" }),
        ).rejects.toBe(netErr);
        expect(dispatch).toHaveBeenCalledTimes(2);
    });
});

describe("composedFetch — HTTP-date Retry-After delay (mutants 318-326)", () => {
    // All three tests pin the fake clock on a WHOLE second: toUTCString()
    // has whole-second resolution, so only a whole-second `now` makes the
    // date delta exact (and dateMs === 0 exactly for the boundary case).
    // The delay is captured via the onRetry spy BEFORE the timers advance,
    // so a mutant's 60s fake sleep cannot mask the wrong value as a timeout.

    it("honors a future HTTP-date Retry-After as an exact millisecond delta", async () => {
        // D-future: dateMs = +5000 -> Math.min(5000, 60_000) = 5000. The
        // huge initialDelayMs makes every escape route unmistakable: a
        // skipped date branch (320/325) or a min->max flip (326) yields
        // 60_000, and the arithmetic flip (318) caps at 60_000 too.
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        headers: { "Retry-After": new Date(Date.now() + 5_000).toUTCString() },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 99_999, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.runAllTimersAsync();
            await expect(outcome).resolves.toHaveProperty("status", 429);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(5_000);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("falls back to exponential backoff for a past HTTP-date Retry-After", async () => {
        // D-past: dateMs = -5000 fails the `dateMs > 0` guard, so the
        // exponential fallback (initialDelayMs 7 * 2**0 = 7) wins. Mutants
        // that force the guard (319/321/322/324) schedule -5000 instead.
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        headers: { "Retry-After": new Date(Date.now() - 5_000).toUTCString() },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 7, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.runAllTimersAsync();
            await expect(outcome).resolves.toHaveProperty("status", 429);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(7);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("uses backoff for an HTTP-date Retry-After of exactly now (delta 0)", async () => {
        // D-now: dateMs === 0 exactly is the ONLY input that discriminates
        // `dateMs > 0` from the `>=` mutant (323), which would schedule a
        // 0ms date delay instead of the 7ms backoff.
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        headers: { "Retry-After": new Date(Date.now()).toUTCString() },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 7, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.runAllTimersAsync();
            await expect(outcome).resolves.toHaveProperty("status", 429);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(7);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign kills (CI run 30509504520, wrapper/composed-fetch.ts):
// group retry-delay-math. Each test pins an OBSERVABLE payload value — hook
// durationMs, retry.count metric object, or onRetry delayMs — that a named
// survived mutant corrupts. Fake clocks make the arithmetic exact; the
// equivalent survivor (328) is recorded in the campaign ledger, not chased.
// ---------------------------------------------------------------------------

describe("composedFetch — attempt duration math under a pinned fake clock (mutants 158/162/176)", () => {
    it("reports the exact wall-clock durationMs on the single-shot success path", async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(100_000);
            const afterResponse = vi.fn();
            const metrics: Array<{ name: string; value: number }> = [];
            const f = composedFetch({
                fetch: (async () => {
                    vi.setSystemTime(100_250);
                    return new Response("ok", { status: 200 });
                }) as typeof fetch,
                hooks: {
                    afterResponse,
                    onMetric: (m) => {
                        metrics.push(m);
                    },
                },
            });
            await f("https://example.test/x");
            // start=100_000, clock advanced to 100_250 inside the dispatch:
            // Date.now() - start = 250 exactly; the `+ start` mutant reports
            // 200_250 (which still satisfies a >= 0 assertion — hence exact).
            expect(afterResponse.mock.calls[0]![0].durationMs).toBe(250);
            expect(metrics.find((m) => m.name === "request.duration")?.value).toBe(250);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("reports the exact wall-clock durationMs on the single-shot error path", async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(100_000);
            const onError = vi.fn();
            const metrics: Array<{
                name: string;
                value: number;
                attributes?: Record<string, unknown>;
            }> = [];
            const f = composedFetch({
                fetch: (async () => {
                    vi.setSystemTime(100_250);
                    throw new Error("net down");
                }) as typeof fetch,
                hooks: {
                    onError,
                    onMetric: (m) => {
                        metrics.push(m);
                    },
                },
            });
            await expect(f("https://example.test/x")).rejects.toThrow("net down");
            expect(onError.mock.calls[0]![0].durationMs).toBe(250);
            const dur = metrics.find((m) => m.name === "request.duration");
            expect(dur?.value).toBe(250);
            expect(dur?.attributes).toMatchObject({ outcome: "error" });
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("reports the exact wall-clock durationMs through the retry loop", async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(100_000);
            const afterResponse = vi.fn();
            const f = composedFetch({
                fetch: (async () => {
                    vi.setSystemTime(100_250);
                    return new Response("ok", { status: 200 });
                }) as typeof fetch,
                // A truthy policy routes through runWithRetries (its own
                // Date.now() - start at the top of the loop), no sleeps.
                retryPolicy: { maxRetries: 0 },
                hooks: { afterResponse },
            });
            await f("https://example.test/x");
            expect(afterResponse.mock.calls[0]![0].durationMs).toBe(250);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe("composedFetch — retry.count metric payload exactness (mutants 211/212/236)", () => {
    it("emits 1-indexed retry.count values with reason network_error", async () => {
        const metrics: Array<{
            name: string;
            value: number;
            attributes?: Record<string, unknown>;
        }> = [];
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                if (calls <= 2) throw new Error("boom");
                return new Response("ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: {
                onMetric: (m) => {
                    metrics.push(m);
                },
            },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(200);
        // Deep-equal the FULL metric objects: `attempt - 1` would emit -1 then
        // 0, and a blanked reason would emit "" (name-only assertions miss both).
        expect(metrics.filter((m) => m.name === "retry.count")).toEqual([
            {
                name: "retry.count",
                value: 1,
                attributes: { method: "GET", reason: "network_error" },
            },
            {
                name: "retry.count",
                value: 2,
                attributes: { method: "GET", reason: "network_error" },
            },
        ]);
    });

    it("emits 1-indexed retry.count values with the HTTP status as reason", async () => {
        const metrics: Array<{
            name: string;
            value: number;
            attributes?: Record<string, unknown>;
        }> = [];
        const f = composedFetch({
            fetch: (async () => new Response("err", { status: 503 })) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
            hooks: {
                onMetric: (m) => {
                    metrics.push(m);
                },
            },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(503);
        expect(metrics.filter((m) => m.name === "retry.count")).toEqual([
            { name: "retry.count", value: 1, attributes: { method: "GET", reason: "503" } },
            { name: "retry.count", value: 2, attributes: { method: "GET", reason: "503" } },
        ]);
    });
});

describe("composedFetch — absent Retry-After stays ignored on a pre-1970 clock (mutant 305)", () => {
    it("uses exponential backoff when no rate headers exist and Date.now() is negative", async () => {
        vi.useFakeTimers();
        try {
            // 1969-12-31: the only clock where the always-entered header block
            // is observable — new Date(null).getTime() = 0 sits in the FUTURE,
            // so the guard-to-`true` mutant returns min(+86_400_000, 60_000).
            vi.setSystemTime(-86_400_000);
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () => new Response("rate", { status: 429 })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.advanceTimersByTimeAsync(0);
            await vi.runAllTimersAsync();
            const res = await outcome;
            expect(res.status).toBe(429);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe("composedFetch — Retry-After seconds guard falls back to backoff (mutants 309/311/312)", () => {
    it("falls back to exponential backoff for a negative Retry-After", async () => {
        // Real clock on purpose: V8 parses new Date("-5") as a FIXED 2001-05
        // date, so the HTTP-date arm is negative only on a post-2001 clock —
        // never run this fixture with a system clock mocked before 2001.
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "-5" },
                })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        expect(onRetry).toHaveBeenCalledTimes(1);
        // Weakening `isFinite(seconds) && seconds >= 0` (to `||` or `true`)
        // returns Math.min(-5 * 1000, maxDelayMs) = -5000, not the 100ms backoff.
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
    });

    it("falls back to exponential backoff for a non-numeric Retry-After", async () => {
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () =>
                new Response("rate", {
                    status: 429,
                    headers: { "Retry-After": "abc" },
                })) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
            hooks: { onRetry },
        });
        await f("https://example.test/x", { method: "GET" });
        expect(onRetry).toHaveBeenCalledTimes(1);
        // Guard-to-`true` returns Math.min(NaN * 1000, maxDelayMs) = NaN.
        expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
    });
});

describe("composedFetch — X-RateLimit-Reset value guards (mutants 332/337/339)", () => {
    it("ignores an overflow-to-Infinity X-RateLimit-Reset", async () => {
        vi.useFakeTimers();
        try {
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        // parseInt of 400 nines === Infinity (NaN inputs cannot
                        // distinguish this mutant; Infinity is the killing class).
                        headers: { "X-RateLimit-Reset": "9".repeat(400) },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.advanceTimersByTimeAsync(0);
            await vi.runAllTimersAsync();
            await outcome;
            expect(onRetry).toHaveBeenCalledTimes(1);
            // `Number.isFinite(reset)` -> true: dateMs = Infinity enters the
            // branch and Math.min caps it to maxDelayMs -> 60_000, not 100.
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("ignores an X-RateLimit-Reset in the past", async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(1_700_000_000_000);
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        // 100s before the pinned clock -> dateMs = -100_000.
                        headers: { "X-RateLimit-Reset": "1699999900" },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.advanceTimersByTimeAsync(0);
            await vi.runAllTimersAsync();
            await outcome;
            expect(onRetry).toHaveBeenCalledTimes(1);
            // `dateMs > 0` -> true returns -100_000 as the delay.
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("ignores an X-RateLimit-Reset exactly at the current second (boundary)", async () => {
        vi.useFakeTimers();
        try {
            // Whole-second-aligned pin: reset * 1000 - Date.now() === 0 exactly
            // (only microtasks run between response and computeRetryDelay, so
            // the fake clock cannot drift off the boundary).
            vi.setSystemTime(1_700_000_000_000);
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () =>
                    new Response("rate", {
                        status: 429,
                        headers: { "X-RateLimit-Reset": "1700000000" },
                    })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            await vi.advanceTimersByTimeAsync(0);
            await vi.runAllTimersAsync();
            await outcome;
            expect(onRetry).toHaveBeenCalledTimes(1);
            // `dateMs > 0` -> `dateMs >= 0` returns applyJitter(0, 0, true) = 0.
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe("composedFetch — applyJitter zero-jitter fast path", () => {
    it("keeps the backoff delay exact when jitter is 0", async () => {
        // SDK-5 now rejects a negative jitter at construction (see the
        // invalid-retry-policy cases above), so `jitter: 0` is the only
        // reachable no-jitter input. The former mutants-349/350 kill via
        // `jitter: -1` is impossible — and for jitter 0 the guard is
        // mathematically equivalent to falling through (the spread term is
        // multiplied by zero), so this pins the observable contract instead.
        vi.spyOn(Math, "random").mockReturnValue(0);
        try {
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () => new Response("err", { status: 500 })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            await f("https://example.test/x", { method: "GET" });
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it("does not consume Math.random when jitter is 0", async () => {
        const random = vi.spyOn(Math, "random");
        try {
            const onRetry = vi.fn();
            const f = composedFetch({
                fetch: (async () => new Response("err", { status: 503 })) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 100, maxDelayMs: 60_000, jitter: 0 },
                hooks: { onRetry },
            });
            await f("https://example.test/x", { method: "GET" });
            expect(onRetry.mock.calls[0]![0].delayMs).toBe(100);
            // `jitter <= 0` -> `jitter < 0`: at jitter 0 the mutant's product
            // delay * (1 + (r - 0.5) * 0) === delay is an exact IEEE-754
            // identity, so the ONLY observable difference is that it consumes
            // Math.random (request ids use node:crypto.randomUUID, and the
            // stubbed fetch double resolves without touching Math.random).
            expect(random).not.toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
        }
    });
});

describe("composedFetch — abort classification in the retry error path", () => {

    it("preserves a custom abort reason mid-flight without firing onRetry or retry.count", async () => {
        // Mutant 186 (L504 `template.signal.aborted` -> false): the
        // aborted-signal check is the workhorse for custom abort reasons that
        // surface as a plain non-DOMException Error. Under the mutant the loop
        // schedules a retry — onRetry fires and a retry.count metric is emitted
        // BEFORE sleep() rejects with the same reason, so rejection identity
        // and dispatch count are identical either way. The kill is
        // onRetry-never + no retry.count.
        const controller = new AbortController();
        const reason = new Error("custom-stop");
        const onRetry = vi.fn();
        const metricNames: string[] = [];
        let dispatches = 0;
        const f = composedFetch({
            fetch: (async () => {
                dispatches++;
                controller.abort(reason);
                // Hang: abortable() must reject via its abort listener.
                return new Promise<Response>(() => {});
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 1, jitter: 0 },
            hooks: {
                onRetry,
                onMetric: (metric) => {
                    metricNames.push(metric.name);
                },
            },
        });

        await expect(
            f("https://example.test/x", { method: "GET", signal: controller.signal }),
        ).rejects.toBe(reason);
        expect(dispatches).toBe(1);
        // Decisive assertions: a cancelled attempt must never schedule a retry.
        expect(onRetry).not.toHaveBeenCalled();
        expect(metricNames).not.toContain("retry.count");
    });

    it("treats a genuine DOMException AbortError thrown by fetch as terminal (single dispatch, same object)", async () => {
        // A real AbortError must short-circuit the retry loop. Dispatch count
        // and onRetry prove it did not merely rethrow after exhaustion.
        const abortError = new DOMException("The operation was aborted.", "AbortError");
        const onRetry = vi.fn();
        let dispatches = 0;
        const f = composedFetch({
            fetch: (async () => {
                dispatches++;
                throw abortError;
            }) as typeof fetch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 1, jitter: 0 },
            hooks: { onRetry },
        });

        await expect(f("https://example.test/x", { method: "GET" })).rejects.toBe(abortError);
        expect(dispatches).toBe(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it.each([
        {
            label: "DOMException",
            makeError: (): Error => new DOMException("platform abort", "AbortError"),
        },
        {
            label: "plain Error",
            makeError: (): Error =>
                Object.assign(new Error("polyfill abort"), { name: "AbortError" }),
        },
    ])(
        "treats a $label AbortError as terminal for GET and explicitly retryable PUT",
        async ({ makeError }) => {
            vi.useFakeTimers();
            try {
                for (const method of ["GET", "PUT"] as const) {
                    const abortError = makeError();
                    const onRetry = vi.fn();
                    const dispatch = vi.fn<typeof fetch>(async () => {
                        throw abortError;
                    });
                    const f = composedFetch({
                        fetch: dispatch,
                        retryPolicy: {
                            maxRetries: 2,
                            initialDelayMs: 60_000,
                            jitter: 0,
                            retryableMethods:
                                method === "PUT" ? ["GET", "PUT"] : ["GET"],
                        },
                        hooks: { onRetry },
                    });
                    let settled: FetchOutcome | undefined;
                    void observeFetch(f("https://example.test/x", { method })).then(
                        (outcome) => {
                            settled = outcome;
                        },
                    );

                    await vi.advanceTimersByTimeAsync(0);

                    expect(settled).toEqual({ status: "rejected", reason: abortError });
                    expect(dispatch).toHaveBeenCalledOnce();
                    expect(onRetry).not.toHaveBeenCalled();

                    await vi.runAllTimersAsync();
                    expect(dispatch).toHaveBeenCalledOnce();
                }
            } finally {
                vi.clearAllTimers();
                vi.useRealTimers();
            }
        },
    );

    it("retries a genuine DOMException whose name is not AbortError", async () => {
        // A DOMException that is not an abort (for example DataError) remains
        // a transient transport failure and must be retried.
        const dataError = new DOMException("payload mangled", "DataError");
        const onRetry = vi.fn();
        let dispatches = 0;
        const f = composedFetch({
            fetch: (async () => {
                dispatches++;
                throw dataError;
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 1, jitter: 0 },
            hooks: { onRetry },
        });

        await expect(f("https://example.test/x", { method: "GET" })).rejects.toBe(dataError);
        expect(dispatches).toBe(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("still retries a plain network error when the DOMException global is undefined", async () => {
        // Abort classification is structural, so it must neither depend on the
        // current realm's DOMException constructor nor widen ordinary errors.
        vi.stubGlobal("DOMException", undefined);
        try {
            const netErr = new Error("net down");
            let dispatches = 0;
            const f = composedFetch({
                fetch: (async () => {
                    dispatches++;
                    throw netErr;
                }) as typeof fetch,
                retryPolicy: { maxRetries: 1, initialDelayMs: 1, jitter: 0 },
            });

            await expect(f("https://example.test/x", { method: "GET" })).rejects.toBe(netErr);
            expect(dispatches).toBe(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe("composedFetch — out-of-contract truthy retryPolicy merges to full defaults (mutant 140)", () => {
    // Mutant 140 (L412 `user === false` -> `user === true`) is distinguishable
    // ONLY by an out-of-TypeScript-contract input: `retryPolicy: true` is
    // truthy (so it passes the L231 filter and reaches mergeRetryPolicy) but is
    // not an object, so every property read yields undefined and the original
    // merges the FULL defaults (maxRetries 2), while the mutant returns
    // { ...defaults, maxRetries: 0 } and never retries. MAINTAINER SIGN-OFF
    // FLAG: this test deliberately pins an out-of-TS-contract input — the only
    // input class that reaches the mutated comparison (disposition v2, id 140).
    type WrapperRetryPolicy = NonNullable<
        NonNullable<Parameters<typeof composedFetch>[0]>["retryPolicy"]
    >;

    it("merges an out-of-contract truthy retryPolicy into the full defaults (mutant 140)", async () => {
        vi.useFakeTimers();
        vi.spyOn(Math, "random").mockReturnValue(0.5); // symmetric jitter multiplier = 1 -> exact backoff
        try {
            let calls = 0;
            const f = composedFetch({
                fetch: (async () => {
                    calls++;
                    return new Response("err", { status: 500 });
                }) as typeof fetch,
                retryPolicy: true as unknown as WrapperRetryPolicy,
            });
            const outcome = f("https://example.test/x", { method: "GET" });
            // Default-policy backoff: 1000ms after attempt 0, 2000ms after attempt 1.
            await vi.advanceTimersByTimeAsync(1200);
            await vi.advanceTimersByTimeAsync(2400);
            const res = await outcome;
            expect(res.status).toBe(500);
            expect(calls).toBe(3); // initial + the DEFAULT maxRetries 2 — not the mutant's 0
        } finally {
            vi.restoreAllMocks();
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe("composedFetch — retry-path hook receipt payloads (mutants 171/182/218/234)", () => {
    // runWithRetries builds its own hook payload objects (L468/L491/L528/L543);
    // the no-retry path builds different ones inside runSingleAttempt, so every
    // test here MUST run with a truthy retryPolicy. The kills are the payload
    // field/identity assertions — a bare rejects/resolves check passes under
    // the {}-payload mutants.

    it("passes a fully-populated RequestContext to beforeRequest on the retry path (mutant 171)", async () => {
        const beforeRequest = vi.fn();
        const { fn } = mockFetch(() => new Response("ok", { status: 200 }));
        const f = composedFetch({
            fetch: fn,
            retryPolicy: { maxRetries: 0 },
            hooks: { beforeRequest },
        });
        await f("https://example.test/wired", { method: "POST" });
        expect(beforeRequest).toHaveBeenCalledTimes(1);
        const ctx = beforeRequest.mock.calls[0]![0] as RequestContext;
        expect(ctx).toMatchObject({
            url: "https://example.test/wired",
            method: "POST",
            attempt: 0,
        });
        expect(ctx.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(ctx.headers).toBeInstanceOf(Headers);
    });

    it("passes the error identity and request fields to onError on the retry path (mutant 182)", async () => {
        const boom = new Error("wired boom");
        const onError = vi.fn();
        const f = composedFetch({
            fetch: (async () => {
                throw boom;
            }) as typeof fetch,
            retryPolicy: { maxRetries: 0 },
            hooks: { onError },
        });
        await expect(f("https://example.test/err", { method: "GET" })).rejects.toBe(boom);
        expect(onError).toHaveBeenCalledTimes(1);
        const payload = onError.mock.calls[0]![0] as {
            error: unknown;
            url: string;
            method: string;
            attempt: number;
            durationMs: unknown;
        };
        expect(payload.error).toBe(boom); // identity, not merely "an Error"
        expect(payload).toMatchObject({
            url: "https://example.test/err",
            method: "GET",
            attempt: 0,
        });
        expect(typeof payload.durationMs).toBe("number");
    });

    it("passes the exact Response identity to afterResponse on the retry path (mutant 218)", async () => {
        const held = new Response("held", { status: 200 });
        const afterResponse = vi.fn();
        const f = composedFetch({
            fetch: (async () => held) as typeof fetch,
            retryPolicy: { maxRetries: 0 },
            hooks: { afterResponse },
        });
        const res = await f("https://example.test/after", { method: "GET" });
        expect(res).toBe(held);
        expect(afterResponse).toHaveBeenCalledTimes(1);
        const payload = afterResponse.mock.calls[0]![0] as ResponseContext;
        expect(payload.response).toBe(held); // identity
        expect(payload).toMatchObject({
            url: "https://example.test/after",
            method: "GET",
            attempt: 0,
        });
        expect(typeof payload.durationMs).toBe("number");
    });

    it("reports the failing response as the onRetry cause (mutant 234)", async () => {
        const failed = new Response("first", { status: 500 });
        let calls = 0;
        const onRetry = vi.fn();
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return calls === 1 ? failed : new Response("ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: { onRetry },
        });
        const res = await f("https://example.test/x", { method: "GET" });
        expect(res.status).toBe(200);
        expect(calls).toBe(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
        const payload = onRetry.mock.calls[0]![0] as { cause: { response?: Response } };
        expect(payload.cause).toHaveProperty("response");
        expect(payload.cause.response).toBe(failed); // identity of the 500 that caused the retry
        expect(payload.cause.response!.status).toBe(500);
    });
});

describe("composedFetch — nullish-rejection exhaustion guard (mutant 213)", () => {
    // Mutant 213 (L527 `response != null` -> `true`). The false arm is
    // reachable ONLY when an attempt's rejection value is itself nullish,
    // leaving BOTH `response` and `error` unset. MAINTAINER SIGN-OFF FLAG:
    // pins an out-of-TS-contract fetch double (rejects with `null`) — the only
    // input class reaching this branch (disposition v2, id 213). retryPolicy
    // MUST be a truthy object: `retryPolicy: false` short-circuits into
    // runSingleAttempt and never reaches L527.
    it("rejects with the exhausted-retries error when every attempt rejects nullish (mutant 213)", async () => {
        const afterResponse = vi.fn();
        const f = composedFetch({
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            fetch: (() => Promise.reject(null)) as typeof fetch,
            retryPolicy: { maxRetries: 0 },
            hooks: { afterResponse },
        });
        await expect(f("https://example.test/x", { method: "GET" })).rejects.toThrow(
            /exhausted retries with no response and no error/,
        );
        // The mutant instead enters the response block with `response ===
        // undefined`, fires afterResponse once, and RESOLVES to undefined.
        expect(afterResponse).not.toHaveBeenCalled();
    });
});

describe("composedFetch — Request template passthrough (mutants 245/246)", () => {
    it("preserves referrer and referrerPolicy of a Request input on the retry path (mutants 245/246)", async () => {
        // buildRequestTemplate only runs on the retry path (truthy retryPolicy).
        // The surviving mutants route Request inputs through
        // `new Request(input, finalInit)`; per WHATWG, constructing from a
        // Request with a non-empty init resets `referrer` to about:client and
        // `referrerPolicy` to "" — the explicit-fields branch preserves both.
        const dispatched: Request[] = [];
        const f = composedFetch({
            fetch: (async (input: RequestInfo | URL) => {
                dispatched.push(input as Request);
                return new Response("ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 0 },
        });
        const input = new Request("https://example.test/page-with-referrer", {
            referrer: "https://example.test/page",
            referrerPolicy: "no-referrer",
        });
        await f(input);
        expect(dispatched).toHaveLength(1);
        const sent = dispatched[0]!;
        expect(sent).toBeInstanceOf(Request);
        expect(sent.url).toBe("https://example.test/page-with-referrer");
        expect(sent.referrer).toBe("https://example.test/page");
        expect(sent.referrerPolicy).toBe("no-referrer");
    });
});

describe("getRequestIdFromError non-object guard (mutant 66)", () => {
    it("returns undefined for a function error even when it carries rawResponse headers", () => {
        // `typeof err !== "object"` guard: a function is the one non-nullish,
        // non-object value that can still carry properties. Under the mutant
        // (guard -> false) the Record branch runs, case-insensitively matches
        // X-Request-Id, and wrongly returns "req_gap66".
        const fnErr = Object.assign(() => undefined, {
            rawResponse: { headers: { "x-request-id": "req_gap66" } },
        });
        expect(getRequestIdFromError(fnErr)).toBeUndefined();
    });
});

describe("composedFetch — pre-aborted signal starves lifecycle hooks (mutants 262/264)", () => {
    it("rejects with the abort reason before beforeRequest or onError ever fire", async () => {
        // assertSignalNotAborted is the retry path's entry guard. Its body-{}
        // mutant still rejects with the SAME reason (abortable's own pre-check
        // catches the aborted signal later), so the rejection value alone
        // cannot kill it — the distinguishing observable is that no lifecycle
        // hook may run for a request that was dead on arrival.
        const controller = new AbortController();
        const reason = new Error("pre-aborted");
        controller.abort(reason);
        const beforeRequest = vi.fn();
        const onError = vi.fn();
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: { beforeRequest, onError },
        });

        await expect(
            f("https://example.test/x", { method: "GET", signal: controller.signal }),
        ).rejects.toBe(reason);
        expect(beforeRequest).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });
});

describe("composedFetch — retry.count attributes are populated (mutant 415)", () => {
    it("emits retry.count with the exact { method, reason } attributes", async () => {
        // The `{ method, reason }` -> `{}` mutant still emits a metric NAMED
        // retry.count, so the existing name-containment assertion cannot kill
        // it — the deep equality on the populated attributes object is the
        // kill (the repo's known `x !== undefined ? {x} : {}` mapper trap).
        const metrics: Array<{
            name: string;
            value: number;
            attributes?: Record<string, string | number>;
        }> = [];
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return calls === 1
                    ? new Response("err", { status: 500 })
                    : new Response("ok", { status: 200 });
            }) as typeof fetch,
            retryPolicy: { maxRetries: 1, initialDelayMs: 0, jitter: 0 },
            hooks: {
                onMetric: (metric) => {
                    metrics.push(metric);
                },
            },
        });

        await f("https://example.test/x", { method: "GET" });

        expect(metrics.filter((m) => m.name === "retry.count")).toEqual([
            { name: "retry.count", value: 1, attributes: { method: "GET", reason: "500" } },
        ]);
    });
});

describe("composedFetch — safeHook skips absent hooks silently (mutant 418)", () => {
    it("never warns when no hooks are configured", async () => {
        // safeHook's `hook == null` guard: under the mutant every lifecycle
        // boundary awaits `undefined(arg)`, catches the TypeError, and warns.
        // The request still resolves either way — warn-never is the kill.
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const { fn } = mockFetch(() => new Response("ok", { status: 200 }));
            const f = composedFetch({ fetch: fn });
            const res = await f("https://example.test/x");
            expect(res.status).toBe(200);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            warn.mockRestore();
        }
    });
});

describe("composedFetch — hook-failure warning prefix (mutant 422)", () => {
    it("warns exactly once with the exact prefix string and the thrown hook error", async () => {
        // Existing best-effort coverage only asserts that console.warn fired;
        // the ""-prefix mutant passes that. Pin the exact first argument and
        // the sentinel error identity (and that the request still resolves).
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const hookErr = new Error("hook boom 422");
            const { fn } = mockFetch(() => new Response("ok", { status: 200 }));
            const f = composedFetch({
                fetch: fn,
                hooks: {
                    beforeRequest: () => {
                        throw hookErr;
                    },
                },
            });
            const res = await f("https://example.test/x");
            expect(res.status).toBe(200);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                "clockify-sdk-ts-115 composedFetch hook failed:",
                hookErr,
            );
        } finally {
            warn.mockRestore();
        }
    });
});

// ---------------------------------------------------------------------------
// Mutation-campaign ledger (CI runs 30420465438 and 30509504520,
// wrapper/composed-fetch.ts).
//
// The mutation-campaign describe blocks above kill those runs' survived and
// NoCoverage mutants by asserting OBSERVABLE behavior. The mutants below are
// EQUIVALENT (or a recorded maintainer decision) and intentionally not chased
// (same treatment as errors.ts and subdomain-label.ts at its 80 ceiling):
//
// - 151 (L423): mergeRetryPolicy computeDelay spread condition. NOT equivalent —
//   distinguishable only by pinning the computeDelay property-read count (2
//   reads under the original vs 1 under the mutant), a non-contractual
//   implementation detail. Left unkilled as a maintainer decision (disposition
//   v2: uncertain; a counting-getter kill is available on request).
// - 247 (L559): buildRequestTemplate `!(input instanceof Request)` -> false.
//   String/URL inputs forced through the explicit-fields branch construct a
//   field-identical Request (WebIDL undefined-member elision, probe-verified
//   field-by-field); Request inputs take the explicit branch in both variants.
// - 270 (L597): abortable's synchronous pre-check `signal.aborted` -> false.
//   Double-checked abort entry: single-threaded JS leaves no interleaving point
//   between this pre-check and the L611-614 listener + fallback, which rejects
//   synchronously with the identical reason; the only delta is a balanced
//   add/removeEventListener on an internal signal — unobservable.
// - 275/276 (L601-602): finish() re-entrancy guard (`settled` -> false /
//   `settled = true` -> false). The only double-finish path settles an
//   already-settled Promise, which the spec ignores (settle-once); repeated
//   removeEventListener is a no-op and abortReason is side-effect-free.
// - 277 (L603): finish() removeEventListener "abort" -> "". The un-removed
//   once-listener is inert; the sole proposed channel (MaxListenersExceededWarning)
//   is measurably dead — undici request signals carry unlimited max-listeners
//   (probed Node 22.23.1 / 26.0.0; 150 listeners emit no warning).
// - 281/282 (L611): abortable addEventListener `{ once: true }` -> {} / true ->
//   false. An AbortSignal dispatches "abort" at most once (one-way latch), so
//   `once` never changes dispatch count; detachment is independently guaranteed
//   by the explicit removeEventListener in finish().
// - 284 (L612): abortable's post-listener `signal.aborted` fallback -> false.
//   Unreachable-true: the L597 pre-check synchronously precedes it with no
//   interleaving point.
// - 285 (L612): abortable's in-executor `if (signal.aborted) { onAbort();
//   return; }` block -> `{}`. Unreachable fallback: Promise executors run
//   synchronously and no user code runs between abortable's L597 pre-check and
//   this re-check; Request always mints a genuine AbortSignal, so a lying
//   `.aborted` getter cannot be threaded in.
// - 328 (L660): `rateLimitReset != null` -> true. STRICT equivalence: with the
//   X-RateLimit-Reset header absent, headers.get returns null, parseInt(null)
//   -> NaN, and the inner Number.isFinite(reset) guard blocks the only return;
//   the block is side-effect-free with no date/clock arm (unlike 305, which IS
//   killable on a pre-1970 fake clock and is killed above), so no input on any
//   clock distinguishes mutant from original. Verified: the new describe blocks
//   all stay green with this mutant hand-applied.
// - 368 (L687): sleep's pre-listener `signal.aborted` check -> false. Redundant
//   with the L700 fallback, which rejects synchronously with the same reason;
//   the timer created and cleared inside the synchronous executor is
//   unsampleable even with fake timers.
// - 371 (L690): sleep timer-path removeEventListener "abort" -> "". Same dead
//   warning channel as 277; the leaked once-listener is functionally inert
//   (clearTimeout on a fired Timeout is a safe no-op; reject on a settled
//   promise is spec-ignored; no fake-timer sampling window).
// - 373 (L695): sleep onAbort's removeEventListener "abort" -> "". A
//   `{ once: true }` listener is platform-detached before invocation, so the
//   in-handler removal is unconditionally redundant; the L700 direct onAbort()
//   path (where once-detachment has NOT happened) is dead code given the intact
//   L687 pre-check.
// - 375/376 (L699): sleep's `{ once: true }` -> {} / true -> false. Same
//   one-way-latch argument as 281/282.
// - 378 (L700): sleep's fallback `signal.aborted` check -> false. Mirror of 284:
//   the intact L687 pre-check synchronously precedes it.
// - 392 (L724): X-RateLimit-Remaining `?? ""` fallback -> "Stryker was here!".
//   The fallback feeds only Number.parseInt, and parseInt of either string is
//   NaN, so the rate_limit.remaining metric is skipped identically; when the
//   header is present the fallback arm never evaluates.
//
// Run 31041169150 (2026-08-05) re-measured this module at 94.92 against a floor
// of 95. Every entry above survived again under new ids (151->166, 247->253,
// 270->270, 328->343, 368->379, 371->382, 373->384, 375/376->386/387,
// 378->389, 392->403); ids renumber on every run, so the line description is
// the durable part. Two entries are NEW in that run:
//
// - 237 (L587): `response.body?.cancel()` -> `response.body.cancel()` inside the
//   abortable() body-drain. With a null body the mutant throws a TypeError
//   synchronously inside abortable's start(), which rejects the returned promise
//   — and the call site already ends in `.catch(() => undefined)`. Both variants
//   resolve to undefined with the abort listener removed, so no caller can tell
//   them apart.
// - 304 (L694): isAbortError's `value !== null` -> true. It diverges only for a
//   null rejection (the mutant would read `null.name` and throw), and null never
//   reaches isAbortError: the caller gates the whole error branch on
//   `error != null` first. Verified by hand-applying the mutant — the suite
//   stays green, while the sibling mutants 299/300/301 on the same guard now
//   fail against the callable-AbortError test above.
// ---------------------------------------------------------------------------
