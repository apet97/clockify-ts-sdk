import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

let teardown: () => Promise<void> = async () => {};

const REPORT_ID = "000000000000000000000301";
const OTHER_REPORT_ID = "000000000000000000000999";
const SHARED_FILTER = {
    dateRangeStart: "2026-07-01T00:00:00Z",
    dateRangeEnd: "2026-09-30T23:59:59Z",
    exportType: "JSON" as const,
};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

type SharedReportsResource = Partial<{
    list: (req: unknown) => Promise<unknown>;
    view: (req: unknown) => Promise<unknown>;
    create: (req: unknown) => Promise<unknown>;
    update: (req: unknown) => Promise<unknown>;
    delete: (req: unknown) => Promise<unknown>;
}>;

/**
 * A sharedReports-only Context. Each SDK method records its request into
 * `captured` (keyed by method name) and returns the supplied stub. Overrides
 * replace a default so a single test can force a 4xx by throwing from one
 * method.
 */
function sharedReportsContext(
    captured: Record<string, unknown>,
    overrides: SharedReportsResource = {},
): Context {
    const sharedReports: SharedReportsResource = {
        list: async (req: unknown) => {
            captured.list = req;
            return [{ id: REPORT_ID, name: "Weekly hours", type: "WEEKLY" }];
        },
        view: async (req: unknown) => {
            captured.view = req;
            return { id: REPORT_ID, rows: [], totals: {} };
        },
        create: async (req: unknown) => {
            captured.create = req;
            return { id: REPORT_ID };
        },
        update: async (req: unknown) => {
            captured.update = req;
            return { id: REPORT_ID, name: "Renamed", type: "SUMMARY" };
        },
        delete: async (req: unknown) => {
            captured.delete = req;
            return undefined;
        },
        ...overrides,
    };
    return {
        workspaceId: "ws-1",
        client: { sharedReports } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "shared-reports-test-harness", version: "0.0.0" });
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

describe("clockify_shared_reports_list", () => {
    it("pins the workspace, stays read-only, and echoes the workspace in meta", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({ name: "clockify_shared_reports_list", arguments: {} });

        expect(res.isError).toBeFalsy();
        // Workspace-scoped list: only the pinned workspace is sent.
        expect(captured.list).toEqual({ workspaceId: "ws-1" });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { workspaceId: string }).workspaceId).toBe("ws-1");
        // Read-only tool: no changed receipt.
        expect(json.changed).toBeUndefined();

        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_shared_reports_list",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(true);
    });

    it("surfaces an upstream 401 as a structured auth_or_permission error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                list: async () => {
                    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
                },
            }),
        );
        const res = await client.callTool({ name: "clockify_shared_reports_list", arguments: {} });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect(json.error as { code: string; message: string }).toEqual({
            code: "auth_or_permission",
            message: "Unauthorized",
        });
    });
});

describe("clockify_shared_reports_view", () => {
    it("fetches by shared-report id alone (no workspace scope) and omits exportType when absent", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_view",
            arguments: { shared_report_id: REPORT_ID },
        });

        expect(res.isError).toBeFalsy();
        // View is keyed only by the shared-report id; no workspaceId, no exportType.
        expect(captured.view).toEqual({ sharedReportId: REPORT_ID });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { sharedReportId: string }).sharedReportId).toBe(REPORT_ID);
    });

    it("forwards exportType when an export_type is supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_view",
            arguments: { shared_report_id: REPORT_ID, export_type: "CSV" },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.view).toEqual({ sharedReportId: REPORT_ID, exportType: "CSV" });
    });

    it("rejects an export_type outside the enum at the schema boundary before any call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_view",
            arguments: { shared_report_id: REPORT_ID, export_type: "DOCX" },
        });

        expect(res.isError).toBe(true);
        // The enum guard fails in the transport layer; the handler never runs.
        expect(captured.view).toBeUndefined();
    });

    it("rejects an empty shared_report_id at the schema boundary", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_view",
            arguments: { shared_report_id: "" },
        });

        expect(res.isError).toBe(true);
        expect(captured.view).toBeUndefined();
    });

    it("surfaces a missing shared report (404) as a structured not_found error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                view: async () => {
                    throw Object.assign(new Error("Not Found"), { statusCode: 404 });
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_shared_reports_view",
            arguments: { shared_report_id: REPORT_ID },
        });

        expect(res.isError).toBe(true);
        expect(envelope(res).error as { code: string; message: string }).toEqual({
            code: "not_found",
            message: "Not Found",
        });
    });
});

