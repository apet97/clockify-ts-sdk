import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import type { Context } from "../src/client.js";

const fakeUser = { id: "user-1", email: "alice@example.com", name: "Alice" };

function fakeContext(overrides?: { listInProgress?: () => Promise<unknown>; projectsList?: (req: unknown) => Promise<unknown[]> }): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: { getCurrentUser: async () => fakeUser },
            timeEntries: {
                listInProgress: overrides?.listInProgress ?? (async () => []),
                listForUser: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "te-1", ...body }),
                stopTimer: async () => ({ id: "te-1", stopped: true }),
                delete: async () => ({}),
            },
            projects: {
                list: overrides?.projectsList ?? (async () => [{ id: "p1", name: "Proj" }]),
                create: async (body: Record<string, unknown>) => ({ id: "p2", ...body }),
            },
            clients: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "c1", ...body }),
            },
            tasks: { list: async () => [] },
            tags: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "t1", ...body }),
            },
        } as never,
    };
}

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

describe("@clockify/mcp-server", () => {
    it("advertises every tool we registered", async () => {
        const client = await connect(fakeContext());
        const list = await client.listTools();
        const names = list.tools.map((t) => t.name).sort();
        expect(names).toEqual(
            [
                "clockify_clients_create",
                "clockify_clients_list",
                "clockify_entries_delete",
                "clockify_entries_list",
                "clockify_entries_log",
                "clockify_projects_create",
                "clockify_projects_list",
                "clockify_status",
                "clockify_tags_create",
                "clockify_tags_list",
                "clockify_tasks_list",
                "clockify_timer_start",
                "clockify_timer_stop",
            ].sort(),
        );
    });

    it("clockify_status returns the canonical envelope", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBeFalsy();
        const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
        const parsed = JSON.parse(text);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.workspaceId).toBe("ws-1");
        expect(parsed.data.user.email).toBe("alice@example.com");
        expect(parsed.data.runningEntry).toBeNull();
    });

    it("clockify_projects_list passes pagination args through to the SDK", async () => {
        let captured: unknown = null;
        const client = await connect(
            fakeContext({
                projectsList: async (req) => {
                    captured = req;
                    return [{ id: "p1", name: "A" }];
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_projects_list",
            arguments: { page: 2, pageSize: 25, name: "foo" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured).toEqual({
            workspaceId: "ws-1",
            page: 2,
            "page-size": 25,
            name: "foo",
        });
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.meta.count).toBe(1);
        expect(parsed.meta.page).toBe(2);
    });

    it("clockify_entries_log rejects when neither start nor durationSeconds is given", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "missing time" },
        });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.error.message).toMatch(/start.*durationSeconds/);
    });

    it("clockify_entries_log derives start from end - durationSeconds", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "wrote tests", durationSeconds: 1800, end: "2026-05-26T10:00:00.000Z" },
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.start).toBe("2026-05-26T09:30:00.000Z");
        expect(parsed.data.end).toBe("2026-05-26T10:00:00.000Z");
    });

    it("clockify_timer_stop turns a 404 into a friendly ok envelope", async () => {
        const ctx = fakeContext();
        (ctx.client.timeEntries as unknown as { stopTimer: () => Promise<unknown> }).stopTimer = async () => {
            throw Object.assign(new Error("no running timer"), { statusCode: 404 });
        };
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_timer_stop", arguments: {} });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.running).toBe(false);
    });
});
