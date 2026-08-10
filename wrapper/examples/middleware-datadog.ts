/**
 * Wire `composedFetch` lifecycle hooks to a Datadog-style
 * metrics + logger sink. The hooks are the same shape Honeycomb,
 * Sentry breadcrumbs, OpenTelemetry, or any structured logger
 * would consume.
 *
 * Run: `npx tsx examples/middleware-datadog.ts` (no API calls
 * unless you also pass valid creds).
 */
import { createClockifyClient } from "clockify-sdk-ts-115";

// Pretend these are real Datadog dogstatsd / Honeycomb / etc.
const metrics = {
    increment(name: string, tags: Record<string, string | number>) {
        console.log(`[metric] +1 ${name} ${JSON.stringify(tags)}`);
    },
    histogram(name: string, value: number, tags: Record<string, string | number>) {
        console.log(`[metric] hist ${name}=${value} ${JSON.stringify(tags)}`);
    },
};
const logger = {
    info(meta: object, msg: string) {
        console.log(`[info] ${msg}`, JSON.stringify(meta));
    },
    warn(meta: object, msg: string) {
        console.warn(`[warn] ${msg}`, JSON.stringify(meta));
    },
    error(meta: object, msg: string) {
        console.error(`[error] ${msg}`, JSON.stringify(meta));
    },
};

// `??` alone would not catch CLOCKIFY_API_KEY="" (an empty string is
// neither null nor undefined), and this repo's own local-proof convention
// runs with exactly that — treat a blank string the same as unset.
const envApiKey = process.env.CLOCKIFY_API_KEY;
const client = createClockifyClient({
    apiKey: envApiKey && envApiKey.length > 0 ? envApiKey : "demo-key",
    hooks: {
        beforeRequest: ({ method, url, requestId, attempt }) => {
            logger.info({ method, url, requestId, attempt }, "→ clockify request");
        },
        afterResponse: ({ method, url, response, durationMs, requestId }) => {
            metrics.histogram("clockify.duration_ms", durationMs, {
                method,
                status: response.status,
            });
            metrics.increment("clockify.requests", { status: response.status });
            logger.info(
                { method, url, status: response.status, durationMs, requestId },
                "← clockify response",
            );
        },
        onError: ({ method, url, error, durationMs, requestId }) => {
            metrics.increment("clockify.errors", { method });
            logger.error({ method, url, error, durationMs, requestId }, "× clockify failure");
        },
        onRetry: ({ method, url, nextAttempt, delayMs, requestId }) => {
            metrics.increment("clockify.retries", { method });
            logger.warn(
                { method, url, nextAttempt, delayMs, requestId },
                "↻ clockify retry scheduled",
            );
        },
    },
});

console.log("Client constructed with full observability hooks wired:", typeof client.tags);
