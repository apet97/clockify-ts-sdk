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

// 24-hex ids so the resolvers treat them as real ids (a non-hex ref is a name).
const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SAM1 = "cccccccccccccccccccccccc";
const SAM2 = "dddddddddddddddddddddddd";
const ME = "eeeeeeeeeeeeeeeeeeeeeeee";
const ENG = "ffffffffffffffffffffffff";

function holidaysContext(
    captured: Record<string, unknown>,
    holiday?: Record<string, unknown>,
): Context {
    return {
        workspaceId: "ws-1",
        client: {
            holidays: {
                list: async (req: unknown) => {
                    captured.holidaysList = req;
                    return holiday ? [holiday] : [];
                },
                listInPeriod: async (req: unknown) => {
                    captured.listInPeriod = req;
                    return [];
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "hol-9" };
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "hol-1" };
                },
            },
            users: {
                list: async () => {
                    captured.usersListCalled = true;
                    return [
                        { id: ALICE, name: "Alice" },
                        { id: BOB, name: "Bob" },
                        { id: SAM1, name: "Sam" },
                        { id: SAM2, name: "Sam" },
                    ];
                },
                getCurrentUser: async () => ({ id: ME }),
            },
            userGroups: {
                list: async () => [{ id: ENG, name: "Engineering" }],
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

describe("holidays create/update resolve NAME -> id before scopeFilter", () => {
    it("holidays_create resolves a user NAME to its id before scopeFilter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_holidays_create",
            arguments: {
                name: "Holiday",
                startDate: "2026-12-25",
                endDate: "2026-12-25",
                userIds: ["Alice"],
            },
        });
        expect(res.isError).toBeFalsy();
        const create = captured.create as { users?: { ids?: string[] } };
        expect(create.users?.ids).toEqual([ALICE]);
    });

    it("holidays_create resolves a group NAME to its id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_holidays_create",
            arguments: {
                name: "Holiday",
                startDate: "2026-12-25",
                endDate: "2026-12-25",
                userGroupIds: ["Engineering"],
            },
        });
        expect(res.isError).toBeFalsy();
        const create = captured.create as { userGroups?: { ids?: string[] } };
        expect(create.userGroups?.ids).toEqual([ENG]);
    });

    it("holidays_create returns a clarification and does NOT create on an ambiguous user name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_holidays_create",
            arguments: {
                name: "Holiday",
                startDate: "2026-12-25",
                endDate: "2026-12-25",
                userIds: ["Sam"],
            },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        const clarification = env.clarification as {
            field?: string;
            candidates?: Array<{ id: string }>;
        };
        expect(clarification.field).toBe("userIds");
        expect((clarification.candidates ?? []).map((c) => c.id).sort()).toEqual(
            [SAM1, SAM2].sort(),
        );
        expect(captured.create).toBeUndefined();
    });

    it("holidays_create returns a clarification and does NOT create on an unknown user name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_holidays_create",
            arguments: {
                name: "Holiday",
                startDate: "2026-12-25",
                endDate: "2026-12-25",
                userIds: ["Nobody"],
            },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect(env.clarification).toBeDefined();
        expect(captured.create).toBeUndefined();
    });

    it("holidays_create passes a 24-hex userId through unchanged", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_holidays_create",
            arguments: {
                name: "Holiday",
                startDate: "2026-12-25",
                endDate: "2026-12-25",
                userIds: [ALICE],
            },
        });
        expect(res.isError).toBeFalsy();
        const create = captured.create as { users?: { ids?: string[] } };
        expect(create.users?.ids).toEqual([ALICE]);
    });

    it("holidays_update resolves an explicit user NAME but leaves carried-forward ids untouched", async () => {
        const captured: Record<string, unknown> = {};
        // A holiday whose existing assignment is real 24-hex ids carried forward.
        const existing = {
            id: "hol-1",
            name: "Christmas",
            datePeriod: { startDate: "2026-12-25", endDate: "2026-12-25" },
            userIds: [BOB],
        };
        const client = await connect(holidaysContext(captured, existing));
        // Explicit name replaces the assignment -> resolves "Alice" to ALICE.
        const res = await callGuarded(client, {
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", userIds: ["Alice"] },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as { users?: { ids?: string[] } };
        expect(update.users?.ids).toEqual([ALICE]);

        // And with no explicit arg, the carried-forward BOB id is sent untouched
        // (no name resolution, no rewrite).
        const captured2: Record<string, unknown> = {};
        const client2 = await connect(holidaysContext(captured2, existing));
        const res2 = await callGuarded(client2, {
            name: "clockify_holidays_update",
            arguments: { holidayId: "hol-1", name: "Xmas" },
        });
        expect(res2.isError).toBeFalsy();
        const update2 = captured2.update as { users?: { ids?: string[] } };
        expect(update2.users?.ids).toEqual([BOB]);
    });
});

describe("holidays list_in_period read-filter resolution", () => {
    it("holidays_list_in_period read-filter stays list-free for a 24-hex userId", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await client.callTool({
            name: "clockify_holidays_list_in_period",
            arguments: { userId: ALICE, start: "2026-01-01", end: "2026-12-31" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.usersListCalled).toBeFalsy();
        const listInPeriod = captured.listInPeriod as Record<string, unknown>;
        expect(listInPeriod["assigned-to"]).toBe(ALICE);
    });

    it("holidays_list_in_period resolves a user NAME for the filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await client.callTool({
            name: "clockify_holidays_list_in_period",
            arguments: { userId: "Alice", start: "2026-01-01", end: "2026-12-31" },
        });
        expect(res.isError).toBeFalsy();
        const listInPeriod = captured.listInPeriod as Record<string, unknown>;
        expect(listInPeriod["assigned-to"]).toBe(ALICE);
    });

    it("holidays_list_in_period clarifies on an unknown user and does NOT list-in-period", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(holidaysContext(captured));
        const res = await client.callTool({
            name: "clockify_holidays_list_in_period",
            arguments: { userId: "Nobody", start: "2026-01-01", end: "2026-12-31" },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured.listInPeriod).toBeUndefined();
    });
});
