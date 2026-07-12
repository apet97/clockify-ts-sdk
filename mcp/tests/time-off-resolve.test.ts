import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SAM1 = "cccccccccccccccccccccccc";
const SAM2 = "dddddddddddddddddddddddd";
const ME = "eeeeeeeeeeeeeeeeeeeeeeee";
const ENG = "ffffffffffffffffffffffff";
const POLICY_ID = "000000000000000000000301";

function existingPolicy(): Record<string, unknown> {
    return {
        id: "pol-1",
        name: "PTO",
        color: "#00ff00",
        allowHalfDay: false,
        allowNegativeBalance: true,
        approve: { requiresApproval: false },
        archived: false,
        everyoneIncludingNew: false,
        hasExpiration: false,
        userIds: [BOB],
        userGroupIds: [ENG],
    };
}

function timeOffContext(captured: Record<string, unknown>, policy = existingPolicy()): Context {
    return {
        workspaceId: "ws-1",
        client: {
            timeOffPolicies: {
                list: async () => [{ id: POLICY_ID, name: "PTO" }],
                get: async (req: unknown) => {
                    captured.get = req;
                    return policy;
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "pol-9" };
                },
                update: async (req: unknown) => {
                    captured.update = req;
                    return { id: "pol-1" };
                },
            },
            timeOff: {
                list: async (req: unknown) => {
                    captured.timeOffList = req;
                    return [];
                },
                submit: async (req: unknown) => {
                    captured.submit = req;
                    return { id: "req-1" };
                },
                changeTimeOffRequestStatus: async (req: unknown) => {
                    captured.status = req;
                    return { id: "req-1" };
                },
            },
            balances: {
                getForUser: async (req: unknown) => {
                    captured.balance = req;
                    return { balance: 0 };
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

describe("time-off policies resolve NAME -> id", () => {
    it("policies_create resolves user + group names before scopeFilter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", userIds: ["Alice"], userGroupIds: ["Engineering"] },
        });
        expect(res.isError).toBeFalsy();
        const create = captured.create as {
            users?: { ids?: string[] };
            userGroups?: { ids?: string[] };
        };
        expect(create.users?.ids).toEqual([ALICE]);
        expect(create.userGroups?.ids).toEqual([ENG]);
    });

    it("policies_create clarifies + does not create on ambiguous user name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_create",
            arguments: { name: "Sick", userIds: ["Sam"] },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userIds");
        expect(captured.create).toBeUndefined();
    });

    it("policies_update resolves explicit names, preserves carried ids", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_policies_update",
            arguments: { policyId: "pol-1", userIds: ["Alice"] },
        });
        expect(res.isError).toBeFalsy();
        const update = captured.update as {
            users?: { ids?: string[] };
            userGroups?: { ids?: string[] };
        };
        expect(update.users?.ids).toEqual([ALICE]);
        // Group not supplied -> carried-forward ENG untouched (not re-resolved).
        expect(update.userGroups?.ids).toEqual([ENG]);

        // No explicit user arg -> carried-forward BOB preserved.
        const captured2: Record<string, unknown> = {};
        const client2 = await connect(timeOffContext(captured2));
        const res2 = await client2.callTool({
            name: "clockify_time_off_policies_update",
            arguments: { policyId: "pol-1", name: "Vacation" },
        });
        expect(res2.isError).toBeFalsy();
        const update2 = captured2.update as { users?: { ids?: string[] } };
        expect(update2.users?.ids).toEqual([BOB]);
    });
});

describe("time-off requests list users filter resolution", () => {
    it("time_off_requests_list resolves names in the users filter", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_list",
            arguments: { users: ["Alice"] },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.timeOffList as { users?: string[] };
        expect(req.users).toEqual([ALICE]);
    });

    it("time_off_requests_list clarifies on an unknown user in the filter and does NOT list", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_list",
            arguments: { users: ["Nobody"] },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("users");
        expect(captured.timeOffList).toBeUndefined();
    });

    it("time_off_requests_list trusts a 24-hex user id in the filter without listing users", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_list",
            arguments: { users: [ALICE] },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.usersListCalled).toBeFalsy();
        const req = captured.timeOffList as { users?: string[] };
        expect(req.users).toEqual([ALICE]);
    });
});

describe("time-off request policy resolution", () => {
    it("time_off_requests_submit resolves a policy name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_submit",
            arguments: {
                policyId: "PTO",
                start: "2026-07-01",
                end: "2026-07-02",
                note: "Vacation",
            },
        });
        expect(res.isError).toBeFalsy();
        expect((captured.submit as { policyId?: string }).policyId).toBe(POLICY_ID);
    });

    it("time_off_requests_submit rejects an unknown policy name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_submit",
            arguments: {
                policyId: "Not a policy",
                start: "2026-07-01",
                end: "2026-07-02",
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.submit).toBeUndefined();
    });

    it("time_off_requests_update_status resolves a policy name before writing", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_requests_update_status",
            arguments: {
                policyId: "PTO",
                requestId: "req-1",
                statusType: "APPROVED",
            },
        });
        expect(res.isError).toBeFalsy();
        expect((captured.status as { policyId?: string }).policyId).toBe(POLICY_ID);
    });
});

describe("time-off balance for user resolution", () => {
    it("time_off_balance_for_user resolves a NAME", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_balance_for_user",
            arguments: { userId: "Alice" },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.balance as { userId?: string };
        expect(req.userId).toBe(ALICE);
    });

    it("time_off_balance_for_user clarifies on unknown and does NOT fetch", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_balance_for_user",
            arguments: { userId: "Nobody" },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured.balance).toBeUndefined();
    });

    it("time_off_balance_for_user stays list-free for a 24-hex userId", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(timeOffContext(captured));
        const res = await client.callTool({
            name: "clockify_time_off_balance_for_user",
            arguments: { userId: ALICE },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.usersListCalled).toBeFalsy();
        const req = captured.balance as { userId?: string };
        expect(req.userId).toBe(ALICE);
    });
});
