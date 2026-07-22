import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ClockifyConnectionError, ConflictError } from "clockify-sdk-ts-115/errors";
import { describe, expect, it } from "vitest";

import { MissingCredentialsError } from "../src/client.js";
import {
    defineTool,
    errorCodeForError,
    errorResult,
    successResult,
    type ToolHandler,
    writeReceipt,
} from "../src/result.js";

describe("successResult", () => {
    it("wraps the payload in {ok:true, action, data}", () => {
        const out = successResult("clockify_status", { user: "alice" });
        expect(out.isError).toBeUndefined();
        expect(out.content[0]).toMatchObject({ type: "text" });
        const text = (out.content[0] as { type: string; text: string }).text;
        expect(JSON.parse(text)).toEqual({
            ok: true,
            action: "clockify_status",
            data: { user: "alice" },
        });
        expect(out.structuredContent).toEqual({
            ok: true,
            action: "clockify_status",
            data: { user: "alice" },
        });
    });

    it("carries write receipts for string and named entity references", () => {
        const stringRef = successResult(
            "clockify_tags_delete",
            { deleted: true },
            undefined,
            writeReceipt("deleted", "tag", "tag-1"),
        );
        const namedRef = successResult(
            "clockify_tags_create",
            { id: "tag-2" },
            undefined,
            writeReceipt("created", "tag", { id: "tag-2", name: "Release" }),
        );

        expect(JSON.parse((stringRef.content[0] as { text: string }).text).changed).toEqual({
            deleted: [{ type: "tag", id: "tag-1" }],
        });
        expect(JSON.parse((namedRef.content[0] as { text: string }).text).changed).toEqual({
            created: [{ type: "tag", id: "tag-2", name: "Release" }],
        });
    });

    it("includes meta when non-empty", () => {
        const out = successResult("clockify_projects_list", [], { count: 0, hasMore: false });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.meta).toEqual({ count: 0, hasMore: false });
    });

    it("omits meta when empty", () => {
        const out = successResult("clockify_status", { user: "alice" }, {});
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).not.toHaveProperty("meta");
    });

    it("carries a clarification receipt for an ambiguous name", () => {
        const out = successResult("clockify_log_work", null, undefined, {
            clarification: {
                question: 'More than one active project is named "Website". Which one?',
                field: "project",
                candidates: [
                    { type: "project", id: "p1", name: "Website" },
                    { type: "project", id: "p2", name: "Website (archived)" },
                ],
            },
        });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.clarification).toEqual({
            question: 'More than one active project is named "Website". Which one?',
            field: "project",
            candidates: [
                { type: "project", id: "p1", name: "Website" },
                { type: "project", id: "p2", name: "Website (archived)" },
            ],
        });
        expect(out.structuredContent).toEqual(parsed);
    });

    it("strips blank / whitespace-only ids and keeps the real ones", () => {
        const out = successResult("clockify_status", { ok: true }, undefined, {
            ids: { good: "p1", blank: "   ", empty: "" },
        });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.ids).toEqual({ good: "p1" });
    });

    it("omits the ids property entirely when every id is blank", () => {
        const out = successResult("clockify_status", { ok: true }, undefined, {
            ids: { blank: "   ", empty: "" },
        });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).not.toHaveProperty("ids");
    });

    it("can carry workflow IDs, change sets, warnings, and next actions", () => {
        const out = successResult(
            "clockify_create_work_package",
            { project: { id: "p1", name: "Launch" } },
            { workspaceId: "ws-1" },
            {
                entity: "work_package",
                ids: { projectId: "p1" },
                changed: { created: [{ type: "project", id: "p1", name: "Launch" }] },
                warnings: [{ code: "partial", message: "Tag was reused." }],
                next: [
                    {
                        tool: "clockify_log_work",
                        args: { project_id: "p1" },
                        reason: "Log finished work against this package.",
                    },
                ],
            },
        );
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).toMatchObject({
            ok: true,
            action: "clockify_create_work_package",
            entity: "work_package",
            ids: { projectId: "p1" },
            changed: { created: [{ type: "project", id: "p1", name: "Launch" }] },
            warnings: [{ code: "partial", message: "Tag was reused." }],
            next: [{ tool: "clockify_log_work", args: { project_id: "p1" } }],
        });
        expect(out.structuredContent).toEqual(parsed);
    });
});

