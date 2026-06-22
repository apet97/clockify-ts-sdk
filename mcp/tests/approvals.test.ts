/**
 * Behavior tests for the timesheet approval tools (`mcp/src/tools/approvals.ts`).
 *
 * These exercise the four approval tools end-to-end through the real
 * `buildServer` + InMemory transport so the canonical envelope, the
 * `defineTool` error-catch path, the Zod `inputSchema` validation, and each
 * tool's request-shaping branch are all covered. The previously-untested
 * branches targeted here: `clockify_approvals_list`'s `status`-filter and
 * pagination-default branches, `clockify_approvals_update_state`'s `note`
 * conditional spread, the narrower `resubmit` period enum, and the 4xx/5xx
 * error classification for every tool.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

/** A spy approvals client: each method records its request and returns a stub row. */
interface ApprovalsSpy {
    list: (req: unknown) => Promise<unknown>;
    submit: (req: unknown) => Promise<unknown>;
    updateStatus: (req: unknown) => Promise<unknown>;
    resubmit: (req: unknown) => Promise<unknown>;
}

/**
 * Build a Context whose `approvals` client records every request into
 * `captured` and returns a representative success value. Individual tests
 * override a single method (via `overrides`) to inject a throw for the
 * error-path assertions, mirroring the sibling tests' single-method overrides.
 */
function approvalsContext(
    captured: Record<string, unknown>,
    overrides: Partial<ApprovalsSpy> = {},
): Context {
    const approvals: ApprovalsSpy = {
        list: async (req: unknown) => {
            captured.list = req;
            return [{ id: "ar-1" }, { id: "ar-2" }];
        },
        submit: async (req: unknown) => {
            captured.submit = req;
            return { id: "ar-9", status: { state: "PENDING" } };
        },
        updateStatus: async (req: unknown) => {
            captured.updateStatus = req;
            return { id: "ar-1", status: { state: "APPROVED" } };
        },
        resubmit: async (req: unknown) => {
            captured.resubmit = req;
            return [{ id: "te-1" }];
        },
        ...overrides,
    };
    return {
        workspaceId: "ws-1",
        client: { approvals } as never,
    };
}

/** A thrown error carrying an HTTP statusCode, matching the SDK's error shape. */
function httpError(message: string, statusCode: number): Error {
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = statusCode;
    return err;
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

/** The raw `content[0].text` — used for the SDK's non-JSON schema-validation errors. */
function rawText(res: unknown): string {
    return (res as { content: Array<{ text: string }> }).content[0]?.text ?? "";
}

describe("clockify_approvals_list", () => {
    it("defaults page/page-size, pins the workspace, omits status, and reports count", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_list",
            arguments: {},
        });
        expect(res.isError).toBeFalsy();
        // The defaults branch (`args.page ?? 1`, `args.pageSize ?? 50`) and the
        // omitted-status branch: no `status` key on the request at all.
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            page: 1,
            "page-size": 50,
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        // count comes from items.length, not a server-echoed field.
        expect((json.meta as { count?: number }).count).toBe(2);
        expect((json.meta as { workspaceId?: string }).workspaceId).toBe("ws-1");
        expect(Array.isArray(json.data)).toBe(true);
        expect((json.data as unknown[]).length).toBe(2);
    });

    it("forwards an explicit status filter and pagination overrides verbatim", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_list",
            arguments: { status: "PENDING", page: 3, pageSize: 25 },
        });
        expect(res.isError).toBeFalsy();
        // The `if (args.status)` branch must add the renamed key; page/page-size
        // come through unchanged (no default substitution).
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            page: 3,
            "page-size": 25,
            status: "PENDING",
        });
    });

    it("is annotated read-only", async () => {
        const client = await connect(approvalsContext({}));
        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_approvals_list",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it.each(["REJECTED", "WITHDRAWN_SUBMISSION", "WITHDRAWN"] as const)(
        "rejects the non-listable status %s at the schema before any list call",
        async (status) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(approvalsContext(captured));
            const res = await client.callTool({
                name: "clockify_approvals_list",
                arguments: { status },
            });
            expect(res.isError).toBe(true);
            expect(rawText(res)).toMatch(/status|-32602|Input validation/i);
            expect(captured.list).toBeUndefined();
        },
    );

    it("rejects an out-of-range pageSize at the schema before any list call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_list",
            arguments: { pageSize: 500 },
        });
        expect(res.isError).toBe(true);
        // Schema validation failures surface as a non-JSON MCP protocol error.
        expect(rawText(res)).toMatch(/-32602|Input validation/i);
        expect(captured.list).toBeUndefined();
    });

    it("classifies an upstream 429 as rate_limited via the defineTool catch path", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            approvalsContext(captured, {
                list: async () => {
                    throw httpError("too many requests", 429);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_approvals_list",
            arguments: {},
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect((json.error as { code?: string }).code).toBe("rate_limited");
        // rate_limited is retryable per the error registry.
        expect((json.recovery as { retryable?: boolean }).retryable).toBe(true);
    });
});

