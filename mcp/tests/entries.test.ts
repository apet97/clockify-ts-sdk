import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
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

const ME = { id: "user-1", name: "Me" };

describe("clockify_entries_list", () => {
    it("lists the current user's entries with the right request + paginated receipt", async () => {
        const listForUser = vi.fn(async (_req: unknown) => [{ id: "e1" }, { id: "e2" }]);
        const client = await connect({
            workspaceId: "ws-1",
            client: {
                users: { getCurrentUser: async () => ME },
                timeEntries: { listForUser },
            } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_list",
            arguments: { pageSize: 2, description: "standup", start: "2026-06-01T00:00:00Z" },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        expect(listForUser).toHaveBeenCalledTimes(1);
        const req = listForUser.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(req).toMatchObject({
            workspaceId: "ws-1",
            userId: "user-1",
            "page-size": 2,
            description: "standup",
            start: "2026-06-01T00:00:00Z",
        });
    });

    it("errors when getCurrentUser yields no id (never lists)", async () => {
        const listForUser = vi.fn();
        const client = await connect({
            workspaceId: "ws-1",
            client: {
                users: { getCurrentUser: async () => ({}) },
                timeEntries: { listForUser },
            } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_list",
            arguments: {},
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(listForUser).not.toHaveBeenCalled();
    });
});

describe("clockify_entries_log", () => {
    it("creates a finished entry from an explicit start + end", async () => {
        const create = vi.fn(async (req: unknown) => ({ id: "new-1", ...(req as object) }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { create } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_log",
            arguments: {
                description: "deep work",
                start: "2026-06-01T09:00:00Z",
                end: "2026-06-01T11:00:00Z",
                projectId: "p1",
                billable: true,
            },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        const body = (create.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body;
        expect(body).toMatchObject({
            start: "2026-06-01T09:00:00Z",
            end: "2026-06-01T11:00:00Z",
            description: "deep work",
            projectId: "p1",
            billable: true,
        });
    });

    it("computes start from durationSeconds anchored on end", async () => {
        const create = vi.fn(async (_req: unknown) => ({ id: "new-2" }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { create } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_log",
            arguments: {
                description: "meeting",
                end: "2026-06-01T10:00:00.000Z",
                durationSeconds: 3600,
            },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        const body = (create.mock.calls[0]?.[0] as { body: Record<string, unknown> }).body;
        expect(body.start).toBe("2026-06-01T09:00:00.000Z");
        expect(body.end).toBe("2026-06-01T10:00:00.000Z");
    });

    it("errors when neither start nor durationSeconds is given (never creates)", async () => {
        const create = vi.fn();
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { create } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "no anchor" },
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(create).not.toHaveBeenCalled();
    });
});

describe("clockify_entries_mark_invoiced", () => {
    it("emits one EntityRef per id (not a single comma-joined ref)", async () => {
        const markInvoiced = vi.fn(async () => ({}));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { markInvoiced } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_mark_invoiced",
            arguments: { timeEntryIds: ["e1", "e2", "e3"] },
        })) as { isError?: boolean; content: Array<{ text: string }> };

        expect(res.isError).toBeFalsy();
        expect(markInvoiced).toHaveBeenCalledTimes(1);
        const env = JSON.parse(res.content[0]?.text ?? "{}") as {
            changed?: { updated?: Array<{ type: string; id: string }> };
        };
        // One ref per id — no comma-joined "e1,e2,e3" id.
        expect(env.changed?.updated).toEqual([
            { type: "time_entry", id: "e1" },
            { type: "time_entry", id: "e2" },
            { type: "time_entry", id: "e3" },
        ]);
    });
});

describe("clockify_entries_get / clockify_entries_update", () => {
    it("gets one entry by id", async () => {
        const get = vi.fn(async () => ({ id: "e9", description: "x" }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { get } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_get",
            arguments: { timeEntryId: "e9" },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        expect(get).toHaveBeenCalledWith({ workspaceId: "ws-1", timeEntryId: "e9" });
    });

    it("updates an entry, carrying the required start in the body", async () => {
        const update = vi.fn(async (req: unknown) => ({ id: "e9", ...(req as object) }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { update } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_update",
            arguments: {
                timeEntryId: "e9",
                start: "2026-06-01T09:00:00Z",
                description: "renamed",
            },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        const req = update.mock.calls[0]?.[0] as {
            timeEntryId: string;
            body: Record<string, unknown>;
        };
        expect(req.timeEntryId).toBe("e9");
        expect(req.body).toMatchObject({ start: "2026-06-01T09:00:00Z", description: "renamed" });
    });
});