describe("errorResult", () => {
    it("sets isError + maps statusCode to a stable code", () => {
        const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
        const out = errorResult("clockify_entries_list", err, "Try a different ID.");
        expect(out.isError).toBe(true);
        expect(out.content[0]).toMatchObject({ type: "text" });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed).toMatchObject({
            ok: false,
            action: "clockify_entries_list",
            error: { code: "not_found", message: "Not Found" },
            recovery: { hint: "Try a different ID." },
        });
    });

    it("maps a real SDK 402 ConflictError to feature_unavailable", () => {
        const out = errorResult(
            "clockify_invoices_create",
            new ConflictError({ statusCode: 402, message: "Plan upgrade required" }),
        );

        expect(JSON.parse((out.content[0] as { text: string }).text).error).toMatchObject({
            code: "feature_unavailable",
        });
    });

    it("maps 401/403 to auth_or_permission, 429 to rate_limited", () => {
        const out401 = errorResult("x", Object.assign(new Error("nope"), { statusCode: 401 }));
        const out429 = errorResult("x", Object.assign(new Error("slow"), { statusCode: 429 }));
        expect(JSON.parse((out401.content[0] as { text: string }).text).error.code).toBe(
            "auth_or_permission",
        );
        expect(JSON.parse((out429.content[0] as { text: string }).text).error.code).toBe(
            "rate_limited",
        );
    });

    it("falls back to 'error' for unknown shapes", () => {
        const out = errorResult("x", "string error");
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.error).toEqual({ code: "error", message: "string error" });
    });

    it("maps confirmation-token failures to invalid_request", () => {
        const out = errorResult(
            "clockify_setup_webhook",
            new Error("confirmation token does not match this tool call"),
        );
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.error).toEqual({
            code: "invalid_request",
            message: "confirmation token does not match this tool call",
        });
    });

    it("maps local validation failures to invalid_request", () => {
        const out = errorResult("clockify_setup_webhook", new Error("webhook URL must use HTTPS"));
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.error).toEqual({
            code: "invalid_request",
            message: "webhook URL must use HTTPS",
        });
    });

    it("classifies a connection error (statusCode null) as connection_error even when the message says 'workspace'", () => {
        // Without the cause-aware classifier, the message-regex fallback would match
        // /workspace/ and mislabel this as auth_or_permission (retryable:false).
        const err = new ClockifyConnectionError({
            message: "request to workspace API failed",
            cause: new Error("ENOTFOUND"),
        });
        const out = errorResult("clockify_status", err);
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.error.code).toBe("connection_error");
        expect(parsed.recovery.retryable).toBe(true);
    });

    it("accepts structured recovery guidance", () => {
        const out = errorResult("clockify_log_work", new Error("project is required"), {
            hint: "List projects, then retry with project_id.",
            tool: "clockify_projects_list",
            args: { pageSize: 20 },
            retryable: true,
        });
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.recovery).toEqual({
            hint: "List projects, then retry with project_id.",
            tool: "clockify_projects_list",
            args: { pageSize: 20 },
            retryable: true,
        });
        expect(out.structuredContent).toEqual(parsed);
    });

    it("calls a RecoveryResolver with (err, code) and uses its returned hint", () => {
        const seen: Array<{ err: unknown; code: string }> = [];
        const err = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
        const out = errorResult("clockify_status", err, (e, code) => {
            seen.push({ err: e, code });
            return { hint: "regenerate the key", retryable: false };
        });
        expect(seen).toHaveLength(1);
        expect(seen[0]!.err).toBe(err);
        expect(seen[0]!.code).toBe("auth_or_permission");
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.recovery).toEqual({ hint: "regenerate the key", retryable: false });
    });

    it("maps a MissingCredentialsError to a setup_required envelope", () => {
        const out = errorResult(
            "clockify_status",
            new MissingCredentialsError(["CLOCKIFY_API_KEY"]),
        );
        expect(out.isError).toBe(true);
        const parsed = JSON.parse((out.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe("setup_required");
        expect(parsed.error.message).toMatch(/CLOCKIFY_API_KEY is not set/);
        expect(parsed.recovery.retryable).toBe(false);
    });

    it("wraps a resolver that returns a bare string into {hint}", () => {
        const out = errorResult(
            "x",
            Object.assign(new Error("nope"), { statusCode: 404 }),
            (_e, code) => `code is ${code}`,
        );
        const parsed = JSON.parse((out.content[0] as { text: string }).text);
        expect(parsed.recovery).toEqual({ hint: "code is not_found" });
    });
});

describe("errorCodeForError", () => {
    it("derives the stable code with errorResult's precedence", () => {
        expect(errorCodeForError(Object.assign(new Error("x"), { statusCode: 403 }))).toBe(
            "auth_or_permission",
        );
        expect(errorCodeForError("plain string")).toBe("error");
    });
});

describe("defineTool", () => {
    const toolName = "clockify_status" as const;
    type Handler = (
        args: Record<string, unknown>,
        extra: unknown,
    ) => CallToolResult | Promise<CallToolResult>;
    // Capture the wrapped callback defineTool hands to server.registerTool, so we can
    // invoke it and assert the try/catch envelope behavior.
    function register(handler: ToolHandler, recovery?: string): Handler {
        let captured: Handler | undefined;
        const fakeServer = {
            registerTool: (_name: string, _config: unknown, cb: Handler) => {
                captured = cb;
            },
        } as unknown as McpServer;
        defineTool(
            fakeServer,
            toolName,
            { title: "Test", description: "Test tool envelope." },
            handler,
            recovery,
        );
        if (!captured) throw new Error("registerTool was not called");
        return captured;
    }

    it("passes a successful handler result through unchanged", async () => {
        const run = register(async () => successResult(toolName, { ran: true }));
        const out = await run({}, {});
        expect(out.isError).toBeUndefined();
        expect(JSON.parse((out.content[0] as { text: string }).text)).toMatchObject({
            ok: true,
            action: toolName,
            data: { ran: true },
        });
    });

    it("converts a thrown error into an errorResult envelope with the optional recovery", async () => {
        const run = register(async () => {
            throw Object.assign(new Error("Not Found"), { statusCode: 404 });
        }, "Check the id.");
        const out = await run({}, {});
        expect(out.isError).toBe(true);
        expect(JSON.parse((out.content[0] as { text: string }).text)).toMatchObject({
            ok: false,
            action: toolName,
            error: { code: "not_found", message: "Not Found" },
            recovery: { hint: "Check the id." },
        });
    });
});
