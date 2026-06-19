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
        const f = composedFetch({
            fetch: (async () => new Response("retry", { status: 503 })) as typeof fetch,
            retryPolicy: {
                maxRetries: 1,
                jitter: 0,
                computeDelay: () => 300,
            },
        });

        const started = Date.now();
        const request = f("https://example.test/x", { method: "GET", signal: controller.signal });
        setTimeout(() => controller.abort(new Error("stop waiting")), 10);

        await expect(request).rejects.toThrow(/stop waiting|abort/i);
        expect(Date.now() - started).toBeLessThan(150);
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
