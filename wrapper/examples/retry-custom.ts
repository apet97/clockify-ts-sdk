/**
 * Custom retry policy with manual `computeDelay` (full-jitter
 * exponential backoff) and a wider retryable-status-code set.
 * Disables the generated client's retry layer by default — the factory sets
 * `maxRetries: 0` on that layer when `retryPolicy` is supplied to
 * avoid nested retry loops.
 *
 * Run: `npx tsx examples/retry-custom.ts` (no real API calls).
 */
import { createClockifyClient } from "clockify-sdk-ts-115";

const client = createClockifyClient({
    apiKey: process.env.CLOCKIFY_API_KEY ?? "demo-key",
    retryPolicy: {
        maxRetries: 5,
        initialDelayMs: 250,
        maxDelayMs: 30_000,
        jitter: 0.5,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504, 520, 522],
        retryableMethods: ["GET", "HEAD", "OPTIONS"],
        // Full-jitter: sleep [0, baseDelay] uniformly. Decorrelated
        // backoff variant — friendlier to bursty failure modes.
        computeDelay: (attempt, response) => {
            const retryAfter = response?.headers.get("Retry-After");
            if (retryAfter != null) {
                const seconds = Number.parseInt(retryAfter, 10);
                if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
            }
            const base = Math.min(250 * 2 ** attempt, 30_000);
            return Math.random() * base;
        },
    },
});

console.log("Client constructed with custom retry policy:", typeof client.tags);
console.log("The generated client retry loop is automatically disabled (maxRetries: 0).");
