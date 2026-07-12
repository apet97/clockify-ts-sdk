import { describe, expect, it, vi } from "vitest";

import { ClockifyApiClient, ClockifyApiTimeoutError } from "../index.js";

function client(fetchImpl: typeof fetch, environment = "https://api.clockify.me/api/v1") {
    return new ClockifyApiClient({ apiKey: "secret", environment, fetch: fetchImpl });
}

function requestFromFetchArgs(
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
): Request {
    if (input instanceof Request && init === undefined) return input;
    return new Request(input, init);
}

function dispatchedRequest(dispatch: ReturnType<typeof vi.fn>, callIndex = 0): Request {
    const [input, init] = dispatch.mock.calls[callIndex] as Parameters<typeof fetch>;
    return requestFromFetchArgs(input, init);
}

type PromiseOutcome<T> =
    | { status: "fulfilled"; value: T }
    | { status: "rejected"; reason: unknown };

type Deferred<T> = {
    promise: Promise<T>;
    resolve(value: T): void;
};

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
        resolve = accept;
    });
    return { promise, resolve };
}

function observePromise<T>(promise: Promise<T>): Promise<PromiseOutcome<T>> {
    return promise.then(
        (value) => ({ status: "fulfilled", value }),
        (reason: unknown) => ({ status: "rejected", reason }),
    );
}

