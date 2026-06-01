import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

// Capture each report request so we can assert the workspace, body, and merged
// `extra` reach the SDK; the returned payload is echoed back as the receipt data.
function reportsContext(captured: Record<string, unknown>): Context {
    const capture = (method: string) => async (req: unknown) => {
        captured[method] = req;
        return { method, ...(req as Record<string, unknown>) };
    };
    return {
        workspaceId: "ws-1",
        client: {
            reports: {
                summary: capture("summary"),
                detailed: capture("detailed"),
                weekly: capture("weekly"),
                attendance: capture("attendance"),
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

describe("reports tools", () => {
    it("registers the four report tools as read-only", async () => {
        const client = await connect(reportsContext({}));
        const tools = (await client.listTools()).tools.filter((tool) => tool.name.startsWith("clockify_reports_"));
        expect(tools.map((tool) => tool.name).sort()).toEqual([
            "clockify_reports_attendance",
            "clockify_reports_detailed",
            "clockify_reports_summary",
            "clockify_reports_weekly",
        ]);
        expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    });

    it("clockify_reports_summary passes workspace, core, and filter through with no change set", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_summary",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                summaryFilter: { groups: ["PROJECT"] },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.summary).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            summaryFilter: { groups: ["PROJECT"] },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        expect(json.entity).toBe("report");
    });

    it("clockify_reports_detailed merges extra fields into the SDK request", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        const res = await client.callTool({
            name: "clockify_reports_detailed",
            arguments: {
                dateRangeStart: "2026-06-01T00:00:00Z",
                dateRangeEnd: "2026-06-30T23:59:59Z",
                detailedFilter: { page: 1, pageSize: 50 },
                extra: { rounding: true, users: { ids: ["u-1"] } },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.detailed).toEqual({
            workspaceId: "ws-1",
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            detailedFilter: { page: 1, pageSize: 50 },
            rounding: true,
            users: { ids: ["u-1"] },
        });
        expect(envelope(res).ok).toBe(true);
    });

    it("clockify_reports_weekly and clockify_reports_attendance reach their SDK methods", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(reportsContext(captured));
        await client.callTool({
            name: "clockify_reports_weekly",
            arguments: { dateRangeStart: "s", dateRangeEnd: "e", weeklyFilter: { group: "USER" } },
        });
        await client.callTool({
            name: "clockify_reports_attendance",
            arguments: { dateRangeStart: "s", dateRangeEnd: "e", attendanceFilter: { users: { ids: ["u-1"] } } },
        });
        expect(captured.weekly).toMatchObject({ workspaceId: "ws-1", weeklyFilter: { group: "USER" } });
        expect(captured.attendance).toMatchObject({ workspaceId: "ws-1", attendanceFilter: { users: { ids: ["u-1"] } } });
    });
});
