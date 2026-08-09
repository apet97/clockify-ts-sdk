import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClockifyClient, type CreateClockifyClientOptions } from "../create-client.js";
import { BadRequestError } from "../src/api/errors/index.js";
import type { ClockifyApi } from "../src/index.js";
import { ClockifyApiClient, ClockifyApiTimeoutError } from "../src/index.js";

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

function stalledJsonResponse(onConsume: () => void = () => undefined): Response {
    const response = new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
    });
    Object.defineProperty(response, "text", {
        configurable: true,
        value: () => {
            onConsume();
            return new Promise<string>(() => undefined);
        },
    });
    return response;
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

    it("replays a typed PUT body with a fresh Request for every retry (explicit retryMutationMethods opt-in)", async () => {
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
                retryMutationMethods: true,
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
            headers: {
                "X-Api-Key": "client-attacker",
                "X-Addon-Token": "client-addon-attacker",
            },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list(
            { workspaceId: "workspace" },
            {
                headers: {
                    "X-Api-Key": "request-attacker",
                    "X-Addon-Token": "request-addon-attacker",
                },
            },
        );

        const [input, init] = dispatch.mock.calls[0] as Parameters<typeof fetch>;
        const headers = new Request(input, init).headers;
        expect(headers.get("X-Api-Key")).toBe("secret");
        expect(headers.has("X-Addon-Token")).toBe(false);
    });

    it("rejects dual manual Clockify auth schemes on a typed request", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const client = new ClockifyApiClient({
            auth: false,
            headers: {
                "X-Api-Key": "manual-api-key",
                "X-Addon-Token": "manual-addon-token",
            },
            fetch: dispatch,
            maxRetries: 0,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toThrow(
            /exactly one of X-Api-Key or X-Addon-Token/,
        );
        expect(dispatch).not.toHaveBeenCalled();
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

    it("times out a never-settling typed request so finally cleanup can run", async () => {
        vi.useFakeTimers();
        let cleanupRan = false;
        try {
            const fetchMock = vi.fn<typeof fetch>().mockImplementation(
                (input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        const signal = new Request(input, init).signal;
                        const rejectFromSignal = () =>
                            reject(new Error("transport aborted", { cause: signal.reason }));
                        if (signal.aborted) rejectFromSignal();
                        else signal.addEventListener("abort", rejectFromSignal, { once: true });
                    }),
            );
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 0,
            });

            try {
                const request = expect(
                    client.tags.list({ workspaceId: "workspace" }),
                ).rejects.toThrow(/timed out/i);
                await vi.advanceTimersByTimeAsync(20);
                await request;
            } finally {
                cleanupRan = true;
            }

            expect(fetchMock).toHaveBeenCalledOnce();
            expect(cleanupRan).toBe(true);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("keeps the typed request timeout active while consuming a stalled response body", async () => {
        vi.useFakeTimers();
        let cleanupRan = false;
        try {
            const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
                const signal = new Request(input, init).signal;
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("["));
                        const rejectFromSignal = () => controller.error(signal.reason);
                        if (signal.aborted) rejectFromSignal();
                        else signal.addEventListener("abort", rejectFromSignal, { once: true });
                    },
                });
                return Promise.resolve(
                    new Response(body, {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            });
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 0,
            });

            try {
                const request = expect(
                    client.tags.list({ workspaceId: "workspace" }),
                ).rejects.toThrow(/timed out/i);
                await vi.advanceTimersByTimeAsync(20);
                await request;
            } finally {
                cleanupRan = true;
            }

            expect(fetchMock).toHaveBeenCalledOnce();
            expect(cleanupRan).toBe(true);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("preserves the exact caller reason when abort wins during typed body consumption", async () => {
        const bodyStarted = createDeferred<void>();
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(stalledJsonResponse(() => bodyStarted.resolve(undefined)));
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock,
            timeoutInSeconds: 1,
            maxRetries: 0,
        });
        const controller = new AbortController();
        const outcome = observe(
            client.tags.list(
                { workspaceId: "workspace" },
                { abortSignal: controller.signal },
            ),
        );

        await bodyStarted.promise;
        const reason = new Error("caller stopped body consumption");
        controller.abort(reason);

        expect(await outcome).toEqual({ status: "rejected", reason });
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("keeps an already-won typed body timeout when caller abort happens later", async () => {
        vi.useFakeTimers();
        try {
            const bodyStarted = createDeferred<void>();
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockResolvedValue(stalledJsonResponse(() => bodyStarted.resolve(undefined)));
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 0,
            });
            const controller = new AbortController();
            const outcome = observe(
                client.tags.list(
                    { workspaceId: "workspace" },
                    { abortSignal: controller.signal },
                ),
            );

            await bodyStarted.promise;
            await vi.advanceTimersByTimeAsync(10);
            controller.abort(new Error("later caller abort"));
            const settled = await outcome;

            expect(settled.status).toBe("rejected");
            expect(settled.status === "rejected" && settled.reason).toBeInstanceOf(
                ClockifyApiTimeoutError,
            );
            expect(fetchMock).toHaveBeenCalledOnce();
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("retries a replay-safe GET after a typed body timeout", async () => {
        vi.useFakeTimers();
        try {
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(stalledJsonResponse())
                .mockResolvedValueOnce(
                    new Response("[]", {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 1,
            });

            const result = client.tags.list({ workspaceId: "workspace" });
            await vi.runAllTimersAsync();

            await expect(result).resolves.toEqual([]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("does not replay a POST after a typed body timeout", async () => {
        vi.useFakeTimers();
        try {
            const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(stalledJsonResponse());
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 3,
                retryMutationMethods: true,
            });

            const result = expect(
                client.tags.create({ workspaceId: "workspace", name: "x" }),
            ).rejects.toThrow(/timed out/i);
            await vi.advanceTimersByTimeAsync(20);

            await result;
            expect(fetchMock).toHaveBeenCalledOnce();
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("retries an opted-in PUT after a typed body timeout", async () => {
        vi.useFakeTimers();
        try {
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(stalledJsonResponse())
                .mockResolvedValueOnce(
                    new Response("{}", {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 1,
                retryMutationMethods: true,
            });

            const result = client.tags.update({
                workspaceId: "workspace",
                tagId: "tag",
                name: "x",
                archived: false,
            });
            await vi.runAllTimersAsync();

            await expect(result).resolves.toEqual({});
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("bounds a stalled retry-response cancellation before retrying", async () => {
        vi.useFakeTimers();
        try {
            const stalledCancellation = new Promise<void>(() => undefined);
            const retryResponse = {
                status: 503,
                headers: new Headers(),
                body: { cancel: () => stalledCancellation },
            } as unknown as Response;
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(retryResponse)
                .mockResolvedValueOnce(
                    new Response("[]", {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                );
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock,
                timeoutInSeconds: 0.01,
                maxRetries: 1,
            });

            const result = client.tags.list({ workspaceId: "workspace" });
            await vi.runAllTimersAsync();

            await expect(result).resolves.toEqual([]);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("preserves an ordinary typed body-read error without retrying", async () => {
        const bodyError = new Error("body read failed");
        const response = new Response("[]", {
            status: 200,
            headers: { "content-type": "application/json" },
        });
        Object.defineProperty(response, "text", {
            configurable: true,
            value: () => Promise.reject(bodyError),
        });
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
        const client = createClockifyClient({
            apiKey: "test",
            fetch: fetchMock,
            maxRetries: 3,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toBe(bodyError);
        expect(fetchMock).toHaveBeenCalledOnce();
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

    it("treats an explicitly-passed blank credential as absent", () => {
        expect(() =>
            createClockifyClient({ apiKey: "" } as unknown as CreateClockifyClientOptions),
        ).toThrow(/must provide exactly one/);
        expect(() =>
            createClockifyClient({ addonToken: "  " } as unknown as CreateClockifyClientOptions),
        ).toThrow(/must provide exactly one/);
    });

    it("treats a whitespace-only env credential as absent", () => {
        vi.stubEnv("CLOCKIFY_API_KEY", "   ");
        expect(() => createClockifyClient()).toThrow(/must provide exactly one/);
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

        it("debug: true still delivers the user's non-wrapped hooks (onMetric)", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const fetchMock = vi.fn(
                async () =>
                    new Response(JSON.stringify([]), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            );
            const names: string[] = [];

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                hooks: { onMetric: (m) => void names.push(m.name) },
            });
            await client.tags.list({ workspaceId: "ws-1" });

            expect(names).toContain("request.duration");

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

        // --- the `?? "no-id"` fallback and the onRetry hook -----------------
        // composedFetch generates a request id BY DEFAULT (resolveRequestIdFn
        // falls back to generateRequestId), so `ctx.requestId` is normally a
        // string and the `"no-id"` branch never evaluates. It is reachable
        // only via `requestId: false`, which is why the tests above never hit
        // it. Assert on the rendered "[no-id]" so blanking the literal fails.

        it("debug: true renders [no-id] on request/response lines when requestId is disabled", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
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
                requestId: false,
            });
            await client.tags.list({ workspaceId: "ws-1" });

            const allCalls = debugSpy.mock.calls.map((c) => String(c[0]));
            const request = allCalls.find((msg) => msg.startsWith("[clockify] →"));
            const response = allCalls.find((msg) => msg.startsWith("[clockify] ←"));
            expect(request).toContain("[no-id]");
            expect(response).toContain("[no-id]");

            debugSpy.mockRestore();
        });

        it("debug: true renders [no-id] on the error line when requestId is disabled", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const fetchMock = vi.fn(async () => {
                throw new TypeError("fetch failed");
            });

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                requestId: false,
                maxRetries: 0,
            });
            await expect(client.tags.list({ workspaceId: "ws-1" })).rejects.toBeDefined();

            const errorLine = debugSpy.mock.calls
                .map((c) => String(c[0]))
                .find((msg) => msg.startsWith("[clockify] ✘"));
            expect(errorLine).toContain("[no-id]");

            debugSpy.mockRestore();
        });

        it("debug: true logs a ↺ retry line, and still runs the user's onRetry hook", async () => {
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            const userRetry = vi.fn();
            let call = 0;
            const fetchMock = vi.fn(async () => {
                call += 1;
                // 503 is in the default retryableStatusCodes, and GET is
                // retryable by default under RETRY-001.
                return call === 1
                    ? new Response("", { status: 503 })
                    : new Response("[]", {
                          status: 200,
                          headers: { "content-type": "application/json" },
                      });
            });

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                requestId: false,
                retryPolicy: { maxRetries: 1, computeDelay: () => 0 },
                hooks: { onRetry: userRetry },
            });
            await client.tags.list({ workspaceId: "ws-1" });

            const retryLine = debugSpy.mock.calls
                .map((c) => String(c[0]))
                .find((msg) => msg.startsWith("[clockify] ↺"));
            expect(retryLine).toBeDefined();
            expect(retryLine).toContain("retry attempt");
            expect(retryLine).toContain("[no-id]");
            // The debug mixer must not swallow the caller's own onRetry hook.
            expect(userRetry).toHaveBeenCalled();

            debugSpy.mockRestore();
        });

        it("debug: true tolerates a caller with no onRetry hook at all", async () => {
            // Pins the optional chaining in `userHooks?.onRetry?.(ctx)`:
            // retrying with hooks omitted entirely must not throw.
            const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
            let call = 0;
            const fetchMock = vi.fn(async () => {
                call += 1;
                return call === 1
                    ? new Response("", { status: 503 })
                    : new Response("[]", {
                          status: 200,
                          headers: { "content-type": "application/json" },
                      });
            });

            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                debug: true,
                retryPolicy: { maxRetries: 1, computeDelay: () => 0 },
            });

            await expect(client.tags.list({ workspaceId: "ws-1" })).resolves.toBeDefined();
            expect(fetchMock).toHaveBeenCalledTimes(2);

            debugSpy.mockRestore();
        });
    });

    describe("option pass-through into composedFetch", () => {
        function jsonOnce() {
            return vi.fn(
                async () =>
                    new Response("[]", {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
            );
        }

        function headersOf(fetchMock: ReturnType<typeof jsonOnce>): Headers {
            const [input, init] = (fetchMock.mock.calls[0] ?? []) as unknown as [
                unknown,
                RequestInit | undefined,
            ];
            return new Headers(
                init?.headers ?? (input instanceof Request ? input.headers : undefined),
            );
        }

        it("forwards an explicit userAgent to the outgoing request", async () => {
            const fetchMock = jsonOnce();
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                userAgent: "acme-integration/9.9",
            });
            await client.tags.list({ workspaceId: "ws-1" });

            expect(headersOf(fetchMock).get("user-agent")).toBe("acme-integration/9.9");
        });

        it("forwards requestId: false so no X-Request-Id header is sent", async () => {
            const fetchMock = jsonOnce();
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                requestId: false,
            });
            await client.tags.list({ workspaceId: "ws-1" });

            // Dropping the requestId pass-through would restore the default
            // generator and put the header back.
            expect(headersOf(fetchMock).has("x-request-id")).toBe(false);
        });

        it("forwards a custom requestId generator", async () => {
            const fetchMock = jsonOnce();
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                requestId: () => "fixed-id-123",
            });
            await client.tags.list({ workspaceId: "ws-1" });

            expect(headersOf(fetchMock).get("x-request-id")).toBe("fixed-id-123");
        });

        it("forwards a validated baseUrl override to the request URL", async () => {
            const fetchMock = jsonOnce();
            const client = createClockifyClient({
                apiKey: "test",
                fetch: fetchMock as typeof fetch,
                baseUrl: "https://api.clockify.me/api/v1",
            });
            await client.tags.list({ workspaceId: "ws-1" });

            const [input] = (fetchMock.mock.calls[0] ?? []) as unknown as [unknown];
            const url = typeof input === "string" ? input : String((input as Request).url);
            expect(url).toContain("https://api.clockify.me/api/v1");
        });
    });

    describe("routing is mutually exclusive with environment/baseUrl", () => {
        // Runtime backstop for a plain-JS caller; the TS type already rejects
        // both together, so only a runtime test can reach this throw.
        it("throws when routing and environment are supplied together", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    routing: { profile: "global" },
                    environment: "https://api.clockify.me/api/v1",
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(TypeError);
        });

        it("throws when routing and baseUrl are supplied together", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    routing: { profile: "global" },
                    baseUrl: "https://api.clockify.me/api/v1",
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(TypeError);
        });

        it("names both options in the error so the caller knows which to drop", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    routing: { profile: "global" },
                    baseUrl: "https://api.clockify.me/api/v1",
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(/pass either `routing` or `environment`\/`baseUrl`, not both/);
        });

        it("accepts routing on its own", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    routing: { profile: "global" },
                }),
            ).not.toThrow();
        });

        it("rejects the generated serviceBaseUrls escape hatch with routing guidance", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "k",
                    serviceBaseUrls: { regular: "https://attacker.example/api/v1" },
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(/`serviceBaseUrls` is internal; use the validated `routing` option/);
        });

        it("rejects a nested auth override before it can replace credentials or routing", () => {
            expect(() =>
                createClockifyClient({
                    apiKey: "outer-key",
                    auth: {
                        apiKey: "inner-key",
                        serviceBaseUrls: { regular: "https://euc1.clockify.me/api/v1" },
                    },
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(/`auth` is not accepted; construct `ClockifyApiClient` directly/);
        });

        it.each([
            ["disabled authentication", false],
            ["a custom provider", async () => ({ headers: { Authorization: "custom" } })],
        ] as const)("rejects %s with direct-constructor guidance", (_label, auth) => {
            expect(() =>
                createClockifyClient({
                    apiKey: "key",
                    auth,
                } as unknown as CreateClockifyClientOptions),
            ).toThrow(/`auth` is not accepted; construct `ClockifyApiClient` directly/);
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

        it("allows the reports / audit-log / regional / subdomain Clockify API hosts over HTTPS", () => {
            for (const url of [
                "https://reports.api.clockify.me/v1",
                "https://auditlog-api.api.clockify.me/v1",
                "https://euc1.clockify.me/api/v1",
                "https://acme.clockify.me/report/v1",
            ]) {
                const client = createClockifyClient({ apiKey: "k", environment: url });
                expect(client).toBeInstanceOf(ClockifyApiClient);
            }
        });

        it("rejects the removed pto.api.clockify.me host (H02-ROUTING confirmed it dead)", () => {
            expect(() =>
                createClockifyClient({ apiKey: "k", environment: "https://pto.api.clockify.me/v1" }),
            ).toThrow(/not an allowlisted Clockify host/);
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

        it("rejects a base URL Supplier that resolves to a disallowed host at request time, before dispatch", async () => {
            // Proof closure for the construction-time test above: a Supplier
            // is unvalidated at construction only because validation is
            // deferred, not skipped. This proves the deferred validation
            // actually runs — and runs before the underlying fetch, so the
            // disallowed host is never dispatched to.
            const dispatch = vi.fn<typeof fetch>();
            const client = createClockifyClient({
                apiKey: "k",
                environment: () => "https://evil.example.com/api/v1",
                fetch: dispatch,
                maxRetries: 0,
            });

            await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toThrow(
                /not an allowlisted Clockify host/,
            );
            expect(dispatch).not.toHaveBeenCalled();
        });

        it("accepts the default (no base URL override)", () => {
            const client = createClockifyClient({ apiKey: "k" });
            expect(client).toBeInstanceOf(ClockifyApiClient);
        });
    });
});

describe("createClockifyClient routing (ROUTE-002/P02-07)", () => {
    function jsonDispatch() {
        return vi
            .fn<typeof fetch>()
            .mockImplementation(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    }

    function dispatchedUrl(dispatch: ReturnType<typeof jsonDispatch>, callIndex = 0): string {
        const [input, init] = dispatch.mock.calls[callIndex] as Parameters<typeof fetch>;
        return new Request(input, init).url;
    }

    it("routes a regular operation to the approved region host", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: { profile: "eu", acknowledgeUnconfirmedRegion: true },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list({ workspaceId: "workspace" });
        expect(dispatchedUrl(dispatch)).toBe("https://euc1.clockify.me/api/v1/workspaces/workspace/tags");
    });

    it("routes reports and audit operations independently under the same client (RED item 1)", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: { profile: "eu", acknowledgeUnconfirmedRegion: true },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.reports.detailed({ workspaceId: "workspace", body: {} } as ClockifyApi.DetailedReportsRequest);
        expect(dispatchedUrl(dispatch, 0)).toMatch(/^https:\/\/euc1\.clockify\.me\/report\/v1\//);

        // eu has no approved audit row -- audit stays on the default host,
        // proving reports and audit resolve independently under one client.
        await client.auditLogReport.search({
            workspaceId: "workspace",
            body: {},
        } as ClockifyApi.SearchAuditLogReportRequest);
        expect(dispatchedUrl(dispatch, 1)).toMatch(/^https:\/\/auditlog-api\.api\.clockify\.me\/v1\//);
    });

    it("routes a subdomain profile: reports to the subdomain host, regular to the region prefix", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: {
                profile: "subdomain",
                region: "eu",
                subdomain: "acme",
                acknowledgeUnconfirmedRegion: true,
            },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list({ workspaceId: "workspace" });
        expect(dispatchedUrl(dispatch)).toBe("https://euc1.clockify.me/api/v1/workspaces/workspace/tags");
    });

    it("routes a custom regular override without needing allowNonClockifyHttpsHost separately", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: {
                profile: "custom",
                services: { regular: "https://proxy.example.com/api/v1" },
                allowCustomHttpsHosts: true,
            },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list({ workspaceId: "workspace" });
        expect(dispatchedUrl(dispatch)).toBe(
            "https://proxy.example.com/api/v1/workspaces/workspace/tags",
        );
    });

    it("keeps the custom profile opt-in effective when the legacy host flag is false", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: {
                profile: "custom",
                services: { regular: "https://proxy.example.com/api/v1" },
                allowCustomHttpsHosts: true,
            },
            allowNonClockifyHttpsHost: false,
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.tags.list({ workspaceId: "workspace" });
        expect(dispatchedUrl(dispatch)).toBe("https://proxy.example.com/api/v1/workspaces/workspace/tags");
    });

    it("does not erase the reports route when a custom profile only names regular (RED item 2)", async () => {
        const dispatch = jsonDispatch();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: {
                profile: "custom",
                services: { regular: "https://proxy.example.com/api/v1" },
                allowCustomHttpsHosts: true,
            },
            fetch: dispatch,
            maxRetries: 0,
        });

        await client.reports.detailed({ workspaceId: "workspace", body: {} } as ClockifyApi.DetailedReportsRequest);
        expect(dispatchedUrl(dispatch)).toMatch(/^https:\/\/reports\.api\.clockify\.me\/v1\//);
    });

    it("still rejects an unapproved off-host destination under a routed client", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const client = new ClockifyApiClient({
            apiKey: "secret",
            baseUrl: "https://attacker.example/api/v1",
            fetch: dispatch,
            maxRetries: 0,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toThrow(
            /not an allowlisted Clockify host/i,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("still rejects redirect follow under a routed client", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const client = createClockifyClient({
            apiKey: "secret",
            routing: { profile: "eu", acknowledgeUnconfirmedRegion: true },
            fetch: dispatch,
            maxRetries: 0,
        });

        await expect(
            client.fetch("workspaces/workspace/tags", { redirect: "follow" }),
        ).rejects.toThrow(/redirect.*follow|follow.*redirect/i);
        expect(dispatch).not.toHaveBeenCalled();
    });
});

describe("generated retry defaults (RETRY-001/P02-09)", () => {
    function unstableDispatch(failFirstAttempt: () => Response | "network-error") {
        const calls: string[] = [];
        const dispatch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
            const request = input as Request;
            calls.push(request.method);
            if (calls.length === 1) {
                const outcome = failFirstAttempt();
                if (outcome === "network-error") throw new TypeError("network error: connection reset");
                return outcome;
            }
            return new Response(null, { status: 204 });
        });
        return { dispatch, calls };
    }

    it("retries a default GET on a retryable 503", async () => {
        vi.useFakeTimers();
        try {
            const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
            const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch, maxRetries: 1 });

            const outcome = client.tags.list({ workspaceId: "workspace" });
            await vi.runAllTimersAsync();
            await outcome;

            expect(calls).toEqual(["GET", "GET"]);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("does not retry a PUT on a retryable 503 by default", async () => {
        const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
        const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch, maxRetries: 1 });

        await expect(
            client.tags.update({ workspaceId: "workspace", tagId: "tag", name: "x", archived: false }),
        ).rejects.toBeDefined();
        expect(calls).toEqual(["PUT"]);
    });

    it("does not retry a DELETE on a retryable 503 by default", async () => {
        const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
        const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch, maxRetries: 1 });

        await expect(client.tags.delete({ workspaceId: "workspace", tagId: "tag" })).rejects.toBeDefined();
        expect(calls).toEqual(["DELETE"]);
    });

    it("does not retry a POST on a retryable 503, with or without retryMutationMethods", async () => {
        const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
        const client = new ClockifyApiClient({
            apiKey: "secret",
            fetch: dispatch,
            maxRetries: 1,
            retryMutationMethods: true,
        });

        await expect(client.tags.create({ workspaceId: "workspace", name: "x" })).rejects.toBeDefined();
        expect(calls).toEqual(["POST"]);
    });

    it("retries a PUT on a retryable 503 when retryMutationMethods is explicitly true", async () => {
        vi.useFakeTimers();
        try {
            const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
            const client = new ClockifyApiClient({
                apiKey: "secret",
                fetch: dispatch,
                maxRetries: 1,
                retryMutationMethods: true,
            });

            const outcome = client.tags.update({
                workspaceId: "workspace",
                tagId: "tag",
                name: "x",
                archived: false,
            });
            await vi.runAllTimersAsync();
            await outcome;

            expect(calls).toEqual(["PUT", "PUT"]);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("retries a DELETE on a retryable 503 when retryMutationMethods is set per-request", async () => {
        vi.useFakeTimers();
        try {
            const { dispatch, calls } = unstableDispatch(() => new Response(null, { status: 503 }));
            const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch, maxRetries: 1 });

            const outcome = client.tags.delete(
                { workspaceId: "workspace", tagId: "tag" },
                { retryMutationMethods: true },
            );
            await vi.runAllTimersAsync();
            await outcome;

            expect(calls).toEqual(["DELETE", "DELETE"]);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it.each([
        {
            label: "DOMException",
            makeError: (): Error => new DOMException("platform abort", "AbortError"),
        },
        {
            label: "plain Error",
            makeError: (): Error =>
                Object.assign(new Error("polyfill abort"), { name: "AbortError" }),
        },
    ])(
        "does not retry a $label AbortError for GET or an opted-in PUT",
        async ({ makeError }) => {
            vi.useFakeTimers();
            try {
                for (const method of ["GET", "PUT"] as const) {
                    const abortError = makeError();
                    const dispatch = vi.fn<typeof fetch>(async () => {
                        throw abortError;
                    });
                    const client = new ClockifyApiClient({
                        apiKey: "secret",
                        fetch: dispatch,
                        maxRetries: 2,
                        retryMutationMethods: method === "PUT",
                    });
                    const outcome =
                        method === "GET"
                            ? observe<unknown>(client.tags.list({ workspaceId: "workspace" }))
                            : observe<unknown>(
                                  client.tags.update({
                                      workspaceId: "workspace",
                                      tagId: "tag",
                                      name: "x",
                                      archived: false,
                                  }),
                              );
                    let settled: TestOutcome<unknown> | undefined;
                    void outcome.then((result) => {
                        settled = result;
                    });

                    await vi.advanceTimersByTimeAsync(0);

                    expect(settled?.status).toBe("rejected");
                    expect(
                        settled?.status === "rejected"
                            ? (settled.reason as { cause?: unknown }).cause
                            : undefined,
                    ).toBe(abortError);
                    expect(dispatch).toHaveBeenCalledOnce();

                    await vi.runAllTimersAsync();
                    expect(dispatch).toHaveBeenCalledOnce();
                }
            } finally {
                vi.clearAllTimers();
                vi.useRealTimers();
            }
        },
    );

    it("returns an ambiguous network failure after a mutation once, without replay, by default", async () => {
        const { dispatch, calls } = unstableDispatch(() => "network-error");
        const client = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch, maxRetries: 1 });

        await expect(
            client.tags.update({ workspaceId: "workspace", tagId: "tag", name: "x", archived: false }),
        ).rejects.toThrow(/network error/);
        expect(calls).toEqual(["PUT"]);
    });
});

