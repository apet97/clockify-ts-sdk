/**
 * OpenTelemetry-typed observability hooks for `composedFetch`.
 *
 * Returns a `ComposedFetchHooks` object that emits HTTP-client
 * span attributes matching the OpenTelemetry semantic conventions
 * v1.27 (stable). Bring your own tracer — we don't depend on
 * `@opentelemetry/api` at runtime, just on the convention strings.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts-115";
 * import { otelHooks } from "clockify-sdk-ts-115/otel-hooks";
 * import { trace } from "@opentelemetry/api";
 *
 * const tracer = trace.getTracer("my-app");
 *
 * const client = createClockifyClient({
 *   hooks: otelHooks({
 *     startSpan: (name, attrs) => {
 *       const span = tracer.startSpan(name);
 *       if (attrs) for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v);
 *       return span as unknown as OtelLikeSpan;
 *     },
 *   }),
 * });
 * ```
 */
import type {
    ComposedFetchHooks,
    ErrorContext,
    ResponseContext,
} from "./composed-fetch.js";

/** Minimal Span surface compatible with `@opentelemetry/api`'s
 *  `Span`. The user's tracer constructs the actual span; we just
 *  attach attributes / end it via this shape. */
export interface OtelLikeSpan {
    setAttribute(key: string, value: string | number | boolean): this;
    /** `1` = OK, `2` = ERROR (matches OTel `SpanStatusCode`). */
    setStatus(status: { code: 1 | 2; message?: string }): this;
    recordException(exception: Error): this;
    end(): void;
}

/** Options for {@link otelHooks}. */
export interface OtelHooksOptions {
    /** Called once per request attempt. Returns the span the hooks
     *  will attach response/error attributes to.
     *
     *  Initial attribute set is provided so simple tracers can fast-
     *  path; you can also ignore the second arg and use the per-hook
     *  attribute-setting paths instead. */
    startSpan: (
        name: string,
        attributes?: Record<string, string | number | boolean>,
    ) => OtelLikeSpan;
}

// OTel HTTP semantic-convention attribute keys (v1.27, stable).
// Documented at https://opentelemetry.io/docs/specs/semconv/http/http-spans/
const ATTR_HTTP_METHOD = "http.request.method" as const;
const ATTR_HTTP_URL = "url.full" as const;
const ATTR_HTTP_STATUS = "http.response.status_code" as const;
const ATTR_PEER_SERVICE = "peer.service" as const;
const ATTR_SERVER_ADDRESS = "server.address" as const;
const ATTR_RETRY_ATTEMPT = "http.request.resend_count" as const;
const ATTR_DURATION_MS = "clockify.http.client.request.duration_ms" as const;

const SPAN_STATUS_OK = 1 as const;
const SPAN_STATUS_ERROR = 2 as const;

/**
 * Build a `ComposedFetchHooks` object that wires `composedFetch`
 * lifecycle into OpenTelemetry spans.
 *
 * Span lifecycle:
 * - `beforeRequest` → start span, attach method / url / peer / attempt
 * - `afterResponse` → attach status_code + duration, set status, end
 * - `onError` → record exception, set status ERROR, end
 * - `onRetry` → no-op (the next attempt opens its own span)
 *
 * Each request attempt gets its own span (retry → new span). Spans
 * are tracked by `ctx.headers` object identity in a WeakMap, so the
 * GC reclaims them automatically and concurrent requests never collide
 * (a synthetic method+url+requestId+attempt string would collide when
 * `requestId` injection is disabled and two same-method/url requests
 * race; the per-request `Headers` instance is always unique).
 */
export function otelHooks(options: OtelHooksOptions): ComposedFetchHooks {
    // Keyed by the per-request `Headers` instance. `composedFetch` builds one
    // `initHeaders` per request and preserves it across the `{...ctx}` spreads
    // (and across sequential retry attempts, which start+end their span before
    // the next attempt's beforeRequest), so it is a collision-proof, GC-reclaimed
    // key — unlike a synthetic string, which collides on requestId:false.
    const spans = new WeakMap<Headers, OtelLikeSpan>();

    return {
        beforeRequest(ctx) {
            const initialAttrs: Record<string, string | number | boolean> = {
                [ATTR_HTTP_METHOD]: ctx.method,
                [ATTR_HTTP_URL]: ctx.url,
                [ATTR_PEER_SERVICE]: "clockify",
            };
            // `http.request.resend_count` is "Recommended: if and only if request
            // was retried" (OTel HTTP semconv v1.27) — emit only on resends, never
            // on the initial request.
            if (ctx.attempt > 0) {
                initialAttrs[ATTR_RETRY_ATTEMPT] = ctx.attempt;
            }
            try {
                initialAttrs[ATTR_SERVER_ADDRESS] = new URL(ctx.url).host;
            } catch {
                // ignore unparseable URLs; server.address is best-effort.
            }
            const span = options.startSpan(`HTTP ${ctx.method}`, initialAttrs);
            // Always set attrs on the span directly so callers that ignore
            // the `attributes` arg still receive them.
            for (const [k, v] of Object.entries(initialAttrs)) {
                span.setAttribute(k, v);
            }
            spans.set(ctx.headers, span);
        },
        afterResponse(ctx: ResponseContext) {
            const span = spans.get(ctx.headers);
            if (span == null) return;
            spans.delete(ctx.headers);
            span.setAttribute(ATTR_HTTP_STATUS, ctx.response.status);
            span.setAttribute(ATTR_DURATION_MS, ctx.durationMs);
            span.setStatus({ code: ctx.response.ok ? SPAN_STATUS_OK : SPAN_STATUS_ERROR });
            span.end();
        },
        onError(ctx: ErrorContext) {
            const span = spans.get(ctx.headers);
            if (span == null) return;
            spans.delete(ctx.headers);
            if (ctx.error instanceof Error) {
                span.recordException(ctx.error);
            }
            span.setStatus({ code: SPAN_STATUS_ERROR, message: String(ctx.error) });
            span.end();
        },
        // onRetry intentionally omitted — the next attempt's
        // beforeRequest opens its own span. The previous attempt's
        // span was already ended in afterResponse / onError.
    };
}
