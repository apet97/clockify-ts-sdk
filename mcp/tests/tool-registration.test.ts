import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { Context } from "../src/client.js";
import { ConfirmationTokenStore } from "../src/orchestration/confirmation.js";
import {
    CONFIRMATION_META_KEY,
    defineGuardedTool,
    defineTool,
    RISK_META_KEY,
    successResult,
} from "../src/result.js";

type Handler = (
    args: Record<string, unknown>,
    extra: unknown,
) => CallToolResult | Promise<CallToolResult>;

interface CapturedRegistration {
    name: string;
    config: {
        inputSchema?: Record<string, unknown>;
        annotations?: Record<string, unknown>;
        _meta?: Record<string, unknown>;
        outputSchema?: unknown;
    };
    handler: Handler;
}

function captureServer(): { server: McpServer; registrations: CapturedRegistration[] } {
    const registrations: CapturedRegistration[] = [];
    const server = {
        registerTool: (name: string, config: CapturedRegistration["config"], handler: Handler) => {
            registrations.push({ name, config, handler });
        },
    } as unknown as McpServer;
    return { server, registrations };
}

function context(store = new ConfirmationTokenStore()): Context {
    return {
        workspaceId: "000000000000000000000900",
        client: {} as Context["client"],
        confirmationTokens: store,
    };
}

