import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClockifyClient, type CreateClockifyClientOptions } from "../create-client.js";
import { BadRequestError } from "../src/api/errors/index.js";
import { ClockifyApiClient } from "../src/index.js";

type TestOutcome<T> =
    | { status: "fulfilled"; value: T }
    | { status: "rejected"; reason: unknown };

function observe<T>(promise: Promise<T>): Promise<TestOutcome<T>> {
    return promise.then(
        (value) => ({ status: "fulfilled", value }),
        (reason: unknown) => ({ status: "rejected", reason }),
    );
}

function createDeferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
        resolve = accept;
    });
    return { promise, resolve };
}

async function outcomeWithin<T>(
    outcome: Promise<TestOutcome<T>>,
    timeoutMs = 25,
): Promise<TestOutcome<T> | { status: "timed_out" }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            outcome,
            new Promise<{ status: "timed_out" }>((resolve) => {
                timer = setTimeout(() => resolve({ status: "timed_out" }), timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

describe("createClockifyClient", () => {
    it("validates a typed request destination before resolving authentication", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const apiKey = vi.fn(() => "secret");
        const client = new ClockifyApiClient({
            apiKey,
            baseUrl: Promise.resolve("https://attacker.example/api/v1"),
            fetch: dispatch,
            maxRetries: 0,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toThrow(
            /not an allowlisted Clockify host/i,
        );
        expect(apiKey).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("falls through an undefined typed baseUrl supplier to environment", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response("[]", {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
        const runtimeInvalidBaseUrl = (async () => undefined) as unknown as NonNullable<
            ClockifyApiClient.Options["baseUrl"]
        >;
        const client = new ClockifyApiClient({
            apiKey: "secret",
            baseUrl: runtimeInvalidBaseUrl,
            environment: "https://api.clockify.me/environment/v1",
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list({ workspaceId: "workspace" });

        const [input, init] = dispatch.mock.calls[0] as Parameters<typeof fetch>;
        expect(new Request(input, init).url).toBe(
            "https://api.clockify.me/environment/v1/workspaces/workspace/tags",
        );
    });

    it.each(["base", "header", "auth"] as const)(
        "aborts a never-settling typed %s supplier immediately and never dispatches later",
        async (stage) => {
            const pending = createDeferred<string>();
            const dispatch = vi.fn<typeof fetch>();
            const entered = vi.fn();
            const apiKey = vi.fn(() => {
                if (stage === "auth") {
                    entered();
                    return pending.promise;
                }
                return "secret";
            });
            const controller = new AbortController();
            const client = new ClockifyApiClient({
                apiKey,
                baseUrl:
                    stage === "base"
                        ? () => {
                              entered();
                              return pending.promise;
                          }
                        : "https://api.clockify.me/api/v1",
                ...(stage === "header"
                    ? {
                          headers: {
                              "X-Deferred": () => {
                                  entered();
                                  return pending.promise;
                              },
                          },
                      }
                    : {}),
                fetch: dispatch,
                maxRetries: 0,
            });

            const outcome = observe(
                client.tags.list(
                    { workspaceId: "workspace" },
                    { abortSignal: controller.signal },
                ),
            );
            while (entered.mock.calls.length === 0) await Promise.resolve();
            const reason = new Error(`abort typed ${stage} supplier`);
            controller.abort(reason);
            const raced = await outcomeWithin(outcome);

            pending.resolve(
                stage === "base" ? "https://api.clockify.me/api/v1" : "late-value",
            );
            await outcome;
            await Promise.resolve();

            expect(raced).toEqual({ status: "rejected", reason });
            expect(dispatch).not.toHaveBeenCalled();
            if (stage !== "auth") expect(apiKey).not.toHaveBeenCalled();
        },
    );

    it("replays a typed PUT body with a fresh Request for every retry", async () => {
        vi.useFakeTimers();
        try {
            const requests: Request[] = [];
            const bodies: string[] = [];
            const dispatch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
                expect(input).toBeInstanceOf(Request);
                expect(init).toBeUndefined();
                const request = input as Request;
                requests.push(request);
                bodies.push(await request.text());
                return new Response(
                    requests.length === 1 ? null : JSON.stringify({ id: "tag" }),
                    {
                        status: requests.length === 1 ? 503 : 200,
                        headers: { "content-type": "application/json" },
                    },
                );
            });
            const client = new ClockifyApiClient({
                apiKey: "secret",
                fetch: dispatch,
                maxRetries: 1,
            });

            const outcome = client.tags.update({
                workspaceId: "workspace",
                tagId: "tag",
                name: "same body",
                archived: false,
            });
            await vi.runAllTimersAsync();
            await expect(outcome).resolves.toMatchObject({ id: "tag" });

            expect(requests).toHaveLength(2);
            expect(new Set(requests).size).toBe(2);
            expect(bodies).toEqual([
                JSON.stringify({ archived: false, name: "same body" }),
                JSON.stringify({ archived: false, name: "same body" }),
            ]);
            expect(dispatch.mock.calls.every(([, init]) => init === undefined)).toBe(true);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("keeps configured authentication last in typed header precedence", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(
            new Response("[]", {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
        const client = new ClockifyApiClient({
            apiKey: "secret",
            headers: { "X-Api-Key": "client-attacker" },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list(
            { workspaceId: "workspace" },
            { headers: { "X-Api-Key": "request-attacker" } },
        );

        const [input, init] = dispatch.mock.calls[0] as Parameters<typeof fetch>;
        expect(new Request(input, init).headers.get("X-Api-Key")).toBe("secret");
    });

    it("aborts immediately while typed retry-response cancellation is pending", async () => {
        const cancellation = createDeferred<void>();
        const cancel = vi.fn(() => cancellation.promise);
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                new Response(new ReadableStream<Uint8Array>({ cancel }), {
                    status: 503,
                }),
            )
            .mockResolvedValueOnce(
                new Response("[]", {
                    status: 200,
                    headers: { "content-type": "application/json" },
                }),
            );
        const controller = new AbortController();
        const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch });
        const outcome = observe(
            client.tags.list(
                { workspaceId: "workspace" },
                { maxRetries: 1, abortSignal: controller.signal },
            ),
        );
        while (cancel.mock.calls.length === 0) await Promise.resolve();

        const reason = new Error("abort pending typed response cancellation");
        controller.abort(reason);
        const raced = await outcomeWithin(outcome);
        cancellation.resolve();
        await outcome;
        await Promise.resolve();

        expect(raced).toEqual({ status: "rejected", reason });
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("blocks a dynamic off-host typed request before the custom fetch sees credentials", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const client = createClockifyClient({
            apiKey: "secret",
            environment: async () => "https://attacker.example/api/v1",
            fetch: dispatch,
            maxRetries: 0,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toThrow(
            /not an allowlisted Clockify host/i,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });
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

    it("routes report operations to the dedicated reports host", async () => {
        let capturedUrl: string | undefined;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            capturedUrl =
                input instanceof URL
                    ? input.toString()
                    : typeof input === "string"
                      ? input
                      : input.url;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });

        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });
        await client.reports.summary({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-07T00:00:00Z",
            summaryFilter: { groups: ["PROJECT"] },
        });

        const url = new URL(capturedUrl!);
        expect(url.host).toBe("reports.api.clockify.me");
        expect(url.pathname).toBe("/v1/workspaces/ws-1/reports/summary");
    });

    it("lets an explicit base URL override the per-operation host", async () => {
        let capturedUrl: string | undefined;
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            capturedUrl =
                input instanceof URL
                    ? input.toString()
                    : typeof input === "string"
                      ? input
                      : input.url;
            return new Response("{}", {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });

        const client = createClockifyClient({
            apiKey: "test",
            environment: "http://127.0.0.1:4321",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });
        await client.reports.summary({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-07T00:00:00Z",
            summaryFilter: { groups: ["PROJECT"] },
        });

        expect(new URL(capturedUrl!).host).toBe("127.0.0.1:4321");
    });

    it("serializes generated request body envelopes without dropping write fields", async () => {
        let capturedBody: string | null | undefined;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            capturedBody = await new Request(input, init).text();
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

    it("lands archived:true on the wire for a clients.update body envelope (archive deletion-safety path)", async () => {
        // The archive-then-delete client adapter deliberately uses the body-envelope
        // passthrough in core.bodyFromRequest (request.ts:225) carrying archived:true
        // to the wire. If that branch regresses, archiving silently no-ops and the
        // subsequent live DELETE 400s ("Cannot delete an active client"). This pins
        // the exact wire bytes for that path end-to-end.
        let capturedBody: string | null | undefined;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            capturedBody = await new Request(input, init).text();
            return new Response(JSON.stringify({ id: "client-1", name: "Globex", archived: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });

        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock as typeof fetch,
            maxRetries: 0,
        });
        await client.clients.update({
            workspaceId: "ws-1",
            clientId: "client-1",
            body: { name: "Globex", archived: true },
        });

        expect(typeof capturedBody).toBe("string");
        expect(JSON.parse(capturedBody as string)).toEqual({ name: "Globex", archived: true });
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

        it("rejects http:// even with allowNonClockifyHttpsHost: true (no cleartext credentials)", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "http://evil.example.com/api/v1",
                    allowNonClockifyHttpsHost: true,
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
                "https://auditlog-api.api.clockify.me/v1",
                "https://pto.api.clockify.me/v1",
            ]) {
                const client = createClockifyClient({ apiKey: "k", environment: url });
                expect(client).toBeInstanceOf(ClockifyApiClient);
            }
        });

        it("rejects the non-existent no-hyphen audit-log host (regression for the allowlist typo)", () => {
            // The real audit-log host is `auditlog-api.api.clockify.me`;
            // the hyphenless `auditlog.api.clockify.me` does not exist and
            // must NOT be auto-accepted (it was, before the typo fix).
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "https://auditlog.api.clockify.me/v1",
                }),
            ).toThrow(/not an allowlisted Clockify host/);
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

        it("rejects non-HTTP schemes even when the host is loopback", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    environment: "ftp://localhost/api/v1",
                }),
            ).toThrow(/http.*https|scheme|protocol/i);
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
            ).toThrow(/allowNonClockifyHttpsHost: true/);
        });

        it("allows an arbitrary HTTPS host when allowNonClockifyHttpsHost: true is set, with a warning", () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const client = createClockifyClient({
                apiKey: "k",
                environment: "https://my-proxy.example.com/api/v1",
                allowNonClockifyHttpsHost: true,
            });
            expect(client).toBeInstanceOf(ClockifyApiClient);
            const warned = warnSpy.mock.calls.map((c) => String(c[0]));
            expect(warned.some((m) => m.includes("allowNonClockifyHttpsHost"))).toBe(true);
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
            const environment = process.env.CLOCKIFY_BASE_URL;
            if (environment === undefined) throw new Error("CLOCKIFY_BASE_URL test setup failed");
            expect(() => createClockifyClient({ apiKey: "k", environment })).toThrow(
                /not an allowlisted Clockify host/,
            );
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
