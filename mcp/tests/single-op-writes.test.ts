import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function captureContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            timeEntries: {
                markInvoiced: async (req: unknown) => {
                    captured.markInvoiced = req;
                    return undefined;
                },
            },
            approvals: {
                resubmit: async (req: unknown) => {
                    captured.resubmit = req;
                    return { id: "approval-1" };
                },
            },
            invoiceItems: {
                import: async (req: unknown) => {
                    captured.import = req;
                    return { id: "inv-1" };
                },
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

describe("single-operation write tools", () => {
    it("clockify_entries_mark_invoiced defaults invoiced to true and passes the ids through", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(captureContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_entries_mark_invoiced",
            arguments: { timeEntryIds: ["te-1", "te-2"] },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.markInvoiced).toEqual({
            workspaceId: "ws-1",
            timeEntryIds: ["te-1", "te-2"],
            invoiced: true,
        });
        expect((envelope(res).meta as { count?: number }).count).toBe(2);
    });

    it("clockify_approvals_resubmit forwards period and periodStart", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(captureContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_approvals_resubmit",
            arguments: { period: "MONTHLY", periodStart: "2026-06-01T00:00:00Z" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.resubmit).toEqual({
            workspaceId: "ws-1",
            period: "MONTHLY",
            periodStart: "2026-06-01T00:00:00Z",
        });
    });

    it("clockify_invoices_import_time applies defaults and pins the invoice + workspace", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(captureContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_invoices_import_time",
            arguments: {
                invoiceId: "inv-1",
                from: "2026-05-01T00:00:00Z",
                to: "2026-05-31T00:00:00Z",
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.import).toEqual({
            workspaceId: "ws-1",
            invoiceId: "inv-1",
            body: {
                from: "2026-05-01T00:00:00Z",
                to: "2026-05-31T00:00:00Z",
                importExpenses: false,
                timeEntryGroupType: "GROUPED",
                projectFilter: { status: "ACTIVE" },
            },
        });
    });
});
