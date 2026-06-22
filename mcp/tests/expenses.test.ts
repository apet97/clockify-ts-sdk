import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};
const CATEGORY_ID = "000000000000000000000101";

afterEach(async () => {
    await teardown();
});

function expensesContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: { getCurrentUser: async () => ({ id: "user-1" }) },
            expenses: {
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "exp-1" };
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "exp-1" };
                },
            },
            expenseCategories: {
                list: async () => [{ id: CATEGORY_ID, name: "Travel" }],
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

describe("expense create/update tools", () => {
    it("clockify_expenses_create defaults the user to the API-key owner and pins the workspace", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_create",
            arguments: {
                amount: 42.5,
                categoryId: CATEGORY_ID,
                projectId: "proj-1",
                date: "2026-06-01T00:00:00Z",
                notes: "Taxi",
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.create).toEqual({
            workspaceId: "ws-1",
            userId: "user-1",
            amount: 42.5,
            categoryId: CATEGORY_ID,
            projectId: "proj-1",
            date: "2026-06-01T00:00:00Z",
            notes: "Taxi",
        });
        expect(envelope(res).ok).toBe(true);
    });

    it("clockify_expenses_create honors an explicit userId", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        await client.callTool({
            name: "clockify_expenses_create",
            arguments: { amount: 5, categoryId: CATEGORY_ID, projectId: "proj-1", date: "d", userId: "user-9" },
        });
        expect((captured.create as { userId?: string }).userId).toBe("user-9");
    });

    it("clockify_expenses_create resolves an exact category name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_create",
            arguments: {
                amount: 12,
                categoryId: "Travel",
                projectId: "proj-1",
                date: "2026-06-01T00:00:00Z",
            },
        });
        expect(res.isError).toBeFalsy();
        expect((captured.create as { categoryId?: string }).categoryId).toBe(CATEGORY_ID);
    });

    it("clockify_expenses_create rejects an unknown category name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_create",
            arguments: {
                amount: 12,
                categoryId: "Not a category",
                projectId: "proj-1",
                date: "2026-06-01T00:00:00Z",
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("clockify_expenses_update derives changeFields from supplied fields", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: CATEGORY_ID,
                date: "2026-06-01T00:00:00Z",
                billable: true,
            },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as Record<string, unknown> & { changeFields: string[] };
        expect(update).toMatchObject({
            workspaceId: "ws-1",
            expenseId: "exp-1",
            userId: "user-1",
            amount: 10,
            categoryId: CATEGORY_ID,
            date: "2026-06-01T00:00:00Z",
            billable: true,
        });
        expect(new Set(update.changeFields)).toEqual(new Set(["AMOUNT", "DATE", "CATEGORY", "BILLABLE"]));
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { expenseId?: string }).expenseId).toBe("exp-1");
    });

    it("clockify_expenses_update resolves an exact category name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: "Travel",
                date: "2026-06-01T00:00:00Z",
            },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as Record<string, unknown> & { changeFields: string[] };
        expect(update.categoryId).toBe(CATEGORY_ID);
        expect(update.changeFields).toContain("CATEGORY");
    });

    it("clockify_expenses_categories_list unwraps the {categories,count} envelope", async () => {
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                expenseCategories: {
                    list: async () => ({
                        categories: [
                            { id: "cat-1", name: "Travel" },
                            { id: "cat-2", name: "Meals" },
                        ],
                        count: 2,
                    }),
                },
            } as never,
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_expenses_categories_list",
            arguments: {},
        });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { count?: number }).count).toBe(2);
        expect(Array.isArray(json.data)).toBe(true);
        expect((json.data as unknown[]).length).toBe(2);
    });
});

describe("clockify_expenses_list — narrows the live list envelope (TEST-02)", () => {
    function listContext(response: unknown, captured: Record<string, unknown>): Context {
        return {
            workspaceId: "ws-1",
            client: {
                expenses: {
                    list: async (req: unknown) => {
                        captured.list = req;
                        return response;
                    },
                },
            } as never,
        };
    }

    const A = { id: "exp-a" };
    const B = { id: "exp-b" };

    // The prior shipping bug returned count:undefined because the nested
    // {expenses:{expenses,count}} envelope was not unwrapped. Pin every tolerated
    // shape so a regression in the narrowing closure is caught offline.
    it.each([
        ["nested {expenses:{expenses,count}}", { expenses: { expenses: [A, B], count: 2 } }],
        ["single-level {expenses:[...]}", { expenses: [A, B] }],
        ["bare array", [A, B]],
    ])("unwraps the %s shape to a 2-item list", async (_label, response) => {
        const captured: Record<string, unknown> = {};
        const client = await connect(listContext(response, captured));
        const res = await client.callTool({ name: "clockify_expenses_list", arguments: {} });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        expect(Array.isArray(json.data)).toBe(true);
        expect((json.data as unknown[]).length).toBe(2);
        expect((json.meta as { count: number }).count).toBe(2);
    });
});