function envelope(result: CallToolResult): Record<string, unknown> {
    return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

describe("central MCP tool registration", () => {
    it("derives read metadata and annotations without accepting raw overrides", () => {
        const { server, registrations } = captureServer();

        defineTool(
            server,
            "clockify_tags_list",
            {
                title: "List tags",
                description: "List tags in the pinned Clockify workspace.",
                inputSchema: { page: z.number().optional() },
            },
            async () => successResult("clockify_tags_list", []),
        );

        expect(registrations).toHaveLength(1);
        expect(registrations[0]?.config).toMatchObject({
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: {
                [RISK_META_KEY]: "read",
                [CONFIRMATION_META_KEY]: "none",
            },
        });
        expect(registrations[0]?.config.outputSchema).toBeDefined();

        if (false) {
            // @ts-expect-error guarded names cannot be registered by defineTool
            const invalidUnguardedName: Parameters<typeof defineTool>[1] = "clockify_tags_delete";
            void invalidUnguardedName;
        }
    });

    it("derives routine-write metadata and preserves controlled idempotency", () => {
        const { server, registrations } = captureServer();

        defineTool(
            server,
            "clockify_tags_update",
            {
                title: "Update tag",
                description: "Update one tag in the pinned Clockify workspace.",
                idempotent: true,
            },
            async () => successResult("clockify_tags_update", { updated: true }),
        );

        expect(registrations[0]?.config).toMatchObject({
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: {
                [RISK_META_KEY]: "routine_write",
                [CONFIRMATION_META_KEY]: "none",
            },
        });
    });
});

describe("defineGuardedTool", () => {
    it.each(["dry_run", "confirm_token"] as const)(
        "rejects a tool-owned %s guard control before registration",
        (reservedControl) => {
            const { server, registrations } = captureServer();

            expect(() =>
                defineGuardedTool(
                    server,
                    context(),
                    "clockify_tags_delete",
                    {
                        title: "Delete tag",
                        description: "Permanently delete one tag.",
                        inputSchema: {
                            tagId: z.string(),
                            [reservedControl]: z.string().optional(),
                        },
                    },
                    {
                        preview: async () => ({ id: "tag-1" }),
                        execute: async () => successResult("clockify_tags_delete", null),
                    },
                ),
            ).toThrow("clockify_tags_delete guard controls are owned by defineGuardedTool");
            expect(registrations).toHaveLength(0);
        },
    );

    function registerGuarded(store = new ConfirmationTokenStore()) {
        const { server, registrations } = captureServer();
        const preview = vi.fn(async (args: { tagId: string }) => ({
            action: "delete",
            entity: "tag",
            id: args.tagId,
            nested: { preserved: "original" },
            omitted: undefined,
        }));
        const execute = vi.fn(async (storedPreview: Record<string, unknown>, _extra: unknown) =>
            successResult("clockify_tags_delete", { storedPreview }),
        );
        defineGuardedTool(
            server,
            context(store),
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Permanently delete one tag from the pinned workspace.",
                inputSchema: { tagId: z.string().min(1) },
            },
            { preview, execute },
        );
        const registration = registrations[0];
        if (!registration) throw new Error("guarded tool was not registered");
        return { registration, preview, execute };
    }

    it("derives guarded metadata and adds both control fields to the runtime schema", () => {
        const { registration } = registerGuarded();

        expect(registration.config).toMatchObject({
            annotations: {
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: false,
                openWorldHint: false,
            },
            _meta: {
                [RISK_META_KEY]: "destructive",
                [CONFIRMATION_META_KEY]: "preview_token",
            },
        });
        expect(Object.keys(registration.config.inputSchema ?? {}).sort()).toEqual([
            "confirm_token",
            "dry_run",
            "tagId",
        ]);

        if (false) {
            // @ts-expect-error unguarded names cannot be registered by defineGuardedTool
            const invalidGuardedName: Parameters<typeof defineGuardedTool>[2] =
                "clockify_tags_create";
            void invalidGuardedName;
        }
    });

    it("returns confirmation-required without invoking preview or execute when controls are absent", async () => {
        const { registration, preview, execute } = registerGuarded();

        const result = await registration.handler({ tagId: "tag-1" }, {});

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            ok: false,
            error: { code: "invalid_request" },
            recovery: { args: { tagId: "tag-1", dry_run: true } },
        });
        expect(preview).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("does not resolve workspace for bare or conflicting control calls", async () => {
        const { server, registrations } = captureServer();
        const workspaceAccess = vi.fn((): never => {
            throw new Error("workspace must not be accessed");
        });
        const preview = vi.fn(async () => ({ action: "delete" }));
        const execute = vi.fn(async () => successResult("clockify_tags_delete", null));
        const missingContext = {
            client: {} as Context["client"],
            get workspaceId(): string {
                return workspaceAccess();
            },
            confirmationTokens: new ConfirmationTokenStore(),
        } as Context;
        defineGuardedTool(
            server,
            missingContext,
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Permanently delete one tag.",
                inputSchema: { tagId: z.string() },
            },
            { preview, execute },
        );
        const handler = registrations[0]?.handler;
        if (!handler) throw new Error("guarded tool was not registered");

        const bare = await handler({ tagId: "tag-1" }, {});
        const conflicting = await handler(
            { tagId: "tag-1", dry_run: false, confirm_token: "token" },
            {},
        );

        expect(envelope(bare)).toMatchObject({
            error: { code: "invalid_request" },
            recovery: { args: { tagId: "tag-1", dry_run: true } },
        });
        expect(envelope(conflicting)).toMatchObject({ error: { code: "invalid_request" } });
        expect(workspaceAccess).not.toHaveBeenCalled();
        expect(preview).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("treats dry_run:false without a token as bare confirmation-required", async () => {
        const { registration, preview, execute } = registerGuarded();

        const result = await registration.handler({ tagId: "tag-1", dry_run: false }, {});

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(preview).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects presence of both controls before preview or execute, even when dry_run is false", async () => {
        const { registration, preview, execute } = registerGuarded();

        const result = await registration.handler(
            { tagId: "tag-1", dry_run: false, confirm_token: "token" },
            {},
        );

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            ok: false,
            error: { code: "invalid_request" },
        });
        expect(preview).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("previews once on dry-run, stores a canonical clone, and executes that exact stored value", async () => {
        const { registration, preview, execute } = registerGuarded();
        const first = await registration.handler({ tagId: "tag-1", dry_run: true }, {});
        const firstEnvelope = envelope(first);
        const data = firstEnvelope.data as {
            confirm_token: string;
            preview: { nested: { preserved: string } };
        };
        data.preview.nested.preserved = "mutated receipt";

        expect(preview).toHaveBeenCalledWith({ tagId: "tag-1" }, {});

        const confirmed = await registration.handler(
            { tagId: "tag-1", confirm_token: data.confirm_token },
            {},
        );

        expect(preview).toHaveBeenCalledTimes(1);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(execute.mock.calls[0]?.[0]).toEqual({
            action: "delete",
            entity: "tag",
            id: "tag-1",
            nested: { preserved: "original" },
        });
        expect(execute.mock.calls[0]?.[1]).toEqual({});
        expect(execute.mock.calls[0]).toHaveLength(2);
        expect(envelope(confirmed)).toMatchObject({ ok: true });
    });

    it("rejects an expired stored preview before execute", async () => {
        const clock = { now: 1_000 };
        const store = new ConfirmationTokenStore({ ttlMs: 100, now: () => clock.now });
        const { registration, execute } = registerGuarded(store);
        const dryRun = envelope(await registration.handler({ tagId: "tag-1", dry_run: true }, {}));
        const token = (dryRun.data as { confirm_token: string }).confirm_token;
        clock.now += 100;

        const expired = await registration.handler({ tagId: "tag-1", confirm_token: token }, {});

        expect(expired.isError).toBe(true);
        expect(envelope(expired)).toMatchObject({ error: { code: "invalid_request" } });
        expect(execute).not.toHaveBeenCalled();
    });

    it("does not issue a token when preview validation rejects", async () => {
        const store = new ConfirmationTokenStore();
        const issue = vi.spyOn(store, "issue");
        const { server, registrations } = captureServer();
        const execute = vi.fn(async () => successResult("clockify_tags_delete", null));
        defineGuardedTool(
            server,
            context(store),
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Permanently delete one tag.",
                inputSchema: { tagId: z.string() },
            },
            {
                preview: async () => {
                    throw new Error("tag could not be resolved");
                },
                execute,
            },
        );
        const handler = registrations[0]?.handler;
        if (!handler) throw new Error("guarded tool was not registered");

        const rejected = await handler({ tagId: "missing", dry_run: true }, {});

        expect(rejected.isError).toBe(true);
        expect(issue).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("passes through a clarification preview without issuing a token", async () => {
        const store = new ConfirmationTokenStore();
        const issue = vi.spyOn(store, "issue");
        const { server, registrations } = captureServer();
        const clarification = successResult("clockify_tags_delete", null, undefined, {
            clarification: { question: "Which tag?" },
        });
        const execute = vi.fn(async () => successResult("clockify_tags_delete", null));
        defineGuardedTool(
            server,
            context(store),
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Permanently delete one tag.",
                inputSchema: { tagId: z.string() },
            },
            { preview: async () => clarification, execute },
        );
        const handler = registrations[0]?.handler;
        if (!handler) throw new Error("guarded tool was not registered");

        const result = await handler({ tagId: "ambiguous", dry_run: true }, {});

        expect(result).toBe(clarification);
        expect(issue).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });

    it("binds tokens to business arguments and consumes a mismatched token", async () => {
        const { registration, preview, execute } = registerGuarded();
        const dryRun = envelope(await registration.handler({ tagId: "tag-1", dry_run: true }, {}));
        const token = (dryRun.data as { confirm_token: string }).confirm_token;

        const mismatch = await registration.handler({ tagId: "tag-2", confirm_token: token }, {});
        const replay = await registration.handler({ tagId: "tag-1", confirm_token: token }, {});

        expect(mismatch.isError).toBe(true);
        expect(replay.isError).toBe(true);
        expect(preview).toHaveBeenCalledTimes(1);
        expect(execute).not.toHaveBeenCalled();
    });

    it("does not restore a consumed token when execute fails", async () => {
        const { server, registrations } = captureServer();
        const execute = vi.fn(async () => {
            throw new Error("mutation failed");
        });
        defineGuardedTool(
            server,
            context(),
            "clockify_tags_delete",
            {
                title: "Delete tag",
                description: "Permanently delete one tag.",
                inputSchema: { tagId: z.string() },
            },
            { preview: async () => ({ id: "tag-1" }), execute },
        );
        const handler = registrations[0]?.handler;
        if (!handler) throw new Error("guarded tool was not registered");
        const dryRun = envelope(await handler({ tagId: "tag-1", dry_run: true }, {}));
        const token = (dryRun.data as { confirm_token: string }).confirm_token;

        const failed = await handler({ tagId: "tag-1", confirm_token: token }, {});
        const replay = await handler({ tagId: "tag-1", confirm_token: token }, {});

        expect(failed.isError).toBe(true);
        expect(replay.isError).toBe(true);
        expect(execute).toHaveBeenCalledTimes(1);
    });
});
