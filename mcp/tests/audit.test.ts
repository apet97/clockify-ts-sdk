import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ConflictError } from "clockify-sdk-ts-115/errors";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

/**
 * A context whose audit-log search records the outgoing request and replays a
 * canned page of rows. Pass a `search` override to model a feature-gated /
 * not-found host instead of the happy path.
 */
function auditContext(
    captured: Record<string, unknown>,
    search?: (req: unknown) => Promise<unknown>,
): Context {
    return {
        workspaceId: "ws-1",
        client: {
            auditLogReport: {
                search:
                    search ??
                    (async (req: unknown) => {
                        captured.search = req;
                        return { entries: [{ id: "audit-1" }], count: 1 };
                    }),
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

describe("clockify_audit_log_search", () => {
    it("pins the workspace and applies the CONTAINS / empty-author / page defaults", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT", "UPDATE_PROJECT"],
            },
        });
        expect(res.isError).toBeFalsy();
        // Every `?? default` branch fires here: authorIds -> [], authorsMode ->
        // CONTAINS, page -> 1, pageSize -> 50. (default("CONTAINS") makes the
        // value present, so the runtime `?? "CONTAINS"` is the belt-and-braces arm.)
        expect(captured.search).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            actions: ["CREATE_PROJECT", "UPDATE_PROJECT"],
            authors: { authorIds: [], contains: "CONTAINS" },
            page: 1,
            "page-size": 50,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.action).toBe("clockify_audit_log_search");
        expect(json.data).toEqual({ entries: [{ id: "audit-1" }], count: 1 });
        // Read-only tool: no write receipt (entity/changed) and no meta beyond workspace.
        expect(json.changed).toBeUndefined();
        expect(json.entity).toBeUndefined();
        expect((json.meta as { workspaceId?: string }).workspaceId).toBe("ws-1");
    });

    it("forwards explicit authorIds, DOES_NOT_CONTAIN mode, and pagination overrides", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["DELETE_TASK"],
                authorIds: ["user-1", "SYSTEM"],
                authorsMode: "DOES_NOT_CONTAIN",
                page: 3,
                pageSize: 50,
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.search).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            actions: ["DELETE_TASK"],
            authors: { authorIds: ["user-1", "SYSTEM"], contains: "DOES_NOT_CONTAIN" },
            page: 3,
            "page-size": 50,
        });
        expect(envelope(res).ok).toBe(true);
    });

    it("surfaces a feature-gated 402 verbatim as feature_unavailable, without calling through twice", async () => {
        const captured: Record<string, unknown> = {};
        let calls = 0;
        const client = await connect(
            auditContext(captured, async () => {
                calls += 1;
                // Reproduce the PRODUCTION error shape: the generated client throws a
                // real ClockifyApiError (not a plain Error) for a 402. A plain
                // Error+statusCode would skip the SDK classifier and take the
                // HTTP-status fallback in errorCodeForError -- the OPPOSITE path from
                // production, masking the bug. 402 is not in the subclass-promotion
                // table, so a ConflictError carrying statusCode 402 classifies
                // identically to the base ClockifyApiError(402) the runtime throws.
                throw new ConflictError({
                    statusCode: 402,
                    body: { message: "This feature is not available on your plan" },
                });
            }),
        );
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
            },
        });
        expect(res.isError).toBe(true);
        expect(calls).toBe(1);
        const json = envelope(res);
        const error = json.error as { code: string; message: string };
        expect(error.code).toBe("feature_unavailable");
        expect(error.message).toContain("This feature is not available on your plan");
        expect((json.recovery as { retryable?: boolean }).retryable).toBe(false);
    });

    it("surfaces a 404 host/route failure verbatim as not_found", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            auditContext(captured, async () => {
                throw Object.assign(new Error("Not Found"), { statusCode: 404 });
            }),
        );
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
            },
        });
        expect(res.isError).toBe(true);
        const error = envelope(res).error as { code: string; message: string };
        expect(error.code).toBe("not_found");
        expect(error.message).toBe("Not Found");
    });

    it("maps a 403 permission denial to auth_or_permission", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            auditContext(captured, async () => {
                throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
            }),
        );
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
            },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string }).code).toBe("auth_or_permission");
    });

    it("rejects an empty actions array before reaching the SDK (min 1)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: [],
            },
        });
        expect(res.isError).toBe(true);
        // Schema validation fires before the handler body, so nothing reaches the client.
        expect(captured.search).toBeUndefined();
    });

    it("rejects an out-of-range pageSize (>50) before reaching the SDK", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
                pageSize: 51,
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.search).toBeUndefined();
    });

    it("rejects a blank window start before reaching the SDK (min 1)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const res = await client.callTool({
            name: "clockify_audit_log_search",
            arguments: {
                start: "",
                end: "2026-06-07T00:00:00Z",
                actions: ["CREATE_PROJECT"],
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.search).toBeUndefined();
    });

    it("advertises a read-only, idempotent annotation", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(auditContext(captured));
        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_audit_log_search",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(true);
        expect(tool?.annotations?.idempotentHint).toBe(true);
    });
});