async function outcomeWithin<T>(
    outcome: Promise<PromiseOutcome<T>>,
    timeoutMs = 25,
): Promise<PromiseOutcome<T> | { status: "timed_out" }> {
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

async function withFakeTimers(run: () => Promise<void>): Promise<void> {
    vi.useFakeTimers();
    try {
        await run();
    } finally {
        vi.clearAllTimers();
        vi.useRealTimers();
    }
}

const RETRYABLE_RESPONSE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_RESPONSE_STATUSES = Array.from(
    { length: 400 },
    (_, index) => index + 200,
).filter((status) => !RETRYABLE_RESPONSE_STATUSES.has(status));
const SUPPORTED_NON_RETRYABLE_METHODS = [
    "POST",
    "PATCH",
    "ACL",
    "BASELINE-CONTROL",
    "BIND",
    "CHECKIN",
    "CHECKOUT",
    "COPY",
    "LABEL",
    "LINK",
    "LOCK",
    "MERGE",
    "MKACTIVITY",
    "MKCALENDAR",
    "MKCOL",
    "MKREDIRECTREF",
    "MKWORKSPACE",
    "MOVE",
    "ORDERPATCH",
    "PROPFIND",
    "PROPPATCH",
    "PURGE",
    "QUERY",
    "REBIND",
    "REPORT",
    "SEARCH",
    "UNBIND",
    "UNCHECKOUT",
    "UNLINK",
    "UNLOCK",
    "UPDATE",
    "UPDATEREDIRECTREF",
    "VERSION-CONTROL",
] as const;

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

    it("rejects a non-HTTP loopback base before authentication", async () => {
        const dispatch = vi.fn<typeof fetch>();
        const apiKey = vi.fn(() => "secret");
        const sdk = new ClockifyApiClient({
            apiKey,
            environment: "ftp://localhost/api/v1",
            fetch: dispatch,
        });

        await expect(sdk.fetch("users")).rejects.toThrow(/http.*https|scheme|protocol/i);
        expect(apiKey).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it.each(["base", "header", "auth"] as const)(
        "aborts a never-settling raw %s supplier immediately and never dispatches later",
        async (stage) => {
            const pending = deferred<string>();
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
            const sdk = new ClockifyApiClient({
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

            const outcome = observePromise(
                sdk.fetch("users", undefined, { abortSignal: controller.signal }),
            );
            while (entered.mock.calls.length === 0) await Promise.resolve();
            const reason = new Error(`abort raw ${stage} supplier`);
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

    it("removes an existing query key when its replacement array is empty", async () => {
        const dispatch = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status: 204 }));

        await client(dispatch).fetch("users?status=OLD&keep=yes", undefined, {
            queryParams: { status: [] },
        });

        const target = new URL(dispatchedRequest(dispatch).url);
        expect(target.searchParams.has("status")).toBe(false);
        expect(target.searchParams.get("keep")).toBe("yes");
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

    describe("retry, replay, and abort behavior", () => {
        it("retries a GET transport failure twice by default", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockRejectedValueOnce(new TypeError("first transport failure"))
                    .mockRejectedValueOnce(new TypeError("second transport failure"))
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                const outcome = observePromise(client(dispatch).fetch("users"));
                await vi.runAllTimersAsync();

                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                expect(dispatch).toHaveBeenCalledTimes(3);
            });
        });

        it("retries a GET retryable response twice by default", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                const outcome = observePromise(client(dispatch).fetch("users"));
                await vi.runAllTimersAsync();

                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                expect(dispatch).toHaveBeenCalledTimes(3);
            });
        });

        it("does not retry any Request-supported method outside the exact allowlist", async () => {
            await withFakeTimers(async () => {
                for (const method of SUPPORTED_NON_RETRYABLE_METHODS) {
                    expect(new Request("https://api.clockify.me", { method }).method).toBe(method);
                }

                const statusCases = SUPPORTED_NON_RETRYABLE_METHODS.map((method) => {
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockResolvedValueOnce(new Response(null, { status: 503 }))
                        .mockResolvedValueOnce(new Response(null, { status: 204 }));
                    return {
                        method,
                        dispatch,
                        outcome: observePromise(client(dispatch).fetch("users", { method })),
                    };
                });
                const transportCases = SUPPORTED_NON_RETRYABLE_METHODS.map((method) => {
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockRejectedValueOnce(new TypeError(`${method} transport failure`))
                        .mockResolvedValueOnce(new Response(null, { status: 204 }));
                    return {
                        method,
                        dispatch,
                        outcome: observePromise(client(dispatch).fetch("users", { method })),
                    };
                });

                await vi.runAllTimersAsync();

                for (const { method, dispatch, outcome } of statusCases) {
                    const settled = await outcome;
                    expect({
                        method,
                        outcome: settled.status,
                        responseStatus:
                            settled.status === "fulfilled" ? settled.value.status : undefined,
                        dispatches: dispatch.mock.calls.length,
                    }).toEqual({
                        method,
                        outcome: "fulfilled",
                        responseStatus: 503,
                        dispatches: 1,
                    });
                }
                for (const { method, dispatch, outcome } of transportCases) {
                    const settled = await outcome;
                    expect({
                        method,
                        outcome: settled.status,
                        dispatches: dispatch.mock.calls.length,
                    }).toEqual({ method, outcome: "rejected", dispatches: 1 });
                }
            });
        });

        it("lets per-call retries override a disabled client retry policy", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));
                const sdk = new ClockifyApiClient({
                    apiKey: "secret",
                    environment: "https://api.clockify.me/api/v1",
                    fetch: dispatch,
                    maxRetries: 0,
                });

                const outcome = observePromise(sdk.fetch("users", undefined, { maxRetries: 2 }));
                await vi.runAllTimersAsync();

                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                expect(dispatch).toHaveBeenCalledTimes(3);
            });
        });

        it("lets per-call zero retries override client retries", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));
                const sdk = new ClockifyApiClient({
                    apiKey: "secret",
                    environment: "https://api.clockify.me/api/v1",
                    fetch: dispatch,
                    maxRetries: 2,
                });

                const outcome = observePromise(sdk.fetch("users", undefined, { maxRetries: 0 }));
                await vi.runAllTimersAsync();

                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(503);
                expect(dispatch).toHaveBeenCalledOnce();
            });
        });

        it("uses client retries before the default retry count", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 503 }))
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));
                const sdk = new ClockifyApiClient({
                    apiKey: "secret",
                    environment: "https://api.clockify.me/api/v1",
                    fetch: dispatch,
                    maxRetries: 1,
                });

                const outcome = observePromise(sdk.fetch("users"));
                await vi.runAllTimersAsync();

                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(503);
                expect(dispatch).toHaveBeenCalledTimes(2);
            });
        });

        it("treats Retry-After: 0 as an immediate retry", async () => {
            await withFakeTimers(async () => {
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(
                        new Response(null, {
                            status: 429,
                            headers: { "Retry-After": "0" },
                        }),
                    )
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                let settled: PromiseOutcome<Response> | undefined;
                void observePromise(
                    client(dispatch).fetch("users", undefined, { maxRetries: 1 }),
                ).then((outcome) => {
                    settled = outcome;
                });
                await vi.advanceTimersByTimeAsync(0);

                expect(dispatch).toHaveBeenCalledTimes(2);
                expect(settled).toBeDefined();
                expect(settled?.status).toBe("fulfilled");
                expect(settled?.status === "fulfilled" && settled.value.status).toBe(204);
            });
        });

        it("waits until X-RateLimit-Reset before retrying", async () => {
            await withFakeTimers(async () => {
                vi.setSystemTime(new Date("2026-07-12T12:00:00.000Z"));
                const resetEpochSeconds = Math.floor(Date.now() / 1000) + 17;
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(
                        new Response(null, {
                            status: 429,
                            headers: { "X-RateLimit-Reset": String(resetEpochSeconds) },
                        }),
                    )
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                let settled: PromiseOutcome<Response> | undefined;
                void observePromise(
                    client(dispatch).fetch("users", undefined, { maxRetries: 1 }),
                ).then((outcome) => {
                    settled = outcome;
                });
                await vi.advanceTimersByTimeAsync(0);
                expect(dispatch).toHaveBeenCalledOnce();

                await vi.advanceTimersByTimeAsync(16_999);
                expect(dispatch).toHaveBeenCalledOnce();

                await vi.advanceTimersByTimeAsync(1);
                expect(dispatch).toHaveBeenCalledTimes(2);
                expect(settled).toBeDefined();
                expect(settled?.status).toBe("fulfilled");
                expect(settled?.status === "fulfilled" && settled.value.status).toBe(204);
            });
        });

        it("replays identical PUT body bytes with a fresh Request per attempt", async () => {
            await withFakeTimers(async () => {
                const inputs: Parameters<typeof fetch>[0][] = [];
                const inits: Array<Parameters<typeof fetch>[1]> = [];
                const bodies: Uint8Array[] = [];
                const dispatch = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
                    inputs.push(input);
                    inits.push(init);
                    if (input instanceof Request && init === undefined) {
                        bodies.push(new Uint8Array(await input.arrayBuffer()));
                    }
                    return new Response(null, { status: inputs.length < 3 ? 503 : 204 });
                });

                const outcome = observePromise(
                    client(dispatch).fetch("users", {
                        method: "PUT",
                        body: "same bytes on every attempt",
                    }),
                );
                await vi.runAllTimersAsync();

                const expectedBody = new TextEncoder().encode("same bytes on every attempt");
                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                expect(inputs).toHaveLength(3);
                expect(inputs.every((input) => input instanceof Request)).toBe(true);
                expect(inits).toEqual([undefined, undefined, undefined]);
                expect(bodies).toEqual([expectedBody, expectedBody, expectedBody]);
                expect(new Set(inputs).size).toBe(3);
            });
        });

        it("retries a valid cloneable PUT Request body", async () => {
            await withFakeTimers(async () => {
                const bodyText = "cloneable Request body";
                const input = new Request("https://api.clockify.me/api/v1/users", {
                    method: "PUT",
                    body: bodyText,
                    redirect: "manual",
                });
                const cloneProbe = input.clone();
                expect(await cloneProbe.text()).toBe(bodyText);
                expect(input.bodyUsed).toBe(false);

                const inputs: Parameters<typeof fetch>[0][] = [];
                const bodies: Uint8Array[] = [];
                const dispatch = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
                    inputs.push(request);
                    if (request instanceof Request && init === undefined) {
                        bodies.push(new Uint8Array(await request.arrayBuffer()));
                    }
                    return new Response(null, { status: inputs.length === 1 ? 503 : 204 });
                });

                const outcome = observePromise(
                    client(dispatch).fetch(input, undefined, { maxRetries: 1 }),
                );
                await vi.runAllTimersAsync();

                const expectedBody = new TextEncoder().encode(bodyText);
                const settled = await outcome;
                expect(settled.status).toBe("fulfilled");
                expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                expect(inputs).toHaveLength(2);
                expect(inputs.every((request) => request instanceof Request)).toBe(true);
                expect(new Set(inputs).size).toBe(2);
                expect(bodies).toEqual([expectedBody, expectedBody]);
            });
        });

        it.each(["used", "locked"] as const)(
            "replaces a %s original Request body before replay preflight",
            async (state) => {
                await withFakeTimers(async () => {
                    const input = new Request("https://api.clockify.me/api/v1/users", {
                        method: "PUT",
                        body: "stale original body",
                        redirect: "manual",
                    });
                    const reader = state === "locked" ? input.body?.getReader() : undefined;
                    if (state === "used") await input.text();

                    const requests: Request[] = [];
                    const bodies: string[] = [];
                    const dispatch = vi.fn<typeof fetch>().mockImplementation(async (request, init) => {
                        expect(request).toBeInstanceOf(Request);
                        expect(init).toBeUndefined();
                        const actual = request as Request;
                        requests.push(actual);
                        bodies.push(await actual.text());
                        return new Response(null, {
                            status: requests.length === 1 ? 503 : 204,
                        });
                    });

                    try {
                        const outcome = observePromise(
                            client(dispatch).fetch(
                                input,
                                { body: "fresh replacement body" },
                                { maxRetries: 1 },
                            ),
                        );
                        await vi.runAllTimersAsync();
                        const settled = await outcome;

                        expect(settled.status).toBe("fulfilled");
                        expect(requests).toHaveLength(2);
                        expect(new Set(requests).size).toBe(2);
                        expect(bodies).toEqual([
                            "fresh replacement body",
                            "fresh replacement body",
                        ]);
                    } finally {
                        reader?.releaseLock();
                    }
                });
            },
        );

        it("rejects a retryable used body before its first dispatch", async () => {
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(null, { status: 204 }));
            const input = new Request("https://api.clockify.me/api/v1/users", {
                method: "PUT",
                body: "already consumed",
                redirect: "manual",
            });
            await input.text();

            await expect(
                client(dispatch).fetch(input, undefined, { maxRetries: 1 }),
            ).rejects.toBeDefined();
            expect(dispatch).not.toHaveBeenCalled();
        });

        it("rejects a retryable locked body before its first dispatch", async () => {
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(null, { status: 204 }));
            const input = new Request("https://api.clockify.me/api/v1/users", {
                method: "PUT",
                body: "locked body",
                redirect: "manual",
            });
            const reader = input.body?.getReader();
            expect(reader).toBeDefined();

            try {
                await expect(
                    client(dispatch).fetch(input, undefined, { maxRetries: 1 }),
                ).rejects.toBeDefined();
                expect(dispatch).not.toHaveBeenCalled();
            } finally {
                reader?.releaseLock();
            }
        });

        it("rejects a non-replayable finalized retryable body before dispatch", async () => {
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValue(new Response(null, { status: 204 }));
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("stream body"));
                    controller.close();
                },
            });
            Object.defineProperty(stream, "tee", {
                value: () => {
                    throw new TypeError("body cannot be replayed");
                },
            });
            const input = new Request("https://api.clockify.me/api/v1/users", {
                method: "PUT",
                redirect: "manual",
            });

            await expect(
                client(dispatch).fetch(
                    input,
                    { body: stream, duplex: "half" } as RequestInit,
                    { maxRetries: 1 },
                ),
            ).rejects.toBeDefined();
            expect(dispatch).not.toHaveBeenCalled();
        });

        it("cancels a retryable response body before backoff", async () => {
            await withFakeTimers(async () => {
                let finishCancellation!: () => void;
                const cancellationFinished = new Promise<void>((resolve) => {
                    finishCancellation = resolve;
                });
                const cancelBody = vi.fn(() => cancellationFinished);
                const retryableResponse = new Response(
                    new ReadableStream<Uint8Array>({ cancel: cancelBody }),
                    {
                        status: 503,
                        headers: { "Retry-After": "5" },
                    },
                );
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(retryableResponse)
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                let settled: PromiseOutcome<Response> | undefined;
                void observePromise(
                    client(dispatch).fetch("users", undefined, { maxRetries: 1 }),
                ).then((outcome) => {
                    settled = outcome;
                });
                await vi.advanceTimersByTimeAsync(0);

                expect(dispatch).toHaveBeenCalledOnce();
                expect(cancelBody).toHaveBeenCalledOnce();

                await vi.advanceTimersByTimeAsync(5_000);
                expect(dispatch).toHaveBeenCalledOnce();

                finishCancellation();
                await vi.advanceTimersByTimeAsync(0);
                expect(dispatch).toHaveBeenCalledOnce();

                await vi.advanceTimersByTimeAsync(4_999);
                expect(dispatch).toHaveBeenCalledOnce();

                await vi.advanceTimersByTimeAsync(1);
                expect(dispatch).toHaveBeenCalledTimes(2);
                expect(settled).toBeDefined();
                expect(settled?.status).toBe("fulfilled");
                expect(settled?.status === "fulfilled" && settled.value.status).toBe(204);
            });
        });

        it("aborts immediately while raw retry-response cancellation is pending", async () => {
            const cancellation = deferred<void>();
            const cancel = vi.fn(() => cancellation.promise);
            const dispatch = vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(
                    new Response(new ReadableStream<Uint8Array>({ cancel }), {
                        status: 503,
                    }),
                )
                .mockResolvedValueOnce(new Response(null, { status: 204 }));
            const controller = new AbortController();
            const outcome = observePromise(
                client(dispatch).fetch("users", undefined, {
                    maxRetries: 1,
                    abortSignal: controller.signal,
                }),
            );
            while (cancel.mock.calls.length === 0) await Promise.resolve();

            const reason = new Error("abort pending raw response cancellation");
            controller.abort(reason);
            const raced = await outcomeWithin(outcome);
            cancellation.resolve();
            await outcome;
            await Promise.resolve();

            expect(raced).toEqual({ status: "rejected", reason });
            expect(dispatch).toHaveBeenCalledOnce();
        });

        it.each(["request options", "init", "input Request"] as const)(
            "rejects an already-aborted %s signal with zero dispatches",
            async (source) => {
                await withFakeTimers(async () => {
                    const reason = new Error(`${source} already aborted`);
                    const controller = new AbortController();
                    controller.abort(reason);
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockResolvedValue(new Response(null, { status: 204 }));
                    const sdk = client(dispatch);

                    const result =
                        source === "request options"
                            ? sdk.fetch("users", undefined, { abortSignal: controller.signal })
                            : source === "init"
                              ? sdk.fetch("users", { signal: controller.signal })
                              : sdk.fetch(
                                    new Request("https://api.clockify.me/api/v1/users", {
                                        signal: controller.signal,
                                        redirect: "manual",
                                    }),
                                );

                    await expect(result).rejects.toBe(reason);
                    expect(dispatch).not.toHaveBeenCalled();

                    await vi.runAllTimersAsync();
                    expect(dispatch).not.toHaveBeenCalled();
                });
            },
        );

        it("rejects immediately with the caller reason when aborted during backoff", async () => {
            await withFakeTimers(async () => {
                const controller = new AbortController();
                const dispatch = vi
                    .fn<typeof fetch>()
                    .mockResolvedValueOnce(
                        new Response(null, {
                            status: 503,
                            headers: { "Retry-After": "60" },
                        }),
                    )
                    .mockResolvedValueOnce(new Response(null, { status: 204 }));

                let settled: PromiseOutcome<Response> | undefined;
                void observePromise(
                    client(dispatch).fetch("users", undefined, {
                        maxRetries: 1,
                        abortSignal: controller.signal,
                    }),
                ).then((outcome) => {
                    settled = outcome;
                });
                await vi.advanceTimersByTimeAsync(0);
                expect(dispatch).toHaveBeenCalledOnce();

                const reason = new Error("caller stopped retry backoff");
                controller.abort(reason);
                await vi.advanceTimersByTimeAsync(0);

                expect(settled).toBeDefined();
                expect(settled?.status).toBe("rejected");
                expect(settled?.status === "rejected" && settled.reason).toBe(reason);
                expect(dispatch).toHaveBeenCalledOnce();

                await vi.runAllTimersAsync();
                expect(dispatch).toHaveBeenCalledOnce();
            });
        });

        it("preserves a primitive pre-abort reason by identity", async () => {
            const controller = new AbortController();
            controller.abort("primitive-stop");
            const dispatch = vi.fn<typeof fetch>();

            await expect(
                client(dispatch).fetch("users", undefined, {
                    abortSignal: controller.signal,
                }),
            ).rejects.toBe("primitive-stop");
            expect(dispatch).not.toHaveBeenCalled();
        });

        it.each(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"] as const)(
            "retries status failures for the default %s method",
            async (method) => {
                await withFakeTimers(async () => {
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockResolvedValueOnce(new Response(null, { status: 503 }))
                        .mockResolvedValueOnce(new Response(null, { status: 204 }));

                    const outcome = observePromise(
                        client(dispatch).fetch("users", { method }, { maxRetries: 1 }),
                    );
                    await vi.runAllTimersAsync();

                    const settled = await outcome;
                    expect(settled.status).toBe("fulfilled");
                    expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                    expect(dispatch).toHaveBeenCalledTimes(2);
                });
            },
        );

        it.each([408, 429, 500, 502, 503, 504])(
            "retries the default %i response status",
            async (status) => {
                await withFakeTimers(async () => {
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockResolvedValueOnce(new Response(null, { status }))
                        .mockResolvedValueOnce(new Response(null, { status: 204 }));

                    const outcome = observePromise(
                        client(dispatch).fetch("users", undefined, { maxRetries: 1 }),
                    );
                    await vi.runAllTimersAsync();

                    const settled = await outcome;
                    expect(settled.status).toBe("fulfilled");
                    expect(settled.status === "fulfilled" && settled.value.status).toBe(204);
                    expect(dispatch).toHaveBeenCalledTimes(2);
                });
            },
        );

        it("does not retry any response status outside the exact allowlist", async () => {
            await withFakeTimers(async () => {
                const cases = NON_RETRYABLE_RESPONSE_STATUSES.map((status) => {
                    const dispatch = vi
                        .fn<typeof fetch>()
                        .mockResolvedValueOnce(new Response(null, { status }))
                        .mockResolvedValueOnce(new Response(null, { status: 204 }));
                    return {
                        status,
                        dispatch,
                        outcome: observePromise(
                            client(dispatch).fetch("users", undefined, { maxRetries: 1 }),
                        ),
                    };
                });

                await vi.runAllTimersAsync();

                expect(cases).toHaveLength(394);
                for (const { status, dispatch, outcome } of cases) {
                    const settled = await outcome;
                    expect({
                        status,
                        outcome: settled.status,
                        responseStatus:
                            settled.status === "fulfilled" ? settled.value.status : undefined,
                        dispatches: dispatch.mock.calls.length,
                    }).toEqual({
                        status,
                        outcome: "fulfilled",
                        responseStatus: status,
                        dispatches: 1,
                    });
                }
            });
        });
    });

    it("lets a shorter per-call timeout override a longer client timeout", async () => {
        vi.useFakeTimers();
        try {
            const dispatch = vi.fn<typeof fetch>().mockImplementation(
                (input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        const signal = requestFromFetchArgs(input, init).signal;
                        const rejectFromSignal = () => {
                            expect(signal.reason).toBeInstanceOf(Error);
                            reject(signal.reason as Error);
                        };
                        if (signal.aborted) rejectFromSignal();
                        else
                            signal.addEventListener("abort", rejectFromSignal, {
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

            const result = sdk.fetch("users", undefined, {
                timeoutInSeconds: 0.01,
                maxRetries: 0,
            });
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

    it("keeps an SDK timeout as the winner when caller abort happens later", async () => {
        await withFakeTimers(async () => {
            const dispatch = vi.fn<typeof fetch>().mockImplementation(
                () =>
                    new Promise<Response>((resolve) => {
                        setTimeout(() => resolve(new Response(null, { status: 204 })), 30);
                    }),
            );
            const controller = new AbortController();
            const outcome = observePromise(
                client(dispatch).fetch("users", undefined, {
                    timeoutInSeconds: 0.01,
                    maxRetries: 0,
                    abortSignal: controller.signal,
                }),
            );
            let settled: PromiseOutcome<Response> | undefined;
            void outcome.then((value) => {
                settled = value;
            });

            await vi.advanceTimersByTimeAsync(10);
            expect(settled?.status).toBe("rejected");
            expect(settled?.status === "rejected" && settled.reason).toBeInstanceOf(
                ClockifyApiTimeoutError,
            );
            const laterCallerReason = new Error("caller aborted after timeout");
            controller.abort(laterCallerReason);
            await vi.advanceTimersByTimeAsync(20);
            await outcome;

            expect(settled?.status).toBe("rejected");
            expect(settled?.status === "rejected" && settled.reason).toBeInstanceOf(
                ClockifyApiTimeoutError,
            );
        });
    });

    it("keeps an SDK timeout when the transport synchronously triggers a later caller abort", async () => {
        await withFakeTimers(async () => {
            const controller = new AbortController();
            const laterCallerReason = new Error("transport triggered caller abort after timeout");
            const dispatch = vi.fn<typeof fetch>().mockImplementation(
                (input, init) =>
                    new Promise<Response>(() => {
                        requestFromFetchArgs(input, init).signal.addEventListener(
                            "abort",
                            () => controller.abort(laterCallerReason),
                            { once: true },
                        );
                    }),
            );
            const outcome = observePromise(
                client(dispatch).fetch("users", undefined, {
                    timeoutInSeconds: 0.01,
                    maxRetries: 0,
                    abortSignal: controller.signal,
                }),
            );

            await vi.advanceTimersByTimeAsync(10);
            const settled = await outcome;

            expect(settled.status).toBe("rejected");
            expect(settled.status === "rejected" && settled.reason).toBeInstanceOf(
                ClockifyApiTimeoutError,
            );
            expect(settled).not.toEqual({ status: "rejected", reason: laterCallerReason });
        });
    });

    it("keeps the exact caller reason when caller abort wins before SDK timeout", async () => {
        await withFakeTimers(async () => {
            const dispatch = vi.fn<typeof fetch>().mockImplementation(
                () =>
                    new Promise<Response>((resolve) => {
                        setTimeout(() => resolve(new Response(null, { status: 204 })), 30);
                    }),
            );
            const controller = new AbortController();
            const outcome = observePromise(
                client(dispatch).fetch("users", undefined, {
                    timeoutInSeconds: 0.02,
                    maxRetries: 0,
                    abortSignal: controller.signal,
                }),
            );
            let settled: PromiseOutcome<Response> | undefined;
            void outcome.then((value) => {
                settled = value;
            });

            const callerReason = new Error("caller aborted first");
            await vi.advanceTimersByTimeAsync(10);
            controller.abort(callerReason);
            await vi.advanceTimersByTimeAsync(0);
            expect(settled).toEqual({ status: "rejected", reason: callerReason });
            await vi.advanceTimersByTimeAsync(20);
            await outcome;

            expect(settled).toEqual({ status: "rejected", reason: callerReason });
        });
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
