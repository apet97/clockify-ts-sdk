import { expectTypeOf, test } from "vitest";

import { createClockifyClient } from "../../create-client.js";
import type { ClockifyApiClient } from "../../src/index.js";

test("createClockifyClient with explicit apiKey returns ClockifyApiClient", () => {
    const c = createClockifyClient({ apiKey: "x" });
    expectTypeOf(c).toEqualTypeOf<ClockifyApiClient>();
});

test("createClockifyClient with explicit addonToken returns ClockifyApiClient", () => {
    const c = createClockifyClient({ addonToken: "x" });
    expectTypeOf(c).toEqualTypeOf<ClockifyApiClient>();
});

test("createClockifyClient with no arguments returns ClockifyApiClient (env fallback)", () => {
    const c = createClockifyClient();
    expectTypeOf(c).toEqualTypeOf<ClockifyApiClient>();
});

test("createClockifyClient with empty options returns ClockifyApiClient (env fallback)", () => {
    const c = createClockifyClient({});
    expectTypeOf(c).toEqualTypeOf<ClockifyApiClient>();
});

test("createClockifyClient rejects apiKey + addonToken simultaneously", () => {
    // @ts-expect-error: apiKey and addonToken are mutually exclusive
    createClockifyClient({ apiKey: "x", addonToken: "y" });
});

test("createClockifyClient accepts enhancement options alongside auth", () => {
    const c = createClockifyClient({
        apiKey: "x",
        userAgent: "my-app/1.0",
        requestId: false,
        retryPolicy: { maxRetries: 5 },
        hooks: {
            beforeRequest: ({ url }) => {
                expectTypeOf(url).toEqualTypeOf<string>();
            },
        },
    });
    expectTypeOf(c).toEqualTypeOf<ClockifyApiClient>();
});
