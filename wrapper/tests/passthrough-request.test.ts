import { describe, expect, it, vi } from "vitest";

import { ClockifyApiClient } from "../index.js";

function client(fetchImpl: typeof fetch, environment = "https://api.clockify.me/api/v1") {
    return new ClockifyApiClient({ apiKey: "secret", environment, fetch: fetchImpl });
}

function dispatchedRequest(dispatch: ReturnType<typeof vi.fn>, callIndex = 0): Request {
    const [input, init] = dispatch.mock.calls[callIndex] as Parameters<typeof fetch>;
    return new Request(input, init);
}

function governedInputRequest(signal = new AbortController().signal): Request {
    return new Request("https://api.clockify.me/api/v1/user", {
        method: "POST",
        body: "input-body",
        signal,
        redirect: "error",
        cache: "reload",
        credentials: "omit",
        integrity: "sha256-input",
        keepalive: true,
        referrer: "https://api.clockify.me/input-referrer",
        referrerPolicy: "no-referrer",
        mode: "cors",
    });
}

describe("ClockifyApiClient.fetch", () => {
    it.each([
        "https://attacker.example/collect",
        new URL("https://attacker.example/collect"),
        new Request("https://attacker.example/collect"),
    ])("rejects an authenticated cross-origin destination before dispatch: %s", async (input) => {
        const dispatch = vi.fn<typeof fetch>();
        const apiKey = vi.fn(() => "secret");
        const sdk = new ClockifyApiClient({
            apiKey,
            environment: "https://api.clockify.me/api/v1",
            fetch: dispatch,
        });

        await expect(sdk.fetch(input)).rejects.toThrow(/cross-origin/i);
        expect(apiKey).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it.each([
        ["relative string", "workspaces/me", "https://api.clockify.me/api/v1/workspaces/me"],
        [
            "absolute string",
            "https://api.clockify.me/api/v1/workspaces/me",
            "https://api.clockify.me/api/v1/workspaces/me",
        ],
        [
            "URL",
            new URL("https://api.clockify.me/api/v1/workspaces/me"),
            "https://api.clockify.me/api/v1/workspaces/me",
        ],
        [
            "Request",
            new Request("https://api.clockify.me/api/v1/workspaces/me", {
                redirect: "manual",
            }),
            "https://api.clockify.me/api/v1/workspaces/me",
        ],
    ])("accepts a same-origin %s target", async (_kind, input, expectedUrl) => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(input);

        expect(dispatchedRequest(dispatch).url).toBe(expectedUrl);
    });

    it.each([
        ["literal", "https://api.clockify.me/custom/v1"],
        ["Promise", Promise.resolve("https://api.clockify.me/custom/v1")],
        ["function", () => "https://api.clockify.me/custom/v1"],
    ])("resolves and validates a %s base URL supplier", async (_kind, baseUrl) => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const sdk = new ClockifyApiClient({
            apiKey: "secret",
            baseUrl,
            environment: "https://api.clockify.me/ignored/v1",
            fetch: dispatch,
        });

        await sdk.fetch("users");

        expect(dispatchedRequest(dispatch).url).toBe("https://api.clockify.me/custom/v1/users");
    });

    it.each([
        ["literal", "https://attacker.example/api/v1"],
        ["Promise", Promise.resolve("https://attacker.example/api/v1")],
        ["function", () => "https://attacker.example/api/v1"],
    ])(
        "rejects an invalid %s base URL supplier before auth or dispatch",
        async (_kind, baseUrl) => {
            const dispatch = vi.fn<typeof fetch>();
            const apiKey = vi.fn(() => "secret");
            const sdk = new ClockifyApiClient({ apiKey, baseUrl, fetch: dispatch });

            await expect(sdk.fetch("users")).rejects.toThrow(/not an allowlisted Clockify host/i);
            expect(apiKey).not.toHaveBeenCalled();
            expect(dispatch).not.toHaveBeenCalled();
        },
    );

    it("falls through an undefined base URL supplier to the environment", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const runtimeInvalidBaseUrl = (async () => undefined) as unknown as NonNullable<
            ClockifyApiClient.Options["baseUrl"]
        >;
        const sdk = new ClockifyApiClient({
            apiKey: "secret",
            baseUrl: runtimeInvalidBaseUrl,
            environment: "https://api.clockify.me/environment/v1",
            fetch: dispatch,
        });

        await sdk.fetch("users");

        expect(dispatchedRequest(dispatch).url).toBe(
            "https://api.clockify.me/environment/v1/users",
        );
    });

    it("uses the default environment when no base supplier is configured", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const sdk = new ClockifyApiClient({ apiKey: "secret", fetch: dispatch });

        await sdk.fetch("users");

        expect(dispatchedRequest(dispatch).url).toBe("https://api.clockify.me/api/v1/users");
    });

    it("preserves the input Request method", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(governedInputRequest());

        expect(dispatchedRequest(dispatch).method).toBe("POST");
    });

    it("preserves the input Request body", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(governedInputRequest());

        expect(await dispatchedRequest(dispatch).text()).toBe("input-body");
    });

    it("preserves the input Request signal", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const inputAbort = new AbortController();

        await client(dispatch).fetch(governedInputRequest(inputAbort.signal));

        const sent = dispatchedRequest(dispatch);
        expect(sent.signal.aborted).toBe(false);
        const reason = new Error("input aborted");
        inputAbort.abort(reason);
        expect(sent.signal.aborted).toBe(true);
        expect(sent.signal.reason).toBe(reason);
    });

    it("preserves input Request redirect, cache, credentials, and mode", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(governedInputRequest());

        const sent = dispatchedRequest(dispatch);
        expect({
            redirect: sent.redirect,
            cache: sent.cache,
            credentials: sent.credentials,
            mode: sent.mode,
        }).toEqual({
            redirect: "error",
            cache: "reload",
            credentials: "omit",
            mode: "cors",
        });
    });

    it("preserves input Request integrity and keepalive", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(governedInputRequest());

        const sent = dispatchedRequest(dispatch);
        expect({ integrity: sent.integrity, keepalive: sent.keepalive }).toEqual({
            integrity: "sha256-input",
            keepalive: true,
        });
    });

    it("preserves input Request referrer and referrerPolicy", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch(governedInputRequest());

        const sent = dispatchedRequest(dispatch);
        expect({ referrer: sent.referrer, referrerPolicy: sent.referrerPolicy }).toEqual({
            referrer: "https://api.clockify.me/input-referrer",
            referrerPolicy: "no-referrer",
        });
    });

    it("applies init overrides over every preserved input Request property", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const inputAbort = new AbortController();
        const initAbort = new AbortController();
        const input = new Request("https://api.clockify.me/api/v1/user", {
            method: "POST",
            body: "input-body",
            signal: inputAbort.signal,
            redirect: "follow",
            cache: "reload",
            credentials: "omit",
            integrity: "sha256-input",
            keepalive: true,
            referrer: "https://api.clockify.me/input-referrer",
            referrerPolicy: "no-referrer",
            mode: "cors",
        });

        await client(dispatch).fetch(input, {
            method: "PUT",
            body: "init-body",
            signal: initAbort.signal,
            redirect: "manual",
            cache: "no-store",
            credentials: "include",
            integrity: "sha256-init",
            keepalive: false,
            referrer: "https://api.clockify.me/init-referrer",
            referrerPolicy: "origin",
            mode: "same-origin",
        });

        const sent = dispatchedRequest(dispatch);
        expect({
            method: sent.method,
            redirect: sent.redirect,
            cache: sent.cache,
            credentials: sent.credentials,
            integrity: sent.integrity,
            keepalive: sent.keepalive,
            referrer: sent.referrer,
            referrerPolicy: sent.referrerPolicy,
            mode: sent.mode,
        }).toEqual({
            method: "PUT",
            redirect: "manual",
            cache: "no-store",
            credentials: "include",
            integrity: "sha256-init",
            keepalive: false,
            referrer: "https://api.clockify.me/init-referrer",
            referrerPolicy: "origin",
            mode: "same-origin",
        });
        expect(await sent.text()).toBe("init-body");
        inputAbort.abort(new Error("lower-precedence input abort"));
        expect(sent.signal.aborted).toBe(false);
        const reason = new Error("init aborted");
        initAbort.abort(reason);
        expect(sent.signal.aborted).toBe(true);
        expect(sent.signal.reason).toBe(reason);
    });

    it("merges header collisions in input, client, init, request-option, auth order", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const sdk = new ClockifyApiClient({
            apiKey: "secret",
            environment: "https://api.clockify.me/api/v1",
            fetch: dispatch,
            headers: {
                "X-Client-Wins": "client",
                "X-Init-Wins": "client",
                "X-Options-Wins": "client",
                "X-Client-Only": "client",
                "X-Api-Key": "client-attacker",
            },
        });

        await sdk.fetch(
            new Request("https://api.clockify.me/api/v1/user", {
                redirect: "manual",
                headers: {
                    "X-Client-Wins": "input",
                    "X-Init-Wins": "input",
                    "X-Options-Wins": "input",
                    "X-Input-Only": "input",
                    "X-Api-Key": "input-attacker",
                },
            }),
            {
                headers: {
                    "X-Init-Wins": "init",
                    "X-Options-Wins": "init",
                    "X-Init-Only": "init",
                    "X-Api-Key": "init-attacker",
                },
            },
            {
                headers: {
                    "X-Options-Wins": "options",
                    "X-Options-Only": "options",
                    "X-Api-Key": "options-attacker",
                },
            },
        );

        const headers = dispatchedRequest(dispatch).headers;
        expect(headers.get("X-Input-Only")).toBe("input");
        expect(headers.get("X-Client-Only")).toBe("client");
        expect(headers.get("X-Init-Only")).toBe("init");
        expect(headers.get("X-Options-Only")).toBe("options");
        expect(headers.get("X-Client-Wins")).toBe("client");
        expect(headers.get("X-Init-Wins")).toBe("init");
        expect(headers.get("X-Options-Wins")).toBe("options");
        expect(headers.get("X-Api-Key")).toBe("secret");
    });

    it("replaces existing query scalars and arrays with ordered repeated values", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch("users?page=old&status=OLD&status=STALE&keep=yes", undefined, {
            queryParams: { page: 2, status: ["ACTIVE", "PENDING"], omitted: undefined },
        });

        const target = new URL(dispatchedRequest(dispatch).url);
        expect(target.searchParams.getAll("page")).toEqual(["2"]);
        expect(target.searchParams.getAll("status")).toEqual(["ACTIVE", "PENDING"]);
        expect(target.searchParams.get("keep")).toBe("yes");
        expect(target.searchParams.has("omitted")).toBe(false);
    });

    it("prefers the request-options signal over init and input Request signals", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const inputAbort = new AbortController();
        const initAbort = new AbortController();
        const optionsAbort = new AbortController();

        await client(dispatch).fetch(
            new Request("https://api.clockify.me/api/v1/users", {
                signal: inputAbort.signal,
                redirect: "manual",
            }),
            { signal: initAbort.signal },
            { abortSignal: optionsAbort.signal },
        );

        const sent = dispatchedRequest(dispatch);
        inputAbort.abort(new Error("input aborted"));
        initAbort.abort(new Error("init aborted"));
        expect(sent.signal.aborted).toBe(false);
        const reason = new Error("request options aborted");
        optionsAbort.abort(reason);
        expect(sent.signal.aborted).toBe(true);
        expect(sent.signal.reason).toBe(reason);
    });

    it("prefers the init signal over the input Request signal", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const inputAbort = new AbortController();
        const initAbort = new AbortController();

        await client(dispatch).fetch(
            new Request("https://api.clockify.me/api/v1/users", {
                signal: inputAbort.signal,
                redirect: "manual",
            }),
            { signal: initAbort.signal },
        );

        const sent = dispatchedRequest(dispatch);
        inputAbort.abort(new Error("input aborted"));
        expect(sent.signal.aborted).toBe(false);
        const reason = new Error("init aborted");
        initAbort.abort(reason);
        expect(sent.signal.aborted).toBe(true);
        expect(sent.signal.reason).toBe(reason);
    });

    it("uses the input Request signal when no higher-precedence signal exists", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));
        const inputAbort = new AbortController();

        await client(dispatch).fetch(
            new Request("https://api.clockify.me/api/v1/users", {
                signal: inputAbort.signal,
                redirect: "manual",
            }),
        );

        const sent = dispatchedRequest(dispatch);
        const reason = new Error("input aborted");
        inputAbort.abort(reason);
        expect(sent.signal.aborted).toBe(true);
        expect(sent.signal.reason).toBe(reason);
    });

    it("defaults authenticated passthrough requests to manual redirects", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch("users");

        expect(dispatchedRequest(dispatch).redirect).toBe("manual");
    });

    it.each([
        ["init", (sdk: ClockifyApiClient) => sdk.fetch("users", { redirect: "follow" })],
        [
            "input Request",
            (sdk: ClockifyApiClient) =>
                sdk.fetch(
                    new Request("https://api.clockify.me/api/v1/users", {
                        redirect: "follow",
                    }),
                ),
        ],
    ])("rejects an explicit redirect: follow from %s before dispatch", async (_source, invoke) => {
        const dispatch = vi.fn<typeof fetch>();

        await expect(invoke(client(dispatch))).rejects.toThrow(
            /redirect.*follow|follow.*redirect/i,
        );
        expect(dispatch).not.toHaveBeenCalled();
    });

    describe.each(["client", "request options"] as const)("%s numeric validation", (source) => {
        it.each([
            ["negative", -1],
            ["fractional", 0.5],
            ["NaN", Number.NaN],
            ["infinite", Number.POSITIVE_INFINITY],
        ])("rejects a %s maxRetries before dispatch", async (_kind, maxRetries) => {
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(null, { status: 204 }));
            const sdk = new ClockifyApiClient({
                apiKey: "secret",
                environment: "https://api.clockify.me/api/v1",
                fetch: dispatch,
                ...(source === "client" ? { maxRetries } : {}),
            });

            await expect(
                sdk.fetch(
                    "users",
                    undefined,
                    source === "request options" ? { maxRetries } : undefined,
                ),
            ).rejects.toThrow(/maxRetries/i);
            expect(dispatch).not.toHaveBeenCalled();
        });

        it.each([
            ["zero", 0],
            ["negative", -1],
            ["NaN", Number.NaN],
            ["infinite", Number.POSITIVE_INFINITY],
        ])("rejects a %s timeout before dispatch", async (_kind, timeoutInSeconds) => {
            vi.useFakeTimers();
            try {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValue(new Response(null, { status: 204 }));
                const sdk = new ClockifyApiClient({
                    apiKey: "secret",
                    environment: "https://api.clockify.me/api/v1",
                    fetch: dispatch,
                    ...(source === "client" ? { timeoutInSeconds } : {}),
                });

                await expect(
                    sdk.fetch(
                        "users",
                        undefined,
                        source === "request options" ? { timeoutInSeconds } : undefined,
                    ),
                ).rejects.toThrow(/timeout/i);
                expect(dispatch).not.toHaveBeenCalled();
            } finally {
                vi.clearAllTimers();
                vi.useRealTimers();
            }
        });
    });

    it.each(["client", "request options"] as const)(
        "accepts zero maxRetries from %s as the valid lower boundary",
        async (source) => {
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(null, { status: 204 }));
            const sdk = new ClockifyApiClient({
                apiKey: "secret",
                environment: "https://api.clockify.me/api/v1",
                fetch: dispatch,
                ...(source === "client" ? { maxRetries: 0 } : {}),
            });

            await sdk.fetch(
                "users",
                undefined,
                source === "request options" ? { maxRetries: 0 } : undefined,
            );

            expect(dispatch).toHaveBeenCalledOnce();
        },
    );

    it("lets a shorter per-call timeout override a longer client timeout", async () => {
        vi.useFakeTimers();
        try {
            const dispatch = vi.fn<typeof fetch>().mockImplementation(
                (_input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        const signal = init?.signal;
                        if (signal?.aborted) reject(signal.reason);
                        else
                            signal?.addEventListener("abort", () => reject(signal.reason), {
                                once: true,
                            });
                    }),
            );
            const sdk = new ClockifyApiClient({
                apiKey: "secret",
                environment: "https://api.clockify.me/api/v1",
                fetch: dispatch,
                timeoutInSeconds: 1,
            });

            const result = sdk.fetch("users", undefined, { timeoutInSeconds: 0.01 });
            const timedOut = expect(result).rejects.toThrow(/timed out/i);
            await vi.advanceTimersByTimeAsync(0);
            expect(dispatch).toHaveBeenCalledOnce();
            const sent = dispatchedRequest(dispatch);

            await vi.advanceTimersByTimeAsync(20);
            expect(sent.signal.aborted).toBe(true);
            await timedOut;
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("lets a longer per-call timeout override a shorter client timeout", async () => {
        vi.useFakeTimers();
        try {
            let resolveDispatch!: (response: Response) => void;
            const pendingResponse = new Promise<Response>((resolve) => {
                resolveDispatch = resolve;
            });
            const dispatch = vi.fn<typeof fetch>().mockImplementation(() => pendingResponse);
            const sdk = new ClockifyApiClient({
                apiKey: "secret",
                environment: "https://api.clockify.me/api/v1",
                fetch: dispatch,
                timeoutInSeconds: 0.01,
            });

            const result = sdk.fetch("users", undefined, { timeoutInSeconds: 1 });
            await vi.advanceTimersByTimeAsync(0);
            expect(dispatch).toHaveBeenCalledOnce();
            const sent = dispatchedRequest(dispatch);

            await vi.advanceTimersByTimeAsync(20);
            expect(sent.signal.aborted).toBe(false);

            resolveDispatch(new Response(null, { status: 204 }));
            await expect(result).resolves.toHaveProperty("status", 204);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    it("validates a Promise base URL before dispatch", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const sdk = new ClockifyApiClient({
            apiKey: "secret",
            environment: Promise.resolve("https://attacker.example/api/v1"),
            fetch: dispatch,
        });

        await expect(sdk.fetch("users")).rejects.toThrow(/not an allowlisted Clockify host/i);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
