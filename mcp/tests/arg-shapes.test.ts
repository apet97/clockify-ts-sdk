import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { zNumberLike, zStringList } from "../src/arg-shapes.js";
import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

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

/**
 * A minimal fake client whose methods capture the wire payload. Only the methods
 * the tested tools call are stubbed; the rest are absent (unused on these paths).
 */
function minimalContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: {
                list: async () => [{ id: "Bob", name: "Bob" }],
                getCurrentUser: async () => ({ id: "me-1" }),
            },
            userGroups: {
                list: async () => [],
            },
            holidays: {
                create: async (req: unknown) => {
                    captured.holidayCreate = req;
                    return { id: "hol-1" };
                },
            },
            expenses: {
                create: async (req: unknown) => {
                    captured.expenseCreate = req;
                    return { id: "exp-1" };
                },
            },
            scheduling: {
                list: async (req: unknown) => {
                    captured.schedulingList = req;
                    return [];
                },
            },
        } as never,
    };
}

describe("arg-shapes — pure helpers", () => {
    it("zStringList: bare string \"Bob\" -> [\"Bob\"]", () => {
        expect(zStringList(z.array(z.string())).parse("Bob")).toEqual(["Bob"]);
    });

    it("zStringList: an array passes through unchanged", () => {
        expect(zStringList(z.array(z.string())).parse(["a", "b"])).toEqual(["a", "b"]);
    });

    it("zNumberLike: \"75\" -> 75", () => {
        expect(zNumberLike(z.number()).parse("75")).toBe(75);
    });

    it("zNumberLike: \"\" does NOT coerce to 0 (money-bug guard)", () => {
        expect(() => zNumberLike(z.number()).parse("")).toThrow();
    });

    it("zNumberLike: non-numeric string \"abc\" stays a type error", () => {
        expect(() => zNumberLike(z.number()).parse("abc")).toThrow();
    });

    it("zNumberLike: constraints apply after coercion", () => {
        expect(() => zNumberLike(z.number().int()).parse("3.5")).toThrow();
        expect(zNumberLike(z.number().int().min(1).default(1)).parse(undefined)).toBe(1);
    });
});

describe("arg-shapes — end-to-end coercion through the MCP server", () => {
    it("clockify_holidays_create coerces userIds:\"Bob\" to [\"Bob\"] before the wire", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(minimalContext(captured));
        const res = await client.callTool({
            name: "clockify_holidays_create",
            arguments: {
                name: "X",
                startDate: "2026-01-01",
                endDate: "2026-01-01",
                userIds: "Bob",
                everyoneIncludingNew: false,
            },
        });
        expect(res.isError).toBeFalsy();
        const body = captured.holidayCreate as Record<string, unknown>;
        expect(body.users).toEqual({ contains: "CONTAINS", ids: ["Bob"], status: "ALL" });
    });

    it("clockify_expenses_create coerces amount:\"75\" to 75", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(minimalContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_create",
            arguments: {
                amount: "75",
                categoryId: "000000000000000000000101",
                projectId: "proj-1",
                date: "2026-01-01",
            },
        });
        expect(res.isError).toBeFalsy();
        const body = captured.expenseCreate as Record<string, unknown>;
        expect(body.amount).toBe(75);
    });

    it("clockify_expenses_create rejects amount:\"\" without silently zeroing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(minimalContext(captured));
        const res = await client.callTool({
            name: "clockify_expenses_create",
            arguments: {
                amount: "",
                categoryId: "000000000000000000000101",
                projectId: "proj-1",
                date: "2026-01-01",
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.expenseCreate).toBeUndefined();
        const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "";
        expect(text).toContain("amount");
    });

    it("clockify_scheduling_assignments_list coerces page:\"2\"/pageSize:\"10\"", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(minimalContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_list",
            arguments: { page: "2", pageSize: "10" },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.schedulingList as Record<string, unknown>;
        expect(req.page).toBe(2);
        expect(req["page-size"]).toBe(10);
    });

    it("argument forgiveness does not change the model-visible JSON Schema", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(minimalContext(captured));
        const tools = (await client.listTools()).tools;
        const holiday = tools.find((t) => t.name === "clockify_holidays_create");
        // userIds stays a plain array-of-string in the published schema (preprocess unwrapped).
        expect((holiday?.inputSchema.properties as Record<string, unknown>).userIds).toEqual({
            type: "array",
            items: { type: "string" },
            description: "Assign to these users (sent as a CONTAINS filter).",
        });
        const expense = tools.find((t) => t.name === "clockify_expenses_create");
        expect((expense?.inputSchema.properties as Record<string, unknown>).amount).toEqual({
            type: "number",
        });
        // page keeps its integer + default(1) (preprocess does not erase the default).
        const sched = tools.find((t) => t.name === "clockify_scheduling_assignments_list");
        expect((sched?.inputSchema.properties as Record<string, unknown>).page).toEqual({
            type: "integer",
            minimum: 1,
            default: 1,
        });
    });
});
