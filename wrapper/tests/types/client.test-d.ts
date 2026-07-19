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

test("createClockifyClient exposes only the precise alternate HTTPS host opt-in", () => {
    createClockifyClient({
        apiKey: "x",
        environment: "https://clockify-proxy.example.com/api/v1",
        allowNonClockifyHttpsHost: true,
    });

    createClockifyClient({
        apiKey: "x",
        // @ts-expect-error: removed in 1.0; use allowNonClockifyHttpsHost
        allowInsecureBaseUrl: true,
    });
});
