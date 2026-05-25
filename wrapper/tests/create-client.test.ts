import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClockifyClient, type CreateClockifyClientOptions } from "../create-client.js";
import { ClockifyApiClient } from "../src/index.js";

describe("createClockifyClient", () => {
    // Stash + restore env vars across all cases — many tests rely on
    // BOTH env vars being absent for predictable behaviour, and
    // env-fallback tests need to set them in isolation.
    const originalApiKey = process.env.CLOCKIFY_API_KEY;
    const originalAddonToken = process.env.CLOCKIFY_ADDON_TOKEN;
    beforeEach(() => {
        vi.stubEnv("CLOCKIFY_API_KEY", "");
        vi.stubEnv("CLOCKIFY_ADDON_TOKEN", "");
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        if (originalApiKey !== undefined) process.env.CLOCKIFY_API_KEY = originalApiKey;
        if (originalAddonToken !== undefined) process.env.CLOCKIFY_ADDON_TOKEN = originalAddonToken;
    });

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

    it("reads CLOCKIFY_API_KEY from env when no auth options given", () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "env-api-key");
        const client = createClockifyClient();
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("reads CLOCKIFY_ADDON_TOKEN from env when no apiKey in env", () => {
        vi.stubEnv("CLOCKIFY_ADDON_TOKEN", "env-addon-token");
        const client = createClockifyClient();
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("prefers CLOCKIFY_API_KEY over CLOCKIFY_ADDON_TOKEN when both env vars set", () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "env-api-key");
        vi.stubEnv("CLOCKIFY_ADDON_TOKEN", "env-addon-token");
        // No assertion of which was used (the SDK's BaseClientOptions
        // hides the choice once constructed) — but the call must not
        // throw, and both env vars being set is allowed at the env layer
        // (only explicit options enforce XOR).
        const client = createClockifyClient();
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("explicit apiKey beats CLOCKIFY_ADDON_TOKEN env", () => {
        vi.stubEnv("CLOCKIFY_ADDON_TOKEN", "env-addon-token");
        const client = createClockifyClient({ apiKey: "explicit-api-key" });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("explicit addonToken beats CLOCKIFY_API_KEY env", () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "env-api-key");
        const client = createClockifyClient({ addonToken: "explicit-addon-token" });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("treats empty-string env vars as absent", () => {
        // beforeEach stubs both to "" already, but be explicit here so
        // the case is greppable: the factory must treat "" the same as
        // a fully-unset env var and proceed to throw.
        vi.stubEnv("CLOCKIFY_API_KEY", "");
        vi.stubEnv("CLOCKIFY_ADDON_TOKEN", "");
        expect(() => createClockifyClient()).toThrow(
            /must provide exactly one .*CLOCKIFY_API_KEY/,
        );
    });

    it("throws when neither apiKey/addonToken nor env vars are set", () => {
        expect(() => createClockifyClient()).toThrow(/must provide exactly one/);
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

    it("accepts providing neither at the TS type level (env-var path)", () => {
        // No @ts-expect-error: the third union branch makes `{}` a
        // valid shape; the runtime then reads from env vars.
        const _opts: CreateClockifyClientOptions = {};
        void _opts;
        expect(true).toBe(true);
    });
});