describe("clockify_shared_reports_create", () => {
    it("wraps name/type/filter in a body envelope, pins the workspace, and emits a created receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: {
                name: "Q3 summary",
                type: "SUMMARY",
                filter: SHARED_FILTER,
            },
        });

        expect(res.isError).toBeFalsy();
        // `public` omitted -> it must NOT appear in the body (the !== undefined guard).
        expect(captured.create).toEqual({
            workspaceId: "ws-1",
            body: {
                name: "Q3 summary",
                type: "SUMMARY",
                filter: SHARED_FILTER,
            },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("shared_report");
        // writeReceipt("created", "shared_report", { id, name }) -> changed.created carries id + name.
        const changed = json.changed as {
            created: Array<{ type: string; id: string; name: string }>;
        };
        expect(changed.created).toEqual([
            { type: "shared_report", id: REPORT_ID, name: "Q3 summary" },
        ]);

        const tool = (await client.listTools()).tools.find(
            (t) => t.name === "clockify_shared_reports_create",
        );
        expect(tool?.annotations?.readOnlyHint).toBe(false);
    });

    it("forwards public=false into the body (the !== undefined guard, not truthiness)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "Private", type: "DETAILED", filter: SHARED_FILTER, public: false },
        });

        expect(res.isError).toBeFalsy();
        // A falsy `public` must still land in the body envelope.
        expect(captured.create).toEqual({
            workspaceId: "ws-1",
            body: { name: "Private", type: "DETAILED", filter: SHARED_FILTER, isPublic: false },
        });
    });

    it("falls back to an empty id in the receipt when the created entity has no id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                // No id field on the returned entity -> entityId(...) ?? "" -> "".
                create: async (req: unknown) => {
                    captured.create = req;
                    return { name: "anon" };
                },
            }),
        );
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "anon", type: "WEEKLY", filter: SHARED_FILTER },
        });

        expect(res.isError).toBeFalsy();
        const changed = envelope(res).changed as {
            created: Array<{ type: string; id: string; name: string }>;
        };
        expect(changed.created).toEqual([{ type: "shared_report", id: "", name: "anon" }]);
    });

    it("rejects an empty name at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "", type: "SUMMARY", filter: SHARED_FILTER },
        });

        expect(res.isError).toBe(true);
        // min(1) on the name fails validation; the handler never runs.
        expect(captured.create).toBeUndefined();
    });

    it("rejects an unsupported report type at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "Bad type", type: "NOT_A_TYPE", filter: SHARED_FILTER },
        });

        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("maps an upstream 400 to a structured invalid_request error with no changed receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                create: async () => {
                    throw Object.assign(new Error("Bad Request"), { statusCode: 400 });
                },
            }),
        );
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "X", type: "SUMMARY", filter: SHARED_FILTER },
        });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code: string }).code).toBe("invalid_request");
        expect(json.changed).toBeUndefined();
    });

    it("rejects a filter missing required dates/export type before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_create",
            arguments: { name: "Incomplete", type: "SUMMARY", filter: {} },
        });

        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });
});

describe("clockify_shared_reports_update", () => {
    it("full-replaces by id, pins the workspace + shared-report id, and emits an updated receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_update",
            arguments: {
                shared_report_id: REPORT_ID,
                name: "Renamed",
                type: "DETAILED",
                filter: {
                    ...SHARED_FILTER,
                    detailedFilter: { auditFilter: { billable: true } },
                },
            },
        });

        expect(res.isError).toBeFalsy();
        // `public` omitted -> absent from the body envelope.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            sharedReportId: REPORT_ID,
            body: {
                name: "Renamed",
                type: "DETAILED",
                filter: {
                    ...SHARED_FILTER,
                    detailedFilter: { auditFilter: { billable: true } },
                },
            },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("shared_report");
        expect(json.meta as { workspaceId: string; sharedReportId: string }).toEqual({
            workspaceId: "ws-1",
            sharedReportId: REPORT_ID,
        });
        const changed = json.changed as {
            updated: Array<{ type: string; id: string; name: string }>;
        };
        expect(changed.updated).toEqual([
            { type: "shared_report", id: REPORT_ID, name: "Renamed" },
        ]);
    });

    it("forwards public=true into the body envelope when supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_update",
            arguments: {
                shared_report_id: REPORT_ID,
                name: "Made public",
                type: "WEEKLY",
                filter: SHARED_FILTER,
                public: true,
            },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            sharedReportId: REPORT_ID,
            body: { name: "Made public", type: "WEEKLY", filter: SHARED_FILTER, isPublic: true },
        });
    });

    it("rejects a missing shared_report_id at the schema boundary before any write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_update",
            arguments: { name: "x", type: "SUMMARY", filter: SHARED_FILTER },
        });

        expect(res.isError).toBe(true);
        expect(captured.update).toBeUndefined();
    });

    it.each([
        ["shared filter", { ...SHARED_FILTER, unsupported: true }],
        ["detailed filter", { ...SHARED_FILTER, detailedFilter: { page: 1, unsupported: true } }],
        [
            "attendance filter",
            { ...SHARED_FILTER, attendanceFilter: { page: 1, unsupported: true } },
        ],
        [
            "attendance users filter",
            {
                ...SHARED_FILTER,
                attendanceFilter: { users: { ids: ["user-1"], unsupported: true } },
            },
        ],
        [
            "summary filter",
            { ...SHARED_FILTER, summaryFilter: { groups: ["USER"], unsupported: true } },
        ],
        [
            "weekly filter",
            {
                ...SHARED_FILTER,
                weeklyFilter: { group: "USER", subgroup: "TIME", unsupported: true },
            },
        ],
    ] as const)(
        "rejects unknown keys on the closed %s before any write",
        async (_label, filter) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(sharedReportsContext(captured));
            const res = await callGuarded(client, {
                name: "clockify_shared_reports_update",
                arguments: {
                    shared_report_id: REPORT_ID,
                    name: "Closed",
                    type: "DETAILED",
                    filter,
                },
            });

            expect(res.isError).toBe(true);
            expect(captured.update).toBeUndefined();
        },
    );

    it("maps an upstream 404 on a stale id to a structured not_found error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                update: async () => {
                    throw Object.assign(new Error("Not Found"), { statusCode: 404 });
                },
            }),
        );
        const res = await callGuarded(client, {
            name: "clockify_shared_reports_update",
            arguments: {
                shared_report_id: REPORT_ID,
                name: "x",
                type: "SUMMARY",
                filter: SHARED_FILTER,
            },
        });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect((json.error as { code: string }).code).toBe("not_found");
        expect(json.changed).toBeUndefined();
    });
});