describe("createClockifyClient retryPolicy nested-loop prevention (RETRY-001/P02-10)", () => {
    it("retries exactly retryPolicy.maxRetries+1 times, not the product of both retry layers", async () => {
        let calls = 0;
        const dispatch = vi.fn<typeof fetch>().mockImplementation(async () => {
            calls++;
            return new Response(null, { status: 503 });
        });
        const client = createClockifyClient({
            apiKey: "secret",
            fetch: dispatch,
            retryPolicy: { maxRetries: 2, initialDelayMs: 0, jitter: 0 },
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toBeDefined();
        // If the generated layer's own retry loop were still active alongside
        // the wrapper's composedFetch retry loop, this would multiply (e.g. 9
        // calls for 3 wrapper attempts x 3 generated attempts) instead of
        // summing to exactly maxRetries + 1.
        expect(calls).toBe(3);
    });

    it("passes maxRetries: 0 to the generated layer whenever retryPolicy is set, even retryPolicy: false", async () => {
        const dispatch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));
        const client = createClockifyClient({
            apiKey: "secret",
            fetch: dispatch,
            retryPolicy: false,
        });

        await expect(client.tags.list({ workspaceId: "workspace" })).rejects.toBeDefined();
        expect(dispatch).toHaveBeenCalledOnce();
    });
});
