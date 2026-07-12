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
    it("dispatches a fresh replayable Request with identical body bytes per attempt", async () => {
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
                retryableMethods: ["POST"],
            },
        });

        await expect(
            f("https://example.test/x", { method: "POST", body: "replay me" }),
        ).resolves.toHaveProperty("status", 204);
        expect(requests).toHaveLength(2);
        expect(new Set(requests).size).toBe(2);
        expect(bodies).toEqual(["replay me", "replay me"]);
    });

    it("rejects a used retryable Request body before the first dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const f = composedFetch({
            fetch: dispatch,
            retryPolicy: {
                maxRetries: 1,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["POST"],
            },
        });
        const input = new Request("https://example.test/x", {
            method: "POST",
            body: "already used",
        });
        await input.text();

        await expect(f(input)).rejects.toBeDefined();
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

    it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects invalid maxRetries %s before dispatch",
        async (maxRetries) => {
            const dispatch = vi.fn<typeof fetch>();
            const f = composedFetch({ fetch: dispatch, retryPolicy: { maxRetries } });

            await expect(f("https://example.test/x")).rejects.toThrow(/maxRetries/i);
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

    it("retries PATCH only when explicitly opted in as idempotent", async () => {
        // Callers who know an operation is idempotent can opt POST/PATCH back
        // into the retryable set; this proves the opt-in path works for PATCH.
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("server", { status: 503 });
            }) as typeof fetch,
            retryPolicy: {
                maxRetries: 2,
                initialDelayMs: 1,
                jitter: 0,
                retryableMethods: ["GET", "PATCH"],
            },
        });
        await f("https://example.test/x", { method: "PATCH" });
        expect(calls).toBe(3);
    });

    it("retries POST when retryableMethods includes it", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("server", { status: 503 });
            }) as typeof fetch,
            retryPolicy: {
                maxRetries: 2,
                initialDelayMs: 1,
                jitter: 0,
                retryableMethods: ["GET", "POST"],
            },
        });
        await f("https://example.test/x", { method: "POST" });
        expect(calls).toBe(3);
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
});

describe("composedFetch — default retry policy (no override of the internals)", () => {
    // These tests deliberately do NOT pass computeDelay/retryableMethods so the
    // module's own DEFAULT_RETRY_POLICY + computeRetryDelay/applyJitter/mergeRetryPolicy
    // paths run for real (the override-based tests above bypass them).

    it("retries every default-idempotent method (GET/HEAD/OPTIONS/PUT/DELETE) and skips POST/PATCH", async () => {
        for (const method of ["GET", "HEAD", "OPTIONS", "PUT", "DELETE"] as const) {
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
        for (const method of ["POST", "PATCH"] as const) {
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

    it("uppercases caller-supplied retryableMethods so lowercase opt-in still matches", async () => {
        let calls = 0;
        const f = composedFetch({
            fetch: (async () => {
                calls++;
                return new Response("x", { status: 503 });
            }) as typeof fetch,
            // lowercase 'post' — mergeRetryPolicy must .toUpperCase() it to match "POST".
            retryPolicy: {
                maxRetries: 2,
                initialDelayMs: 0,
                jitter: 0,
                retryableMethods: ["post"],
            },
        });
        await f("https://example.test/x", { method: "POST" });
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
        await f("https://example.test/x", { method: "GET" }).catch((e) => {
            expect(e).toBeInstanceOf(Error);
        });
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
