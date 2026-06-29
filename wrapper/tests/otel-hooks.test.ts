import { describe, expect, it, vi } from "vitest";

import { otelHooks, type OtelLikeSpan } from "../otel-hooks.js";

function mockSpan(): OtelLikeSpan & {
    attrs: Record<string, string | number | boolean>;
    statusCode: 1 | 2 | undefined;
    exceptions: Error[];
    ended: boolean;
} {
    const span = {
        attrs: {} as Record<string, string | number | boolean>,
        statusCode: undefined as 1 | 2 | undefined,
        exceptions: [] as Error[],
        ended: false,
        setAttribute(key: string, value: string | number | boolean) {
            this.attrs[key] = value;
            return this;
        },
        setStatus(status: { code: 1 | 2; message?: string }) {
            this.statusCode = status.code;
            return this;
        },
        recordException(exception: Error) {
            this.exceptions.push(exception);
            return this;
        },
        end() {
            this.ended = true;
        },
    };
    return span;
}

describe("otelHooks", () => {
    it("startSpan is called on beforeRequest with method/url attrs", async () => {
        const span = mockSpan();
        const startSpan = vi.fn(() => span);
        const hooks = otelHooks({ startSpan });

        await hooks.beforeRequest?.({
            url: "https://api.clockify.me/api/v1/workspaces",
            method: "GET",
            headers: new Headers(),
            attempt: 0,
            requestId: "req-123",
        });

        expect(startSpan).toHaveBeenCalledOnce();
        expect(span.attrs["http.request.method"]).toBe("GET");
        expect(span.attrs["url.full"]).toBe("https://api.clockify.me/api/v1/workspaces");
        expect(span.attrs["peer.service"]).toBe("clockify");
        expect(span.attrs["http.request.resend_count"]).toBeUndefined();
        expect(span.ended).toBe(false);
    });

    it("afterResponse attaches status + duration and ends span (OK)", async () => {
        const span = mockSpan();
        const hooks = otelHooks({ startSpan: () => span });

        const ctx = {
            url: "https://api.clockify.me/api/v1/tags",
            method: "GET",
            headers: new Headers(),
            attempt: 0,
            requestId: "req-1",
        };
        await hooks.beforeRequest?.(ctx);

        const response = new Response("[]", { status: 200 });
        await hooks.afterResponse?.({
            ...ctx,
            response,
            durationMs: 142,
        });

        expect(span.attrs["http.response.status_code"]).toBe(200);
        expect(span.attrs["clockify.http.client.request.duration_ms"]).toBe(142);
        expect(span.statusCode).toBe(1); // OK
        expect(span.ended).toBe(true);
    });

    it("afterResponse sets ERROR status on non-2xx", async () => {
        const span = mockSpan();
        const hooks = otelHooks({ startSpan: () => span });

        const ctx = {
            url: "https://api.clockify.me/api/v1/tags",
            method: "GET",
            headers: new Headers(),
            attempt: 0,
            requestId: "req-1",
        };
        await hooks.beforeRequest?.(ctx);
        await hooks.afterResponse?.({
            ...ctx,
            response: new Response("error", { status: 500 }),
            durationMs: 50,
        });

        expect(span.attrs["http.response.status_code"]).toBe(500);
        expect(span.statusCode).toBe(2); // ERROR
        expect(span.ended).toBe(true);
    });

    it("onError records exception + ERROR status + ends span", async () => {
        const span = mockSpan();
        const hooks = otelHooks({ startSpan: () => span });

        const ctx = {
            url: "https://api.clockify.me/api/v1/tags",
            method: "GET",
            headers: new Headers(),
            attempt: 0,
            requestId: "req-1",
        };
        await hooks.beforeRequest?.(ctx);

        const err = new Error("fetch failed");
        await hooks.onError?.({
            ...ctx,
            error: err,
            durationMs: 30,
        });

        expect(span.exceptions).toContain(err);
        expect(span.statusCode).toBe(2);
        expect(span.ended).toBe(true);
    });

    it("does not start a span if beforeRequest wasn't called (defensive)", async () => {
        const span = mockSpan();
        const startSpan = vi.fn(() => span);
        const hooks = otelHooks({ startSpan });

        // afterResponse without a prior beforeRequest — should be a no-op
        // (we never started a span for this ctx).
        await hooks.afterResponse?.({
            url: "https://api.clockify.me/api/v1/tags",
            method: "GET",
            headers: new Headers(),
            attempt: 0,
            requestId: "req-1",
            response: new Response("[]", { status: 200 }),
            durationMs: 50,
        });

        // No span ended (because we never started one for this ctx).
        expect(span.ended).toBe(false);
        expect(startSpan).not.toHaveBeenCalled();
    });

    it("two concurrent requestId-less requests on the same method+url each end their span", async () => {
        // With requestId injection off, a synthetic method+url+requestId+attempt
        // string collides for two concurrent same-method/url requests — the second
        // beforeRequest overwrites the first, orphaning a never-ended span. Keying
        // on the per-request Headers instance keeps them distinct: every started
        // span is ended.
        const spans: ReturnType<typeof mockSpan>[] = [];
        const startSpan = vi.fn(() => {
            const s = mockSpan();
            spans.push(s);
            return s;
        });
        const hooks = otelHooks({ startSpan });

        // Same method + url + attempt, requestId undefined; the ONLY thing that
        // differs is the per-request Headers instance (as composedFetch builds it).
        const url = "https://api.clockify.me/api/v1/tags";
        const a = { url, method: "GET", headers: new Headers(), attempt: 0, requestId: undefined };
        const b = { url, method: "GET", headers: new Headers(), attempt: 0, requestId: undefined };

        // Interleave: both start before either ends (concurrent in-flight).
        await hooks.beforeRequest?.(a);
        await hooks.beforeRequest?.(b);
        await hooks.afterResponse?.({ ...a, response: new Response("[]", { status: 200 }), durationMs: 5 });
        await hooks.afterResponse?.({ ...b, response: new Response("[]", { status: 200 }), durationMs: 7 });

        const started = startSpan.mock.calls.length;
        const ended = spans.filter((s) => s.ended).length;
        expect(started).toBe(2);
        expect(ended).toBe(started); // no orphaned span
    });

    it("retry attempts get separate spans (resend_count attr)", async () => {
        const spans: ReturnType<typeof mockSpan>[] = [];
        const startSpan = vi.fn(() => {
            const s = mockSpan();
            spans.push(s);
            return s;
        });
        const hooks = otelHooks({ startSpan });

        // Two attempts: 0 and 1
        const baseCtx = {
            url: "https://api.clockify.me/api/v1/tags",
            method: "POST",
            headers: new Headers(),
            requestId: "req-1",
        };

        const ctx0 = { ...baseCtx, attempt: 0 };
        await hooks.beforeRequest?.(ctx0);
        await hooks.afterResponse?.({
            ...ctx0,
            response: new Response("err", { status: 500 }),
            durationMs: 10,
        });

        const ctx1 = { ...baseCtx, attempt: 1 };
        await hooks.beforeRequest?.(ctx1);
        await hooks.afterResponse?.({
            ...ctx1,
            response: new Response("[]", { status: 200 }),
            durationMs: 50,
        });

        expect(startSpan).toHaveBeenCalledTimes(2);
        expect(spans[0]?.attrs["http.request.resend_count"]).toBeUndefined();
        expect(spans[1]?.attrs["http.request.resend_count"]).toBe(1);
    });

    it("omits resend_count on the initial attempt but emits it on retries", async () => {
        const spans: ReturnType<typeof mockSpan>[] = [];
        const startSpan = () => {
            const s = mockSpan();
            spans.push(s);
            return s;
        };
        const hooks = otelHooks({ startSpan });

        const baseCtx = {
            url: "https://api.clockify.me/api/v1/workspaces",
            method: "GET" as const,
            headers: new Headers(),
            requestId: "req-resend",
        };

        await hooks.beforeRequest?.({ ...baseCtx, attempt: 0 });
        await hooks.beforeRequest?.({ ...baseCtx, attempt: 1 });
        await hooks.beforeRequest?.({ ...baseCtx, attempt: 2 });

        expect("http.request.resend_count" in spans[0]!.attrs).toBe(false);
        expect(spans[1]?.attrs["http.request.resend_count"]).toBe(1);
        expect(spans[2]?.attrs["http.request.resend_count"]).toBe(2);
    });
});