describe("clockify_approvals_submit", () => {
    it("wraps the period/periodStart into a wireBody envelope and pins the workspace", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_submit",
            arguments: { period: "SEMI_MONTHLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBeFalsy();
        // wireBody returns the value verbatim → { workspaceId, body: {...} }.
        expect(captured.submit).toEqual({
            workspaceId: "ws-1",
            body: { period: "SEMI_MONTHLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { workspaceId?: string }).workspaceId).toBe("ws-1");
    });

    it("rejects BIWEEKLY (not a live Clockify period) at the schema before any submit call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_submit",
            arguments: { period: "BIWEEKLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBe(true);
        // Schema validation failures surface as a non-JSON MCP protocol error.
        expect(rawText(res)).toMatch(/period|BIWEEKLY|-32602|Input validation/i);
        expect(captured.submit).toBeUndefined();
    });

    it("is annotated as a (non-idempotent) write", async () => {
        const client = await connect(approvalsContext({}));
        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_approvals_submit",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(false);
        expect(tool?.annotations?.idempotentHint).toBe(false);
    });

    it("rejects a missing period at the schema before any submit call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_submit",
            arguments: { periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBe(true);
        expect(rawText(res)).toMatch(/period/);
        expect(captured.submit).toBeUndefined();
    });

    it("rejects an empty periodStart (min length 1) before any submit call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_submit",
            arguments: { period: "WEEKLY", periodStart: "" },
        });
        expect(res.isError).toBe(true);
        expect(captured.submit).toBeUndefined();
    });

    it("surfaces an upstream 500 as clockify_upstream_error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            approvalsContext(captured, {
                submit: async () => {
                    throw httpError("server exploded", 500);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_approvals_submit",
            arguments: { period: "WEEKLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("clockify_upstream_error");
        expect((json.error as { message?: string }).message).toBe("server exploded");
    });
});

describe("clockify_approvals_update_state", () => {
    it("omits note from the body when not supplied and reports the approval id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "ar-1", state: "APPROVED" },
        });
        expect(res.isError).toBeFalsy();
        // The conditional-spread branch: with no note, body carries only state.
        expect(captured.updateStatus).toEqual({
            workspaceId: "ws-1",
            approvalRequestId: "ar-1",
            body: { state: "APPROVED" },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { approvalRequestId?: string }).approvalRequestId).toBe("ar-1");
    });

    it("includes note in the body when supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "ar-7", state: "REJECTED", note: "Missing entries" },
        });
        expect(res.isError).toBeFalsy();
        // The other arm of the conditional spread: body carries state + note.
        expect(captured.updateStatus).toEqual({
            workspaceId: "ws-1",
            approvalRequestId: "ar-7",
            body: { state: "REJECTED", note: "Missing entries" },
        });
    });

    it("is annotated as an idempotent write", async () => {
        const client = await connect(approvalsContext({}));
        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_approvals_update_state",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(false);
        expect(tool?.annotations?.idempotentHint).toBe(true);
    });

    it("rejects an empty approvalRequestId before any update call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "", state: "APPROVED" },
        });
        expect(res.isError).toBe(true);
        expect(captured.updateStatus).toBeUndefined();
    });

    it("rejects a state outside the APPROVAL_STATES enum before any update call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "ar-1", state: "MAYBE" },
        });
        expect(res.isError).toBe(true);
        expect(rawText(res)).toMatch(/state/);
        expect(captured.updateStatus).toBeUndefined();
    });

    it("maps a 404 from the update call to not_found", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            approvalsContext(captured, {
                updateStatus: async () => {
                    throw httpError("approval request not found", 404);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "ar-x", state: "WITHDRAWN_APPROVAL" },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("not_found");
    });

    it.each(["WITHDRAWN_APPROVAL", "WITHDRAWN_SUBMISSION"] as const)(
        "accepts the real withdrawn state %s and forwards it verbatim",
        async (state) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(approvalsContext(captured));
            const res = await client.callTool({
                name: "clockify_approvals_update_state",
                arguments: { approvalRequestId: "ar-1", state },
            });
            expect(res.isError).toBeFalsy();
            expect(captured.updateStatus).toEqual({
                workspaceId: "ws-1",
                approvalRequestId: "ar-1",
                body: { state },
            });
        },
    );

    it("rejects the bare WITHDRAWN value (not a live state) before any update call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_update_state",
            arguments: { approvalRequestId: "ar-1", state: "WITHDRAWN" },
        });
        expect(res.isError).toBe(true);
        expect(rawText(res)).toMatch(/state|WITHDRAWN|-32602|Input validation/i);
        expect(captured.updateStatus).toBeUndefined();
    });
});

describe("clockify_approvals_resubmit", () => {
    it("passes a flat request (no wireBody envelope) and pins the workspace", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_resubmit",
            arguments: { period: "MONTHLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBeFalsy();
        // resubmit uses a flat shape, distinct from submit's body envelope.
        expect(captured.resubmit).toEqual({
            workspaceId: "ws-1",
            period: "MONTHLY",
            periodStart: "2026-06-01T00:00:00Z",
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { workspaceId?: string }).workspaceId).toBe("ws-1");
    });

    it("rejects BIWEEKLY which submit allows but resubmit's narrower enum does not", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(approvalsContext(captured));
        const res = await client.callTool({
            name: "clockify_approvals_resubmit",
            arguments: { period: "BIWEEKLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBe(true);
        expect(rawText(res)).toMatch(/period|BIWEEKLY/);
        expect(captured.resubmit).toBeUndefined();
    });

    it("maps a 403 from the resubmit call to auth_or_permission", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            approvalsContext(captured, {
                resubmit: async () => {
                    throw httpError("forbidden", 403);
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_approvals_resubmit",
            arguments: { period: "WEEKLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code?: string }).code).toBe("auth_or_permission");
        expect((json.recovery as { retryable?: boolean }).retryable).toBe(false);
    });
});
