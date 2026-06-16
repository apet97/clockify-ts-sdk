/**
 * Handle Clockify's 50 req/s rate limit two ways: (1) let the SDK retry policy
 * back off on 429 automatically, and (2) detect a surfaced 429 with
 * `isRateLimitError` + read the `Retry-After` window with `getRateLimitFromError`.
 *
 * Env: CLOCKIFY_API_KEY (optional — the example constructs a client and shows the
 *      catch wiring without requiring a real 429).
 * Mode: mock-safe — no live calls are required to demonstrate the wiring.
 * Cleanup: none.
 * Expected output:
 *   Client constructed with retry-on-429 policy.
 *   (on a real 429) rate limited; window resets at <ISO time> (N/limit left)
 *
 * Run: `npx tsx examples/handle-rate-limit.ts`
 */
import { createClockifyClient, getRateLimitFromError, isRateLimitError } from "clockify-sdk-ts-115";

const client = createClockifyClient({
    apiKey: process.env.CLOCKIFY_API_KEY ?? "demo-key",
    retryPolicy: {
        maxRetries: 4,
        initialDelayMs: 500,
        maxDelayMs: 30_000,
        // 429 is retryable; the SDK honors Retry-After when present.
        retryableStatusCodes: [429, 500, 502, 503, 504],
    },
});

console.log("Client constructed with retry-on-429 policy.", typeof client.tags);

// If a 429 still surfaces after retries, classify it and read the window.
async function safeList(workspaceId: string): Promise<void> {
    try {
        await client.tags.list({ workspaceId });
    } catch (err) {
        if (isRateLimitError(err)) {
            const snapshot = getRateLimitFromError(err);
            const resetAt = snapshot?.resetAt?.toISOString() ?? "unknown";
            console.error(`rate limited; window resets at ${resetAt} (${snapshot?.remaining ?? "?"}/${snapshot?.limit ?? "?"} left)`);
            return;
        }
        throw err;
    }
}

void safeList; // referenced so the helper is part of the example surface
