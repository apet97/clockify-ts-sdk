/**
 * Idempotency-Key pattern via `requestOptions.headers`.
 *
 * Clockify's API does not currently honor an `Idempotency-Key`
 * header — repeated requests with the same key still produce
 * duplicate side effects. The wrapper supports the header for two
 * reasons:
 *
 *   1. Stable callsite shape if Clockify adds support later.
 *   2. Compatibility with API gateways / reverse proxies that
 *      dedupe on `Idempotency-Key` before forwarding to Clockify.
 *
 * For now, callers that need real idempotency should either use the
 * (resource, name) uniqueness constraints Clockify already
 * enforces, or implement their own write-once table keyed by an
 * external request ID.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/idempotency.ts`
 */
import { randomUUID } from "node:crypto";

import { ConflictError, createClockifyClient, promoteApiError } from "clockify-sdk-ts";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;

if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

const idempotencyKey = randomUUID();
const tagName = `idempotency-demo-${idempotencyKey.slice(0, 8)}`;

// (1) First send — succeeds.
const tag = await client.tags.create(
    { workspaceId, name: tagName },
    { headers: { "Idempotency-Key": idempotencyKey } },
);
console.log(`(1) tag created: ${tag.id}`);

// (2) Retry the same operation with the same key. Today Clockify
// would reject this with a 409 (uniqueness on `name`); the
// wrapper-side `ConflictError` subclass lets you narrow on that.
try {
    await client.tags.create(
        { workspaceId, name: tagName },
        { headers: { "Idempotency-Key": idempotencyKey } },
    );
    console.log("(2) duplicate accepted unexpectedly — Clockify added idempotency support?");
} catch (raw) {
    const err = promoteApiError(raw);
    if (err instanceof ConflictError) {
        console.log("(2) duplicate rejected with 409 ConflictError (expected today)");
    } else {
        throw raw;
    }
}

// Cleanup so the sandbox stays tidy.
await client.tags.delete({ workspaceId, tagId: tag.id ?? "" });
console.log(`(3) tag deleted: ${tag.id}`);
