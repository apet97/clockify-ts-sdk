import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createCurrentUserIdMemo, loadContext } from "../src/client.js";
import { ConfirmationTokenStore } from "../src/orchestration/confirmation.js";
import {
    currentRequestSignal,
    requestSignalFetch,
    withRequestSignal,
} from "../src/request-cancellation.js";
import { defineGuardedTool, defineTool, successResult } from "../src/result.js";
import { buildServer } from "../src/server.js";

type RegisteredHandler = (
    args: Record<string, unknown>,
    extra: unknown,
) => CallToolResult | Promise<CallToolResult>;

const TEST_ENV = {
    CLOCKIFY_API_KEY: "test-key",
    CLOCKIFY_WORKSPACE_ID: "ws-1",
    CLOCKIFY_BASE_URL: "http://127.0.0.1:19091/api/v1",
};

function jsonResponse(data: unknown): Response {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

function abortError(signal: AbortSignal | undefined): Error {
    if (signal?.reason instanceof Error) return signal.reason;
    const error = new Error("The operation was aborted", { cause: signal?.reason });
    error.name = "AbortError";
    return error;
}

function capturedTool(
    name: "clockify_projects_get" | "clockify_projects_create",
    handler: () => Promise<CallToolResult>,
): RegisteredHandler {
    let captured: RegisteredHandler | undefined;
    const server = {
        registerTool: (_name: string, _config: unknown, callback: RegisteredHandler) => {
            captured = callback;
        },
    } as unknown as McpServer;
    defineTool(server, name, { title: "test", description: "test" }, handler);
    if (captured === undefined) throw new Error("tool was not registered");
    return captured;
}

function envelope(result: unknown): Record<string, unknown> {
    const content = (result as { content: Array<{ text: string }> }).content;
    return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("MCP request cancellation", () => {
    it.each([
        { kind: "read" as const, method: "GET" },
        { kind: "write" as const, method: "POST" },
    ])("propagates the handler signal to an ordinary $kind fetch", async ({ kind, method }) => {
        let dispatchedSignal: AbortSignal | undefined;
        let dispatchedMethod: string | undefined;
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            dispatchedSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            dispatchedMethod = init?.method ?? (input instanceof Request ? input.method : "GET");
            return jsonResponse({ id: "p-1", name: "Project" });
        });
        const ctx = loadContext(TEST_ENV, { fetch: dispatch });
        const name = kind === "read" ? "clockify_projects_get" : "clockify_projects_create";
        const run = capturedTool(name, async () => {
            const data =
                kind === "read"
                    ? await ctx.client.projects.get({ workspaceId: "ws-1", projectId: "p-1" })
                    : await ctx.client.projects.create({ workspaceId: "ws-1", name: "Project" });
            return successResult(name, data);
        });
        const controller = new AbortController();

        const result = await run({}, { signal: controller.signal });

        expect(envelope(result).ok).toBe(true);
        expect(dispatch).toHaveBeenCalledOnce();
        expect(dispatchedMethod).toBe(method);
        expect(dispatchedSignal?.aborted).toBe(false);
        controller.abort();
        expect(dispatchedSignal?.aborted).toBe(true);
    });

    it("does not dispatch an already-aborted request", async () => {
        const dispatch = vi.fn<typeof fetch>(async () => jsonResponse({ id: "p-1" }));
        const ctx = loadContext(TEST_ENV, { fetch: dispatch });
        const entered = vi.fn();
        const run = capturedTool("clockify_projects_create", async () => {
            entered();
            const data = await ctx.client.projects.create({
                workspaceId: "ws-1",
                name: "Project",
            });
            return successResult("clockify_projects_create", data);
        });
        const controller = new AbortController();
        controller.abort("cancelled before dispatch");

        const result = await run({}, { signal: controller.signal });

        expect(entered).not.toHaveBeenCalled();
        expect(dispatch).not.toHaveBeenCalled();
        expect(envelope(result)).toMatchObject({
            ok: false,
            error: { code: "aborted" },
        });
    });

    it("does not consume a confirmation token when the request was already aborted", async () => {
        let captured: RegisteredHandler | undefined;
        const server = {
            registerTool: (_name: string, _config: unknown, callback: RegisteredHandler) => {
                captured = callback;
            },
        } as unknown as McpServer;
        const execute = vi.fn(async () =>
            successResult("clockify_tags_delete", { deleted: true }),
        );
        defineGuardedTool(
            server,
            {
                workspaceId: "ws-1",
                client: {} as never,
                confirmationTokens: new ConfirmationTokenStore(),
            },
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Delete a tag.",
                inputSchema: { tagId: z.string() },
            },
            {
                preview: async (args) => ({ tagId: args.tagId }),
                execute,
            },
        );
        if (captured === undefined) throw new Error("guarded tool was not registered");
        const active = new AbortController();
        const dryRun = await captured(
            { tagId: "tag-1", dry_run: true },
            { signal: active.signal },
        );
        const token = (envelope(dryRun).data as { confirm_token?: unknown }).confirm_token;
        expect(typeof token).toBe("string");

        const cancelled = new AbortController();
        cancelled.abort("cancelled before execution");
        const rejected = await captured(
            { tagId: "tag-1", confirm_token: token },
            { signal: cancelled.signal },
        );
        expect(envelope(rejected)).toMatchObject({
            ok: false,
            error: { code: "aborted" },
        });
        expect(execute).not.toHaveBeenCalled();

        const retried = await captured(
            { tagId: "tag-1", confirm_token: token },
            { signal: active.signal },
        );
        expect(envelope(retried)).toMatchObject({ ok: true });
        expect(execute).toHaveBeenCalledOnce();
    });

    it("keeps an existing fetch signal active alongside the MCP request signal", async () => {
        let dispatchedSignal: AbortSignal | undefined;
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            dispatchedSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            return await new Promise<Response>((_resolve, reject) => {
                dispatchedSignal?.addEventListener(
                    "abort",
                    () => reject(abortError(dispatchedSignal)),
                    { once: true },
                );
            });
        });
        const fetchWithCancellation = requestSignalFetch(dispatch);
        const requestController = new AbortController();
        const existingController = new AbortController();

        const pending = withRequestSignal({ signal: requestController.signal }, () =>
            fetchWithCancellation("http://127.0.0.1/resource", {
                signal: existingController.signal,
            }),
        );
        existingController.abort();

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(requestController.signal.aborted).toBe(false);
        expect(dispatchedSignal?.aborted).toBe(true);
    });

    it("inherits a Request signal when init.signal is explicitly undefined", async () => {
        let dispatchedSignal: AbortSignal | undefined;
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            dispatchedSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            return await new Promise<Response>((_resolve, reject) => {
                dispatchedSignal?.addEventListener(
                    "abort",
                    () => reject(abortError(dispatchedSignal)),
                    { once: true },
                );
            });
        });
        const fetchWithCancellation = requestSignalFetch(dispatch);
        const requestController = new AbortController();
        const inputController = new AbortController();
        const input = new Request("http://127.0.0.1/resource", {
            signal: inputController.signal,
        });

        const pending = withRequestSignal({ signal: requestController.signal }, () =>
            fetchWithCancellation(input, { signal: undefined } as unknown as RequestInit),
        );
        inputController.abort("input cancelled");

        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(requestController.signal.aborted).toBe(false);
        expect(dispatchedSignal?.aborted).toBe(true);
    });

    it("removes its request listener after dispatch settles", async () => {
        const controller = new AbortController();
        const add = vi.spyOn(controller.signal, "addEventListener");
        const remove = vi.spyOn(controller.signal, "removeEventListener");
        const fetchWithCancellation = requestSignalFetch(async () => jsonResponse({ ok: true }));

        await withRequestSignal({ signal: controller.signal }, () =>
            fetchWithCancellation("http://127.0.0.1/resource"),
        );

        const abortListener = add.mock.calls.find(([type]) => type === "abort")?.[1];
        expect(abortListener).toBeDefined();
        expect(remove).toHaveBeenCalledWith("abort", abortListener);
    });

    it("normalizes string cancellation and does not retry an in-flight GET", async () => {
        let startedResolve: (() => void) | undefined;
        const started = new Promise<void>((resolve) => {
            startedResolve = resolve;
        });
        let attempts = 0;
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
            startedResolve?.();
            return await new Promise<Response>((_resolve, reject) => {
                signal?.addEventListener("abort", () => reject(abortError(signal)), { once: true });
            });
        });
        const ctx = loadContext(TEST_ENV, {
            fetch: dispatch,
            hooks: { beforeRequest: () => void (attempts += 1) },
        });
        const run = capturedTool("clockify_projects_get", async () => {
            const data = await ctx.client.projects.get({
                workspaceId: "ws-1",
                projectId: "p-1",
            });
            return successResult("clockify_projects_get", data);
        });
        const controller = new AbortController();

        const pending = run({}, { signal: controller.signal });
        await started;
        controller.abort("caller stopped");
        const result = await pending;

        expect(envelope(result)).toMatchObject({
            ok: false,
            error: { code: "aborted" },
        });
        expect(attempts).toBe(1);
        expect(dispatch).toHaveBeenCalledOnce();
    });

    it("isolates concurrent request signals", async () => {
        const signals = new Map<string, AbortSignal>();
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const url = typeof input === "string" ? input : input.toString();
            const signal = init?.signal;
            if (signal) signals.set(url, signal);
            return await new Promise<Response>((resolve, reject) => {
                signal?.addEventListener("abort", () => reject(abortError(signal)), { once: true });
                if (url.endsWith("/b")) resolve(jsonResponse({ ok: true }));
            });
        });
        const fetchWithCancellation = requestSignalFetch(dispatch);
        const first = new AbortController();
        const second = new AbortController();

        const firstCall = withRequestSignal({ signal: first.signal }, () =>
            fetchWithCancellation("http://127.0.0.1/a"),
        );
        const secondCall = withRequestSignal({ signal: second.signal }, () =>
            fetchWithCancellation("http://127.0.0.1/b"),
        );
        first.abort();

        await expect(firstCall).rejects.toMatchObject({ name: "AbortError" });
        await expect(secondCall).resolves.toBeInstanceOf(Response);
        expect(signals.get("http://127.0.0.1/a")?.aborted).toBe(true);
        expect(signals.get("http://127.0.0.1/b")?.aborted).toBe(false);
    });

    it("does not share an abort-sensitive current-user lookup across requests", async () => {
        const first = new AbortController();
        const second = new AbortController();
        const memo = createCurrentUserIdMemo({
            users: {
                getCurrentUser: async () => {
                    const signal = currentRequestSignal();
                    if (signal === first.signal) {
                        return await new Promise<never>((_resolve, reject) => {
                            signal.addEventListener(
                                "abort",
                                () => reject(abortError(signal)),
                                { once: true },
                            );
                        });
                    }
                    return { id: "user-2" };
                },
            },
        } as never);

        const firstLookup = withRequestSignal({ signal: first.signal }, memo);
        const secondLookup = withRequestSignal({ signal: second.signal }, memo);
        first.abort();

        await expect(firstLookup).rejects.toMatchObject({ name: "AbortError" });
        await expect(secondLookup).resolves.toBe("user-2");
        await expect(withRequestSignal({ signal: second.signal }, memo)).resolves.toBe("user-2");
    });

    it("stops a confirmed archive-then-delete after cancellation and consumes its token", async () => {
        const calls: string[] = [];
        let archiveStartedResolve: (() => void) | undefined;
        const archiveStarted = new Promise<void>((resolve) => {
            archiveStartedResolve = resolve;
        });
        let archiveAbortedResolve: (() => void) | undefined;
        const archiveAborted = new Promise<void>((resolve) => {
            archiveAbortedResolve = resolve;
        });
        const dispatch = vi.fn<typeof fetch>(async (input, init) => {
            const method = init?.method ?? (input instanceof Request ? input.method : "GET");
            calls.push(method);
            if (method === "GET") {
                return jsonResponse({
                    id: "p-1",
                    name: "Project",
                    billable: true,
                    public: true,
                });
            }
            if (method === "PUT") {
                const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
                archiveStartedResolve?.();
                return await new Promise<Response>((_resolve, reject) => {
                    const abort = () => {
                        archiveAbortedResolve?.();
                        reject(abortError(signal));
                    };
                    if (signal?.aborted) abort();
                    else signal?.addEventListener("abort", abort, { once: true });
                });
            }
            return jsonResponse({});
        });
        const ctx = loadContext(TEST_ENV, { fetch: dispatch });
        const server = buildServer(ctx);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "cancellation-test", version: "0.0.0" });
        await client.connect(clientTransport);

        try {
            const dryRun = await client.callTool({
                name: "clockify_projects_delete",
                arguments: { projectId: "p-1", dry_run: true },
            });
            const token = (
                envelope(dryRun).data as { confirm_token?: string } | undefined
            )?.confirm_token;
            expect(token).toBeTruthy();

            const controller = new AbortController();
            const confirmed = client.callTool(
                {
                    name: "clockify_projects_delete",
                    arguments: { projectId: "p-1", confirm_token: token },
                },
                undefined,
                { signal: controller.signal },
            );
            await archiveStarted;
            controller.abort();

            await expect(confirmed).rejects.toThrow(/AbortError/);
            await archiveAborted;
            await new Promise<void>((resolve) => setImmediate(resolve));
            expect(calls).toEqual(["GET", "PUT"]);

            const retry = await client.callTool({
                name: "clockify_projects_delete",
                arguments: { projectId: "p-1", confirm_token: token },
            });
            expect(envelope(retry)).toMatchObject({ ok: false });
            expect(calls).toEqual(["GET", "PUT"]);
        } finally {
            await client.close();
            await server.close();
        }
    });
});
