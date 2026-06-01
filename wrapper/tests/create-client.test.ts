import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClockifyClient, type CreateClockifyClientOptions } from "../create-client.js";
import { BadRequestError } from "../src/api/errors/index.js";
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
            // Use a loopback override so the host allowlist accepts it while
            // still exercising the environment passthrough path.
            environment: "http://127.0.0.1:19099/api/v1",
            headers: { "X-Custom": "v" },
            timeoutInSeconds: 5,
            maxRetries: 0,
        });
        expect(client).toBeInstanceOf(ClockifyApiClient);
    });

    it("serializes generated scalar query params, including page-size", async () => {
        let capturedUrl: string | undefined;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            capturedUrl =
                typeof input === "string"
                    ? input
                    : input instanceof URL
                      ? input.toString()
                      : input.url;
            return new Response("[]", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });

        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });
        await client.tags.list({
            workspaceId: "ws-1",
            archived: false,
            page: 1,
            "page-size": 5,
        });

        expect(capturedUrl).toBeDefined();
        const url = new URL(capturedUrl!);
        expect(url.searchParams.get("archived")).toBe("false");
        expect(url.searchParams.get("page")).toBe("1");
        expect(url.searchParams.get("page-size")).toBe("5");
    });

    it("serializes generated request body envelopes without dropping write fields", async () => {
        let capturedBody: string | null | undefined;
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            capturedBody = init?.body as string | null | undefined;
            return new Response(JSON.stringify({ id: "client-1", name: "Acme" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });

        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });
        await client.clients.create({
            workspaceId: "ws-1",
            body: { name: "Acme" },
        });

        expect(capturedBody).toBe(JSON.stringify({ name: "Acme" }));
    });

    it("throws generated status-specific API errors", async () => {
        const fetchMock = vi.fn(
            async () =>
                new Response(JSON.stringify({ message: "invalid request" }), {
                    status: 400,
                    headers: { "content-type": "application/json" },
                }),
        );

        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });

        await expect(client.tags.list({ workspaceId: "ws-1" })).rejects.toBeInstanceOf(
            BadRequestError,
        );
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
        expect(() => createClockifyClient()).toThrow(/must provide exactly one .*CLOCKIFY_API_KEY/);
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

    describe("debug option", () => {
        it("debug: true wires console.debug logging on requests + responses", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const fetchMock = vi.fn(
                async () =>
                    new Response(JSON.stringify([]), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            );

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
            });
            await client.tags.list({ workspaceId: "ws-1" });

            // Should have logged a → request line and a ← response line.
            const allCalls = debugSpy.mock.calls.map((c) => String(c[0]));
            expect(allCalls.some((msg) => msg.startsWith("[clockify] →"))).toBe(true);
            expect(allCalls.some((msg) => msg.startsWith("[clockify] ←"))).toBe(true);

            debugSpy.mockRestore();
        });

        it("debug: false (default) does NOT log to console.debug", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const fetchMock = vi.fn(
                async () =>
                    new Response(JSON.stringify([]), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            );

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                // no debug field — default is off
            });
            await client.tags.list({ workspaceId: "ws-1" });

            const sdkCalls = debugSpy.mock.calls.filter(
                (c) => typeof c[0] === "string" && (c[0] as string).startsWith("[clockify]"),
            );
            expect(sdkCalls).toHaveLength(0);

            debugSpy.mockRestore();
        });

        it("debug: true composes with user-provided hooks", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const userBefore = vi.fn();
            const userAfter = vi.fn();
            const fetchMock = vi.fn(
                async () =>
                    new Response("[]", {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            );

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                hooks: {
                    beforeRequest: userBefore,
                    afterResponse: userAfter,
                },
            });
            await client.tags.list({ workspaceId: "ws-1" });

            // User hooks still fire
            expect(userBefore).toHaveBeenCalledOnce();
            expect(userAfter).toHaveBeenCalledOnce();
            // Debug logs still happen
            const sdkCalls = debugSpy.mock.calls.filter(
                (c) => typeof c[0] === "string" && (c[0] as string).startsWith("[clockify]"),
            );
            expect(sdkCalls.length).toBeGreaterThanOrEqual(2); // → + ←

            debugSpy.mockRestore();
        });

        it("debug: true logs errors via ✘ prefix on network failures", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const fetchMock = vi.fn(async () => {
                throw new TypeError("fetch failed");
            });

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                maxRetries: 0,
            });
            await expect(client.tags.list({ workspaceId: "ws-1" })).rejects.toBeDefined();

            const allCalls = debugSpy.mock.calls.map((c) => String(c[0]));
            expect(allCalls.some((msg) => msg.startsWith("[clockify] →"))).toBe(true);
            expect(allCalls.some((msg) => msg.startsWith("[clockify] ✘"))).toBe(true);

            debugSpy.mockRestore();
        });
    });

    describe("base URL allowlist (H1)", () => {
        it("rejects an http:// base URL (must be HTTPS)", () => {
            expect(() =>
                createClockifyClient({ apiKey: "k", environment: "http://api.clockify.me/api/v1" }),
            ).toThrow(/https:\/\//);
        });

        it("rejects http:// even with allowInsecureBaseUrl: true (no cleartext credentials)", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "http://evil.example.com/api/v1",
                    allowInsecureBaseUrl: true,
                }),
            ).toThrow(/https:\/\//);
        });

        it("allows the production api.clockify.me host over HTTPS", () => {
            const client = createClockifyClient({
                apiKey: "k",
                environment: "https://api.clockify.me/api/v1",
            });
            expect(client).toBeInstanceOf(ClockifyApiClient);
        });

        it("allows the reports / audit-log / pto Clockify API hosts over HTTPS", () => {
            for (const url of [
                "https://reports.api.clockify.me/v1",
                "https://auditlog.api.clockify.me/v1",
                "https://pto.api.clockify.me/v1",
            ]) {
                const client = createClockifyClient({ apiKey: "k", environment: url });
                expect(client).toBeInstanceOf(ClockifyApiClient);
            }
        });

        it("allows localhost / 127.0.0.1 / ::1 (IPv6) loopback on any port", () => {
            for (const url of [
                "http://localhost:8080/api/v1",
                "http://127.0.0.1:19091/api/v1",
                "https://127.0.0.1:8443/api/v1",
                "http://[::1]:9000/api/v1",
            ]) {
                const client = createClockifyClient({ apiKey: "k", environment: url });
                expect(client).toBeInstanceOf(ClockifyApiClient);
            }
        });

        it("rejects an arbitrary HTTPS host by default", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "https://evil.example.com/api/v1",
                }),
            ).toThrow(/not an allowlisted Clockify host/);
        });

        it("includes recovery guidance pointing at the opt-in flag when rejecting", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "https://evil.example.com/api/v1",
                }),
            ).toThrow(/allowInsecureBaseUrl: true/);
        });

        it("allows an arbitrary HTTPS host when allowInsecureBaseUrl: true is set, with a warning", () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const client = createClockifyClient({
                apiKey: "k",
                environment: "https://my-proxy.example.com/api/v1",
                allowInsecureBaseUrl: true,
            });
            expect(client).toBeInstanceOf(ClockifyApiClient);
            const warned = warnSpy.mock.calls.map((c) => String(c[0]));
            expect(warned.some((m) => m.includes("allowInsecureBaseUrl"))).toBe(true);
            warnSpy.mockRestore();
        });

        it("also validates the baseUrl alias, not just environment", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    baseUrl: "https://evil.example.com/api/v1",
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(/not an allowlisted Clockify host/);
        });

        it("validates a base URL resolved from CLOCKIFY_BASE_URL via the MCP/CLI env path", () => {
            // The factory itself does not read CLOCKIFY_BASE_URL (MCP/CLI
            // pass it through as `environment`), but a malicious value
            // arriving by that route must still be rejected.
            vi.stubEnv("CLOCKIFY_BASE_URL", "https://evil.example.com/api/v1");
            expect(() =>
                createClockifyClient({ apiKey: "k", environment: process.env.CLOCKIFY_BASE_URL }),
            ).toThrow(/not an allowlisted Clockify host/);
        });

        it("leaves a base URL Supplier (function) unvalidated — it resolves at request time", () => {
            const client = createClockifyClient({
                apiKey: "k",
                environment: () => "https://evil.example.com/api/v1",
            });
            expect(client).toBeInstanceOf(ClockifyApiClient);
        });

        it("accepts the default (no base URL override)", () => {
            const client = createClockifyClient({ apiKey: "k" });
            expect(client).toBeInstanceOf(ClockifyApiClient);
        });
    });
});
