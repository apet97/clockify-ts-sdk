import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

/**
 * Behavior tests for the four `clockify_time_off_balance_assignments_*`
 * tools. Mirrors `time-off-balances-update.test.ts`: an in-memory MCP
 * client over a fake SDK context, asserting the exact request envelope the
 * guarded execute path sends after a dry_run/confirm_token handshake.
 */

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const POLICY_ID = "cccccccccccccccccccccccc";
const ASSIGNMENT_ID = "ffffffffffffffffffffffff";

interface Captured {
    creates: unknown[];
    updates: unknown[];
    deletes: unknown[];
    reads: unknown[];
}

function captured(): Captured {
    return { creates: [], updates: [], deletes: [], reads: [] };
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function context(calls: Captured, assignments: unknown[] = []): Context {
    return {
        workspaceId: "ws-1",
        client: {
            balanceAssignment: {
                createBalanceAssignment: async (request: unknown) => {
                    calls.creates.push(request);
                },
                updateBalanceAssignment: async (request: unknown) => {
                    calls.updates.push(request);
                },
                deleteBalanceAssignment: async (request: unknown) => {
                    calls.deletes.push(request);
                },
                getBalanceAssignmentsForUserAndPolicy: async (request: unknown) => {
                    calls.reads.push(request);
                    return assignments;
                },
            },
            timeOffPolicies: {
                list: async () => [{ id: POLICY_ID, name: "PTO" }],
            },
            users: {
                list: async () => [{ id: ALICE, name: "Alice", email: "alice@example.com" }],
                getCurrentUser: async () => ({ id: ALICE }),
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "balance-assignments-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(result: unknown): Record<string, unknown> {
    const value = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(value) as Record<string, unknown>;
}

describe("clockify_time_off_balance_assignments_list", () => {
    it("resolves the policy name and returns the assignments", async () => {
        const calls = captured();
        const client = await connect(
            context(calls, [
                { id: ASSIGNMENT_ID, userId: ALICE, policyId: POLICY_ID, balance: 0, accrued: 3 },
            ]),
        );

        const res = await client.callTool({
            name: "clockify_time_off_balance_assignments_list",
            arguments: { policyId: "PTO", userId: "me" },
        });

        expect(res.isError).toBeFalsy();
        expect(calls.reads).toEqual([
            { workspaceId: "ws-1", userId: ALICE, policyId: POLICY_ID },
        ]);
        expect((envelope(res).meta as { count: number }).count).toBe(1);
    });
});

describe("clockify_time_off_balance_assignments_create", () => {
    it("sends the resolved policy and users after confirmation", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const res = await callGuarded(client, {
            name: "clockify_time_off_balance_assignments_create",
            arguments: { policyId: "PTO", userIds: ["Alice"], balance: 2, note: "onboarding" },
        });

        expect(res.isError).toBeFalsy();
        expect(calls.creates).toEqual([
            {
                workspaceId: "ws-1",
                body: {
                    balance: 2,
                    policyId: POLICY_ID,
                    userIds: [ALICE],
                    note: "onboarding",
                },
            },
        ]);
        const body = envelope(res);
        expect(body.data).toMatchObject({ applied: true, policyId: POLICY_ID, userIds: [ALICE] });
        expect(body.changed).toBeUndefined();
        expect(body.warnings).toEqual([
            {
                code: "balance_assignment_ids_unavailable",
                message: expect.stringContaining("created or updated"),
            },
        ]);
    });

    it("does not mutate on a dry run", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        await client.callTool({
            name: "clockify_time_off_balance_assignments_create",
            arguments: {
                policyId: "PTO",
                userIds: ["Alice"],
                balance: 2,
                note: "onboarding",
                dry_run: true,
            },
        });

        expect(calls.creates).toEqual([]);
    });

    it("sends the date range only when a window flag is given", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        await callGuarded(client, {
            name: "clockify_time_off_balance_assignments_create",
            arguments: {
                policyId: "PTO",
                userIds: ["Alice"],
                balance: 1,
                note: "window",
                start: "2026-01-01",
            },
        });

        expect((calls.creates[0] as { body: Record<string, unknown> }).body.dateRange).toEqual({
            start: "2026-01-01",
        });
    });
});

describe("clockify_time_off_balance_assignments_update", () => {
    it("sends a negative balanceChange as a delta", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const res = await callGuarded(client, {
            name: "clockify_time_off_balance_assignments_update",
            arguments: {
                balanceAssignmentId: ASSIGNMENT_ID,
                policyId: "PTO",
                userId: "me",
                balanceChange: -4,
                note: "correction",
            },
        });

        expect(res.isError).toBeFalsy();
        expect(calls.updates).toEqual([
            {
                workspaceId: "ws-1",
                userId: ALICE,
                policyId: POLICY_ID,
                balanceAssignmentId: ASSIGNMENT_ID,
                body: { balanceChange: -4, note: "correction" },
            },
        ]);
    });
});

describe("clockify_time_off_balance_assignments_delete", () => {
    it("sends the required note in the request body", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const res = await callGuarded(client, {
            name: "clockify_time_off_balance_assignments_delete",
            arguments: {
                balanceAssignmentId: ASSIGNMENT_ID,
                policyId: "PTO",
                userId: "me",
                note: "revoked",
            },
        });

        expect(res.isError).toBeFalsy();
        expect(calls.deletes).toEqual([
            {
                workspaceId: "ws-1",
                userId: ALICE,
                policyId: POLICY_ID,
                balanceAssignmentId: ASSIGNMENT_ID,
                body: { note: "revoked" },
            },
        ]);
    });

    it("rejects an unresolvable policy name before deleting", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const res = await client.callTool({
            name: "clockify_time_off_balance_assignments_delete",
            arguments: {
                balanceAssignmentId: ASSIGNMENT_ID,
                policyId: "Sabbatical",
                userId: "me",
                note: "revoked",
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string }).code).toBe("not_found");
        expect(calls.deletes).toEqual([]);
    });
});