describe("clockify_shared_reports_delete", () => {
    it("previews on dry_run without deleting and carries an actionable next step", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, dry_run: true },
        });

        expect(res.isError).toBeFalsy();
        // No mutation on a dry run.
        expect(captured.delete).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        const data = json.data as {
            preview: {
                action: string;
                entity: string;
                id: string;
                request: { workspaceId: string; sharedReportId: string };
            };
            confirm_token: string;
            risk_class: string;
        };
        expect(data.preview).toEqual({
            action: "delete",
            entity: "shared_report",
            id: REPORT_ID,
            request: { workspaceId: "ws-1", sharedReportId: REPORT_ID },
        });
        expect(data.risk_class).toBe("destructive");
        expect(typeof data.confirm_token).toBe("string");
        // The `next` action re-invokes the same tool with the issued token.
        const next = json.next as Array<{ tool: string; args: { confirm_token: string } }>;
        expect(next[0]?.tool).toBe("clockify_shared_reports_delete");
        expect(next[0]?.args.confirm_token).toBe(data.confirm_token);
    });

    it("deletes once a valid confirm_token is replayed and emits a deleted receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));

        const preview = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, confirm_token: token },
        });

        expect(res.isError).toBeFalsy();
        expect(captured.delete).toEqual({ workspaceId: "ws-1", sharedReportId: REPORT_ID });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("shared_report");
        expect(json.data as { deleted: boolean; sharedReportId: string }).toEqual({
            deleted: true,
            sharedReportId: REPORT_ID,
        });
        expect((json.meta as { sharedReportId: string }).sharedReportId).toBe(REPORT_ID);
        const changed = json.changed as { deleted: Array<{ type: string; id: string }> };
        expect(changed.deleted).toEqual([{ type: "shared_report", id: REPORT_ID }]);
    });

    it("refuses to delete with no dry_run and no token, instructing a dry_run first", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        const json = envelope(res);
        expect(json.ok).toBe(false);
        expect(JSON.stringify(json)).toMatch(/dry_run/i);
    });

    it("rejects a bogus confirm_token and never reaches the delete call", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));
        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, confirm_token: "not-a-real-token" },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        // A tampered/unissued token is classified as a local invalid_request.
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });

    it("rejects a confirm_token issued for a different shared-report id (payload mismatch)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(sharedReportsContext(captured));

        // Issue a token for one report...
        const preview = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        // ...then try to spend it against a different report id.
        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: OTHER_REPORT_ID, confirm_token: token },
        });

        expect(res.isError).toBe(true);
        expect(captured.delete).toBeUndefined();
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
    });

    it("surfaces an upstream 403 on the confirmed delete as a structured error", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            sharedReportsContext(captured, {
                delete: async () => {
                    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
                },
            }),
        );

        const preview = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, dry_run: true },
        });
        const token = (envelope(preview).data as { confirm_token: string }).confirm_token;

        const res = await client.callTool({
            name: "clockify_shared_reports_delete",
            arguments: { shared_report_id: REPORT_ID, confirm_token: token },
        });

        expect(res.isError).toBe(true);
        const json = envelope(res);
        expect(json.ok).toBe(false);
        // 403 -> auth_or_permission; the destructive write was attempted (guard passed) then failed upstream.
        expect(json.error as { code: string; message: string }).toEqual({
            code: "auth_or_permission",
            message: "Forbidden",
        });
    });
});
