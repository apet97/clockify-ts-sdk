import { describe, expect, it } from "vitest";
import { ClockifyApiClient } from "../src/index.js";
import { createClockifyClient, type CreateClockifyClientOptions } from "../create-client.js";

describe("createClockifyClient", () => {
    it("returns a ClockifyApiClient when given apiKey", () => {
        const client = createClockifyClient({ apiKey: "test-key" });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("returns a ClockifyApiClient when given addonToken", () => {
        const client = createClockifyClient({ addonToken: "test-token" });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("forwards passthrough options (environment, headers, timeout, retries)", () => {
        const client = createClockifyClient({
            apiKey: "k",
            environment: "https://api.clockify.test",
            headers: { "X-Custom": "v" },
            timeoutInSeconds: 5,
            maxRetries: 0,
        });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("accepts a Supplier function for apiKey", () => {
        const client = createClockifyClient({ apiKey: () => "deferred-key" });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("throws when neither apiKey nor addonToken is provided", () => {
        expect(() => createClockifyClient({} as unknown as CreateClockifyClientOptions)).toThrow(
            /must provide exactly one/,
        );
    });

    it("throws when both apiKey and addonToken are provided at runtime", () => {
        expect(() =>
            createClockifyClient({
                apiKey: "k",
                addonToken: "t",
            } as unknown as CreateClockifyClientOptions),
        ).toThrow(/only one/);
    });

    // Compile-time contract tests. These are no-ops at runtime; their
    // value is in `tsc` failing the build if `@ts-expect-error` ever
    // becomes false (i.e. the type starts permitting the bad shape).
    it("rejects providing both apiKey and addonToken at the TS type level", () => {
        // @ts-expect-error — type must reject providing both
        const _opts: CreateClockifyClientOptions = { apiKey: "k", addonToken: "t" };
        void _opts;
        expect(true).toBe(true);
    });

    it("rejects providing neither at the TS type level", () => {
        // @ts-expect-error — type must reject providing neither
        const _opts: CreateClockifyClientOptions = {};
        void _opts;
        expect(true).toBe(true);
    });
});
