import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

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

function responseAware<T>(data: T, headers: Record<string, string>) {
    const promise = Promise.resolve(data) as Promise<T> & {
        withRawResponse(): Promise<{ data: T; rawResponse: { headers: Headers } }>;
    };
    promise.withRawResponse = async () => ({ data, rawResponse: { headers: new Headers(headers) } });
    return promise;
}

function envelope(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

describe("clockify_entries_list", () => {
    it("lists the current user's entries with the right request + paginated receipt", async () => {
        const listForUser = vi.fn((_request: Record<string, unknown>) =>
            responseAware([{ id: "e1" }, { id: "e2" }], { "Last-Page": "false" }),
        );
        const client = await connect({
            workspaceId: "ws-1",
            client: {
                users: { getCurrentUser: async () => ME },
                timeEntries: { listForUser },
            } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_list",
            arguments: { pageSize: 3, description: "standup", start: "2026-06-01T00:00:00Z" },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        expect(listForUser).toHaveBeenCalledTimes(1);
        const req = listForUser.mock.calls[0]![0];
        expect(req).toMatchObject({
            workspaceId: "ws-1",
            userId: "user-1",
            "page-size": 3,
            description: "standup",
            start: "2026-06-01T00:00:00Z",
        });
        const meta = envelope(res).meta as { hasMore?: boolean; lastPageHeader?: boolean };
        expect(meta.hasMore).toBe(true);
        expect(meta.lastPageHeader).toBe(false);
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

    it("returns the wire entity, not a body-shadowed merge — the server's own timeInterval wins", async () => {
        // Regression: the response used to be {...entry, ...body}. entry never
        // has flat start/end (only nested timeInterval), so the merge added
        // phantom top-level start/end duplicating timeInterval, AND could
        // shadow any field the server normalizes on write (e.g. millisecond
        // truncation, live-verified 2026-08-07) with the pre-request value.
        const sentStart = "2026-06-01T09:00:00.000Z";
        const sentEnd = "2026-06-01T11:00:00.000Z";
        const wireEntry = {
            id: "te-1",
            description: "deep work",
            // Server truncates milliseconds on write — the wire value differs
            // from what was sent.
            timeInterval: { start: "2026-06-01T09:00:00Z", end: "2026-06-01T11:00:00Z", duration: "PT2H" },
        };
        const create = vi.fn(async () => wireEntry);
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { create } } as never,
        });

        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "deep work", start: sentStart, end: sentEnd },
        });

        const data = envelope(res).data as Record<string, unknown>;
        expect(data).toEqual(wireEntry);
        expect(data.start).toBeUndefined();
        expect(data.end).toBeUndefined();
        expect((data.timeInterval as { start?: string }).start).toBe("2026-06-01T09:00:00Z");
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

    it("classifies a garbage end as invalid_request, not the catch-all code", async () => {
        const create = vi.fn();
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { create } } as never,
        });

        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "bad end", durationSeconds: 600, end: "nope" },
        });

        expect((res as { isError?: boolean }).isError).toBe(true);
        const env = envelope(res);
        expect((env.error as { code: string }).code).toBe("invalid_request");
        expect((env.error as { message: string }).message).toMatch(
            /not a valid ISO 8601 timestamp/,
        );
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

        const res = (await callGuarded(client, {
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

    it("refuses a bare call: an unconfirmed replace never reaches the client", async () => {
        const update = vi.fn(async (req: unknown) => ({ id: "e9", ...(req as object) }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { update } } as never,
        });

        const res = await client.callTool({
            name: "clockify_entries_update",
            arguments: { timeEntryId: "e9", start: "2026-06-01T09:00:00Z" },
        });

        // The whole point of the guard: this call clears every omitted field,
        // so it must not be reachable without a dry_run the caller has read.
        expect(res.isError).toBe(true);
        expect(update).not.toHaveBeenCalled();
    });

    it("updates an entry, carrying the required start in the body", async () => {
        const update = vi.fn(async (req: unknown) => ({ id: "e9", ...(req as object) }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { update } } as never,
        });

        const res = await callGuarded(client, {
            name: "clockify_entries_update",
            arguments: {
                timeEntryId: "e9",
                start: "2026-06-01T09:00:00Z",
                description: "renamed",
            },
        });

        expect(res.isError).toBeFalsy();
        const req = update.mock.calls[0]?.[0] as {
            timeEntryId: string;
            body: Record<string, unknown>;
        };
        expect(req.timeEntryId).toBe("e9");
        expect(req.body).toMatchObject({ start: "2026-06-01T09:00:00Z", description: "renamed" });
    });

    it("forwards every optional field into the replace-PUT body", async () => {
        const update = vi.fn(async (req: unknown) => ({ id: "e9", ...(req as object) }));
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { update } } as never,
        });

        const res = await callGuarded(client, {
            name: "clockify_entries_update",
            arguments: {
                timeEntryId: "e9",
                start: "2026-06-01T09:00:00Z",
                end: "2026-06-01T10:00:00Z",
                description: "renamed",
                projectId: "p-1",
                taskId: "t-1",
                tagIds: ["tag-1"],
                billable: false,
            },
        });

        expect(res.isError).toBeFalsy();
        // One call: the dry_run must preview without touching the client.
        expect(update).toHaveBeenCalledTimes(1);
        const req = update.mock.calls[0]?.[0] as { body: Record<string, unknown> };
        // toEqual, not toMatchObject: a dropped optional must red.
        expect(req.body).toEqual({
            start: "2026-06-01T09:00:00Z",
            end: "2026-06-01T10:00:00Z",
            description: "renamed",
            projectId: "p-1",
            taskId: "t-1",
            tagIds: ["tag-1"],
            billable: false,
        });
    });
});

describe("clockify_entries_get_many", () => {
    it("sends the ID list in the request body and reports both counts", async () => {
        const calls: unknown[] = [];
        const getMultipleTimeEntries = async (req: unknown) => {
            calls.push(req);
            return [{ id: "e1" }, { id: "e2" }];
        };
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { getMultipleTimeEntries } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_get_many",
            arguments: { timeEntryIds: ["e1", "e2", "missing"] },
        })) as { isError?: boolean };

        expect(res.isError).toBeFalsy();
        expect(calls).toEqual([
            { workspaceId: "ws-1", body: { timeEntryIds: ["e1", "e2", "missing"] } },
        ]);
        // The endpoint drops IDs it cannot resolve, so the two counts differ.
        expect(envelope(res).meta).toMatchObject({ requestedCount: 3, count: 2 });
    });

    it("forwards hydrated only when given", async () => {
        const calls: unknown[] = [];
        const getMultipleTimeEntries = async (req: unknown) => {
            calls.push(req);
            return [];
        };
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { getMultipleTimeEntries } } as never,
        });

        await client.callTool({
            name: "clockify_entries_get_many",
            arguments: { timeEntryIds: ["e1"], hydrated: true },
        });

        expect(calls).toEqual([
            { workspaceId: "ws-1", body: { timeEntryIds: ["e1"], hydrated: true } },
        ]);
    });

    it("rejects an empty ID list before calling the wire", async () => {
        const calls: unknown[] = [];
        const getMultipleTimeEntries = async (req: unknown) => {
            calls.push(req);
            return [];
        };
        const client = await connect({
            workspaceId: "ws-1",
            client: { timeEntries: { getMultipleTimeEntries } } as never,
        });

        const res = (await client.callTool({
            name: "clockify_entries_get_many",
            arguments: { timeEntryIds: [] },
        })) as { isError?: boolean };

        expect(res.isError).toBe(true);
        expect(calls).toEqual([]);
    });
});
