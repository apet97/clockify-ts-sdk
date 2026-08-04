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

test("createClockifyClient does not expose the generated service routing map", () => {
    createClockifyClient({
        apiKey: "x",
        // @ts-expect-error: use the validated routing option instead
        serviceBaseUrls: { regular: "https://api.clockify.me/api/v1" },
    });
});

test("createClockifyClient owns authentication instead of accepting a second provider", () => {
    createClockifyClient({
        apiKey: "x",
        // @ts-expect-error: construct ClockifyApiClient directly for custom/no auth
        auth: false,
    });
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
