/**
 * Minimal Deno smoke test for the built SDK. Imports the public
 * surface from dist/esm/ and asserts each expected name resolves.
 * If a hand-written module starts depending on a Node-only API
 * (without a polyfill), Deno crashes at import time and CI fails.
 *
 * Run via: `deno run --allow-env --allow-read scripts/deno-smoke.ts`
 *
 * This is a smoke check, not a full test suite. Vitest is Node-
 * native; running the actual test files under Deno would require
 * stubbing vitest's runner. The smoke is enough to catch
 * "accidental Node API usage" (the main reason a Deno leg exists).
 */
// @ts-ignore — `Deno` is the Deno runtime global; not in @types/node
declare const Deno: { exit(code: number): never };

import {
    ClockifyApiClient,
    composedFetch,
    createClockifyClient,
    defaultUserAgent,
    generateRequestId,
    iterAll,
    iterPages,
    paginate,
    verifyClockifyWebhook,
    constructEvent,
    WebhookSignatureMismatchError,
    ClockifyApiError,
    ClockifyApiTimeoutError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    MethodNotAllowedError,
    getRequestIdFromError,
    REQUEST_ID_HEADER,
    USER_AGENT_HEADER,
    CLOCKIFY_SIGNATURE_HEADER,
    KNOWN_PAGINATED_METHODS,
} from "../dist/esm/index.js";

const checks: Array<[string, unknown, "function" | "object" | "string"]> = [
    ["ClockifyApiClient", ClockifyApiClient, "function"],
    ["createClockifyClient", createClockifyClient, "function"],
    ["composedFetch", composedFetch, "function"],
    ["defaultUserAgent", defaultUserAgent, "function"],
    ["generateRequestId", generateRequestId, "function"],
    ["iterAll", iterAll, "function"],
    ["iterPages", iterPages, "function"],
    ["paginate", paginate, "function"],
    ["verifyClockifyWebhook", verifyClockifyWebhook, "function"],
    ["constructEvent", constructEvent, "function"],
    ["WebhookSignatureMismatchError", WebhookSignatureMismatchError, "function"],
    ["ClockifyApiError", ClockifyApiError, "function"],
    ["ClockifyApiTimeoutError", ClockifyApiTimeoutError, "function"],
    ["BadRequestError", BadRequestError, "function"],
    ["UnauthorizedError", UnauthorizedError, "function"],
    ["ForbiddenError", ForbiddenError, "function"],
    ["NotFoundError", NotFoundError, "function"],
    ["MethodNotAllowedError", MethodNotAllowedError, "function"],
    ["getRequestIdFromError", getRequestIdFromError, "function"],
    ["REQUEST_ID_HEADER", REQUEST_ID_HEADER, "string"],
    ["USER_AGENT_HEADER", USER_AGENT_HEADER, "string"],
    ["CLOCKIFY_SIGNATURE_HEADER", CLOCKIFY_SIGNATURE_HEADER, "string"],
    ["KNOWN_PAGINATED_METHODS", KNOWN_PAGINATED_METHODS, "object"],
];

const missing: string[] = [];
for (const [name, value, expected] of checks) {
    if (typeof value !== expected) {
        missing.push(`${name} (got ${typeof value}, want ${expected})`);
    }
}

if (missing.length > 0) {
    console.error("Deno smoke FAILED — missing/wrong-type exports:");
    for (const m of missing) console.error(`  - ${m}`);
    Deno.exit(1);
}

console.log(`Deno smoke OK: ${checks.length} expected exports resolve correctly`);

// Constructor sanity — generateRequestId returns a UUID-shaped string
const id = generateRequestId() as string;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
    console.error(`Deno smoke FAILED — generateRequestId returned non-UUID: ${id}`);
    Deno.exit(1);
}
console.log(`Deno smoke OK: generateRequestId() returns ${id}`);

// createClockifyClient should instantiate without throwing
const client = createClockifyClient({ apiKey: "deno-smoke" });
if (typeof client.tags !== "object") {
    console.error("Deno smoke FAILED — createClockifyClient did not yield a working client");
    Deno.exit(1);
}
console.log("Deno smoke OK: createClockifyClient yields a working client");
