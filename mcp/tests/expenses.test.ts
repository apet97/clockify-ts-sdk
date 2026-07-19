import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

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
                list: async () => [
                    {
                        id: CATEGORY_ID,
                        name: "Travel",
                        unit: "",
                        priceInCents: 0,
                        hasUnitPrice: false,
                    },
                ],
                update: async (req: unknown) => {
                    captured.categoryUpdate = req;
                    return { id: CATEGORY_ID };
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

describe("expense create/update tools", () => {
    it("clockify_expenses_create defaults the user to the API-key owner and pins the workspace", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
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

    it("clockify_expenses_create promotes a date-only date to RFC3339 (wire requires it)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_create",
            arguments: {
                amount: 5,
                categoryId: CATEGORY_ID,
                projectId: "proj-1",
                date: "2026-06-01",
                userId: "user-9",
            },
        });
        expect(res.isError).toBeFalsy();
        // A bare YYYY-MM-DD 400s "invalid value for field: [date]" on the wire
        // (live-verified); the tool promotes it to midnight UTC.
        expect((captured.create as { date: string }).date).toBe("2026-06-01T00:00:00Z");
    });

    it("clockify_expenses_create honors an explicit userId", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        await callGuarded(client, {
            name: "clockify_expenses_create",
            arguments: {
                amount: 5,
                categoryId: CATEGORY_ID,
                projectId: "proj-1",
                date: "d",
                userId: "user-9",
            },
        });
        expect((captured.create as { userId?: string }).userId).toBe("user-9");
    });

    it("clockify_expenses_create resolves an exact category name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
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
        const res = await callGuarded(client, {
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
        const res = await callGuarded(client, {
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: CATEGORY_ID,
                date: "2026-06-01T00:00:00Z",
                billable: true,
                file: "receipt-ref",
            },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as {
            body: Record<string, unknown> & { changeFields: string[] };
        };
        expect(update).toMatchObject({ workspaceId: "ws-1", expenseId: "exp-1" });
        expect(update.body).toMatchObject({
            file: "receipt-ref",
            userId: "user-1",
            amount: 10,
            categoryId: CATEGORY_ID,
            date: "2026-06-01T00:00:00Z",
            billable: true,
        });
        expect(new Set(update.body.changeFields)).toEqual(
            new Set(["AMOUNT", "DATE", "CATEGORY", "BILLABLE", "FILE"]),
        );
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.meta as { expenseId?: string }).expenseId).toBe("exp-1");
    });

    it("clockify_expenses_update resolves an exact category name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: "Travel",
                date: "2026-06-01T00:00:00Z",
                file: "receipt-ref",
            },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as {
            body: Record<string, unknown> & { changeFields: string[] };
        };
        expect(update.body.categoryId).toBe(CATEGORY_ID);
        expect(update.body.changeFields).toContain("CATEGORY");
    });

    it("dispatches a validated no-file update despite the stale generated requiredness", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: CATEGORY_ID,
                date: "2026-06-01T00:00:00Z",
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            expenseId: "exp-1",
            body: {
                amount: 10,
                categoryId: CATEGORY_ID,
                changeFields: ["AMOUNT", "DATE", "CATEGORY"],
                date: "2026-06-01T00:00:00Z",
                userId: "user-1",
            },
        });
    });

    it("uses only strict operation fields and cannot inject arbitrary request properties", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_update",
            arguments: {
                expenseId: "exp-1",
                amount: 10,
                categoryId: CATEGORY_ID,
                date: "2026-06-01T00:00:00Z",
                file: "receipt-ref",
                extra: { injected: true, workspaceId: "evil", amount: 999, file: "evil-file" },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            expenseId: "exp-1",
            body: {
                amount: 10,
                categoryId: CATEGORY_ID,
                changeFields: ["AMOUNT", "DATE", "CATEGORY", "FILE"],
                date: "2026-06-01T00:00:00Z",
                file: "receipt-ref",
                userId: "user-1",
            },
        });
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

