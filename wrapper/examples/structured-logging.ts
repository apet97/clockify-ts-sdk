/**
 * Wire the SDK's request/response stream into a structured logger.
 *
 * Two layers cover the use cases:
 *
 *   - `logging.logger` — coarse-grained, `ILogger`-shaped object
 *     (`debug/info/warn/error` methods). It logs URLs and statuses but
 *     NOT request/response headers, so the SDK never hands your API key
 *     or add-on token to this logger.
 *   - `hooks` — fine-grained: separate `beforeRequest`,
 *     `afterResponse`, `onError`, `onRetry`. These DO receive the live
 *     `ctx.headers` (including the auth header) — if you log them,
 *     redact `X-Api-Key` / `X-Addon-Token` / `Authorization` yourself.
 *
 * Shown below: a Pino-shaped logger plugged in as the SDK's
 * `ILogger`, plus hook adapters that add latency histograms.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/structured-logging.ts`
 */
import { createClockifyClient } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;

if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

// Real wire-up:
//   import pino from "pino";
//   const log = pino({ level: "debug" });
// Here we use a console-backed fake to keep the example dep-free.
const log = {
    debug: (meta: Record<string, unknown>, msg: string) =>
        console.log(JSON.stringify({ level: "debug", msg, ...meta })),
    info: (meta: Record<string, unknown>, msg: string) =>
        console.log(JSON.stringify({ level: "info", msg, ...meta })),
    warn: (meta: Record<string, unknown>, msg: string) =>
        console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
    error: (meta: Record<string, unknown>, msg: string) =>
        console.error(JSON.stringify({ level: "error", msg, ...meta })),
};

const client = createClockifyClient({
    apiKey,
    // (1) Coarse layer — one event per request, one per response.
    // Pass an ILogger object with debug/info/warn/error methods.
    // Pino/bunyan/winston are all shape-compatible; the only
    // adaptation is parameter order (Pino takes meta first, SDK
    // takes msg first).
    logging: {
        level: "debug",
        logger: {
            debug: (msg, ...args) => log.debug({ args }, msg),
            info: (msg, ...args) => log.info({ args }, msg),
            warn: (msg, ...args) => log.warn({ args }, msg),
            error: (msg, ...args) => log.error({ args }, msg),
        },
    },
    // (2) Fine layer — per-stage hooks. Add timing, request IDs,
    // and method labels to the structured fields. Hooks receive
    // already-correlated context; you don't need to thread the
    // request ID yourself.
    hooks: {
        beforeRequest: ({ method, url, requestId }) => {
            log.info({ method, url, requestId }, "clockify.request.start");
        },
        afterResponse: ({ method, url, requestId, response, durationMs }) => {
            log.info(
                { method, url, requestId, status: response.status, durationMs },
                "clockify.request.end",
            );
        },
        onError: ({ method, url, requestId, error, durationMs }) => {
            log.error(
                {
                    method,
                    url,
                    requestId,
                    error: error instanceof Error ? error.message : String(error),
                    durationMs,
                },
                "clockify.request.error",
            );
        },
        onRetry: ({ method, url, requestId, nextAttempt, delayMs }) => {
            log.warn({ method, url, requestId, nextAttempt, delayMs }, "clockify.request.retry");
        },
    },
});

const tags = await client.tags.list({ workspaceId });
log.info({ count: tags.length }, "clockify.example.complete");
