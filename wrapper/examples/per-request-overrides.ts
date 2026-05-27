/**
 * Per-request overrides for timeout, retry, headers, and abort.
 *
 * The wrapper-side client (`createClockifyClient`) sets defaults.
 * Every method also accepts a `requestOptions` second argument that
 * overrides those defaults for a single call:
 *
 *   - `timeoutInSeconds` — narrower deadline for one slow endpoint
 *   - `maxRetries`       — disable retries for a non-idempotent
 *                          batch operation
 *   - `abortSignal`      — wire an AbortController for cancellation
 *   - `headers`          — inject one-off headers like
 *                          `Idempotency-Key` (Clockify doesn't
 *                          honor this header today; the pattern
 *                          works for any add-on header)
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/per-request-overrides.ts`
 */
import { randomUUID } from "node:crypto";

import { ClockifyApiTimeoutError, createClockifyClient } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;

if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

// Client defaults: 60s timeout (Fern default), 2 retries on 408/429/5xx.
const client = createClockifyClient({ apiKey });

// (1) Tight timeout for a quick health check. Throws
// ClockifyApiTimeoutError if the server takes > 2 seconds.
try {
    await client.workspaces.list(undefined, { timeoutInSeconds: 2 });
    console.log("(1) workspaces.list returned within 2s");
} catch (err) {
    if (err instanceof ClockifyApiTimeoutError) {
        console.warn("(1) workspaces.list timed out within 2s");
    } else {
        throw err;
    }
}

// (2) Disable retries for a single call. Useful when the caller
// has its own retry layer or when the underlying request isn't
// safe to repeat in this context.
await client.tags.list({ workspaceId }, { maxRetries: 0 });
console.log("(2) tags.list ran with retries disabled");

// (3) AbortSignal for explicit cancellation. AbortSignal.timeout
// is a convenient shorthand; AbortController gives manual control.
const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 5_000);
try {
    await client.projects.list({ workspaceId }, { abortSignal: ctrl.signal });
    console.log("(3) projects.list finished before abort fired");
} finally {
    clearTimeout(timer);
}

// (4) Per-request header injection — Idempotency-Key is the
// canonical example. Clockify doesn't honor this header today,
// but the pattern works for any add-on header your reverse proxy
// or logging stack expects.
const idempotencyKey = randomUUID();
await client.tags.create(
    { workspaceId, name: `example-${idempotencyKey.slice(0, 8)}` },
    { headers: { "Idempotency-Key": idempotencyKey } },
);
console.log(`(4) tags.create sent with Idempotency-Key: ${idempotencyKey}`);
