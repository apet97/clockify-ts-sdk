/**
 * Catch-block patterns for the v0.6.0+ typed error hierarchy.
 *
 * Shows three styles, all backward-compatible with the v0.5.0
 * `instanceof ClockifyApiError` check:
 *
 *   1. `isClockifyApiError` at the outer edge (rethrow non-SDK).
 *   2. `promoteApiError` to promote the base ClockifyApiError to a
 *      status subclass when one exists (429 → RateLimitError, etc.).
 *   3. `isRateLimitError` type guard for narrowing without
 *      reallocating the error.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/typed-errors.ts`
 */
import {
    ClockifyApiError,
    NotFoundError,
    RateLimitError,
    createClockifyClient,
    getRequestIdFromError,
    isClockifyApiError,
    isRateLimitError,
    promoteApiError,
} from "clockify-sdk-ts";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;

if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

// (1) Trigger a 404 by reading a tag that doesn't exist. The Fern
// spec documents 401 + 404 for this endpoint, so NotFoundError is
// thrown directly (no `promoteApiError` needed).
try {
    await client.tags.get({ workspaceId, tagId: "deliberately-missing-tag-id" });
} catch (raw) {
    if (!isClockifyApiError(raw)) throw raw;
    if (raw instanceof NotFoundError) {
        console.log(
            `(1) NotFoundError caught directly — request ${getRequestIdFromError(raw)}`,
        );
    } else {
        throw raw;
    }
}

// (2) Promote-then-narrow: simulate a 429 by constructing the base
// error manually. (Live 429s are rare under default retry, so we
// fabricate the scenario.) Real catch sites should still call
// `promoteApiError` defensively.
const fabricated = new ClockifyApiError({
    statusCode: 429,
    body: { message: "Too many requests" },
});

const promoted = promoteApiError(fabricated);
if (promoted instanceof RateLimitError) {
    console.log(
        `(2) promoted base ClockifyApiError(429) → RateLimitError. retryAfterMs=${
            promoted.retryAfterMs ?? "(no header)"
        }`,
    );
}

// (3) Type-guard narrowing without re-allocation. The guard
// returns `err is RateLimitError` so TS unlocks the extra fields
// (retryAfterMs / rateLimitResetAt).
try {
    await client.tags.list({ workspaceId });
} catch (raw) {
    if (isRateLimitError(raw)) {
        const waitMs = raw.retryAfterMs ?? 1000;
        console.log(`(3) hit rate limit — sleeping ${waitMs}ms before retry`);
    } else if (isClockifyApiError(raw)) {
        console.error(`(3) SDK error: status=${raw.statusCode}`, raw.body);
    } else {
        throw raw;
    }
}
