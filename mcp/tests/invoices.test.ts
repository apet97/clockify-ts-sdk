import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

/**
 * Mock the invoice client. `get` returns a representative GET shape: tax/discount
 * are ×100-scaled ints, plus read-only fields (amount/status) the PUT rejects.
 */
function invoicesContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            invoices: {
                get: async (req: unknown) => {
                    captured.get = req;
                    return {
                        id: "inv-1",
                        clientId: "client-1",
                        currency: "USD",
                        number: "INV-001",
                        note: "Original note",
                        subject: "Original subject",
                        billFrom: "ACME Inc.",
                        discount: 1000, // 10%
                        tax: 1500, // 15%
                        tax2: 0,
                        amount: 99999, // read-only/computed — must not echo back
                        status: "SENT",
                    };
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "inv-1", number: "INV-001" };
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "inv-9", number: "INV-009" };
                },
                list: async (req: unknown) => {
                    captured.list = req;
                    return { invoices: [{ id: "inv-1" }, { id: "inv-2" }], total: 2 };
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

describe("clockify_invoices_update — GET-then-PUT (no silent zeroing / field wipe)", () => {
    it("GETs the current invoice, maps tax/discount to *Percent, and preserves untouched fields", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_update",
            arguments: { invoiceId: "inv-1", note: "New note" },
        });
        expect(res.isError).toBeFalsy();
        // It must read the current invoice first.
        expect(captured.get).toEqual({ workspaceId: "ws-1", invoiceId: "inv-1" });
        const update = captured.update as Record<string, unknown>;
        // The patched field applied…
        expect(update.note).toBe("New note");
        // …and the untouched ones survived the replace-semantics PUT…
        expect(update.subject).toBe("Original subject");
        expect(update.billFrom).toBe("ACME Inc.");
        expect(update.number).toBe("INV-001");
        // …and tax/discount were name+scale mapped, not zeroed…
        expect(update.taxPercent).toBe(15);
        expect(update.discountPercent).toBe(10);
        expect(update.tax2Percent).toBe(0);
        // …and read-only/raw fields never echoed back.
        expect(update.amount).toBeUndefined();
        expect(update.status).toBeUndefined();
        expect(update.discount).toBeUndefined();
        expect(update.tax).toBeUndefined();
        // Workspace + invoice id pinned for the PUT.
        expect(update.workspaceId).toBe("ws-1");
        expect(update.invoiceId).toBe("inv-1");
        expect(envelope(res).ok).toBe(true);
    });

    it("lets an explicit taxPercent/discountPercent override the carried-forward value", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        await client.callTool({
            name: "clockify_invoices_update",
            arguments: { invoiceId: "inv-1", taxPercent: 20, discountPercent: 0 },
        });
        const update = captured.update as Record<string, unknown>;
        expect(update.taxPercent).toBe(20);
        expect(update.discountPercent).toBe(0);
    });
});

describe("clockify_invoices_create — note/subject applied via follow-up PUT", () => {
    it("POSTs the minimal body then applies note/subject (POST silently drops them)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_create",
            arguments: {
                clientId: "client-1",
                number: "INV-009",
                currency: "USD",
                issuedDate: "2026-06-01",
                dueDate: "2026-07-01",
                note: "Real note",
                subject: "Real subject",
            },
        });
        expect(res.isError).toBeFalsy();
        const create = (captured.create as { body?: Record<string, unknown> }).body ?? {};
        // The create body must NOT carry note/subject — they would be dropped.
        expect(create.note).toBeUndefined();
        expect(create.subject).toBeUndefined();
        // Dates promoted to RFC3339.
        expect(create.issuedDate).toBe("2026-06-01T00:00:00Z");
        // It applied them via the GET-then-PUT path against the created id.
        expect((captured.get as { invoiceId?: string }).invoiceId).toBe("inv-9");
        const update = captured.update as Record<string, unknown>;
        expect(update.note).toBe("Real note");
        expect(update.subject).toBe("Real subject");
        expect(update.invoiceId).toBe("inv-9");
    });

    it("skips the follow-up PUT when neither note nor subject is supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        await client.callTool({
            name: "clockify_invoices_create",
            arguments: {
                clientId: "client-1",
                number: "INV-010",
                currency: "USD",
                issuedDate: "2026-06-01",
                dueDate: "2026-07-01",
            },
        });
        expect(captured.update).toBeUndefined();
        expect(captured.get).toBeUndefined();
    });
});

describe("clockify_invoices_list — typed multi-status + sort (no wireBody escape)", () => {
    it("pins only the workspace when no filters are given", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({ name: "clockify_invoices_list", arguments: {} });
        expect(res.isError).toBeFalsy();
        // No statuses/sort keys leak in when unspecified.
        expect(captured.list).toEqual({ workspaceId: "ws-1" });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { count: number; total: number }).count).toBe(2);
        expect((json.meta as { count: number; total: number }).total).toBe(2);
    });

    it("threads multiple statuses through the typed `statuses` array", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_list",
            arguments: { statuses: ["SENT", "PAID"] },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.list).toEqual({ workspaceId: "ws-1", statuses: ["SENT", "PAID"] });
    });

    it("forwards sort-column / sort-order with the hyphenated SDK keys", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_list",
            arguments: { sortColumn: "ISSUE_DATE", sortOrder: "DESCENDING" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            "sort-column": "ISSUE_DATE",
            "sort-order": "DESCENDING",
        });
    });

    it("merges a single `status` with `statuses[]` and dedupes", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_list",
            arguments: { status: "SENT", statuses: ["SENT", "VOID"] },
        });
        expect(res.isError).toBeFalsy();
        // SENT appears once; back-compat single status folds into the array.
        expect(captured.list).toEqual({ workspaceId: "ws-1", statuses: ["SENT", "VOID"] });
    });

    it("rejects an out-of-enum status at the schema boundary before any read", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(invoicesContext(captured));
        const res = await client.callTool({
            name: "clockify_invoices_list",
            arguments: { statuses: ["NOT_A_STATUS"] },
        });
        expect(res.isError).toBe(true);
        expect(captured.list).toBeUndefined();
    });
});