describe("expense category full-replacement update", () => {
    it("list-scans current state and preserves empty, zero, and false fields", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_categories_update",
            arguments: { categoryId: CATEGORY_ID, name: "Travel costs" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.categoryUpdate).toEqual({
            workspaceId: "ws-1",
            categoryId: CATEGORY_ID,
            body: { name: "Travel costs", unit: "", priceInCents: 0, hasUnitPrice: false },
        });
    });

    it("rejects a no-op before mutation", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(expensesContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_expenses_categories_update",
            arguments: { categoryId: CATEGORY_ID, name: "Travel" },
        });
        expect(res.isError).toBe(true);
        expect(captured.categoryUpdate).toBeUndefined();
    });

    it("stops when a full category page repeats", async () => {
        let calls = 0;
        const repeated = Array.from({ length: 200 }, (_, index) => ({
            id: `other-${index}`,
            name: `Other ${index}`,
        }));
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                expenseCategories: {
                    list: async () => {
                        calls += 1;
                        if (calls > 2) throw new Error("repeated scan did not terminate");
                        return repeated;
                    },
                    update: async () => {
                        throw new Error("update must not run");
                    },
                },
            } as never,
        };
        const client = await connect(ctx);
        const res = await callGuarded(client, {
            name: "clockify_expenses_categories_update",
            arguments: { categoryId: CATEGORY_ID, name: "Renamed" },
        });
        expect(res.isError).toBe(true);
        expect(calls).toBe(2);
    });
});

describe("clockify_expenses_list — shared bounded client-side filter", () => {
    function listContext(
        list: (request: Record<string, unknown>) => Promise<unknown>,
        captured: Record<string, unknown>,
    ): Context {
        return {
            workspaceId: "ws-1",
            client: {
                expenses: {
                    list: async (request: Record<string, unknown>) => {
                        const calls = (captured.calls ??= []) as Record<string, unknown>[];
                        calls.push(request);
                        return list(request);
                    },
                },
            } as never,
        };
    }

    it("walks typed nested pages, applies total limit, and propagates warning/next metadata", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            listContext(async (request) => {
                const page = request.page as number;
                const pages: Record<number, Array<Record<string, unknown>>> = {
                    2: [
                        { id: "before", date: "2026-05-31" },
                        { id: "first", date: "2026-06-01" },
                    ],
                    3: [
                        { id: "outside", date: "2026-07-01" },
                        { id: "middle", date: "2026-06-15T12:00:00Z" },
                    ],
                    4: [
                        { id: "last", date: "2026-06-30T23:59:59Z" },
                        { id: "later", date: "2026-06-20" },
                    ],
                };
                return { expenses: { expenses: pages[page] ?? [], count: 2 } };
            }, captured),
        );
        const res = await client.callTool({
            name: "clockify_expenses_list",
            arguments: {
                page: 2,
                pageSize: 2,
                limit: 3,
                maxPages: 3,
                start: "2026-06-01",
                end: "2026-06-30T23:59:59Z",
            },
        });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        expect((json.data as Array<{ id: string }>).map((item) => item.id)).toEqual([
            "first",
            "middle",
            "last",
        ]);
        expect(captured.calls).toEqual([
            expect.objectContaining({ page: 2, "page-size": 2 }),
            expect.objectContaining({ page: 3, "page-size": 2 }),
            expect.objectContaining({ page: 4, "page-size": 2 }),
        ]);
        expect(captured.calls).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ start: expect.anything() })]),
        );
        expect(json.meta).toMatchObject({
            count: 3,
            page: 2,
            pageSize: 2,
            limit: 3,
            pagesFetched: 3,
            nextPage: 4,
            nextOffset: 1,
            hasMore: true,
        });
        expect(json.warnings).toEqual([
            expect.objectContaining({
                code: "client_side_filter",
                message: expect.stringMatching(/client-side/i),
            }),
        ]);
        expect(json.next).toEqual([
            expect.objectContaining({
                tool: "clockify_expenses_list",
                args: expect.objectContaining({ page: 4, offset: 1, pageSize: 2, limit: 3 }),
            }),
        ]);

        const continuation = (
            json.next as Array<{ tool: string; args: Record<string, unknown> }> | undefined
        )?.[0];
        if (continuation === undefined) throw new Error("expected a runnable continuation");
        const resumed = envelope(
            await client.callTool({
                name: continuation.tool,
                arguments: continuation.args,
            }),
        );
        expect((resumed.data as Array<{ id: string }>).map((item) => item.id)).toEqual(["later"]);
        expect(resumed.meta).toMatchObject({ hasMore: false });
    });

    it("rejects unsafe page bounds before listing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            listContext(async () => ({ expenses: { expenses: [] } }), captured),
        );
        const res = await client.callTool({
            name: "clockify_expenses_list",
            arguments: { page: 1_000_001 },
        });
        expect(res.isError).toBe(true);
        expect(captured.calls).toBeUndefined();
    });

    it("rejects a tampered continuation offset before listing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            listContext(async () => ({ expenses: { expenses: [] } }), captured),
        );
        const res = await client.callTool({
            name: "clockify_expenses_list",
            arguments: { pageSize: 2, offset: 2 },
        });
        expect(res.isError).toBe(true);
        expect(captured.calls).toBeUndefined();
    });
});
