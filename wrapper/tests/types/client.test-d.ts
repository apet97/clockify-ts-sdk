import { expectTypeOf, test } from "vitest";

import { createClockifyClient, type ClockifyClient } from "../../create-client.js";

test("createClockifyClient with explicit apiKey returns ClockifyClient", () => {
    const c = createClockifyClient({ apiKey: "x" });
    expectTypeOf(c).toEqualTypeOf<ClockifyClient>();
});

test("createClockifyClient with explicit addonToken returns ClockifyClient", () => {
    const c = createClockifyClient({ addonToken: "x" });
    expectTypeOf(c).toEqualTypeOf<ClockifyClient>();
});

test("createClockifyClient with no arguments returns ClockifyClient (env fallback)", () => {
    const c = createClockifyClient();
    expectTypeOf(c).toEqualTypeOf<ClockifyClient>();
});

test("createClockifyClient with empty options returns ClockifyClient (env fallback)", () => {
    const c = createClockifyClient({});
    expectTypeOf(c).toEqualTypeOf<ClockifyClient>();
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
    expectTypeOf(c).toEqualTypeOf<ClockifyClient>();
});
