import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { ConfirmationTokenStore } from "../src/orchestration/confirmation.js";
import { buildServer } from "../src/server.js";

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const POLICY_ID = "cccccccccccccccccccccccc";
const SAM_ONE = "dddddddddddddddddddddddd";
const SAM_TWO = "eeeeeeeeeeeeeeeeeeeeeeee";

interface Captured {
    balanceUpdates: unknown[];
    currentUserCalls: unknown[];
    policyLists: unknown[];
    userLists: unknown[];
}

interface UserFixture {
    id: string;
    name: string;
    email?: string;
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function context(
    captured: Captured,
    options: {
        workspaceId?: string;
        users?: UserFixture[];
        policies?: Array<{ id: string; name: string }>;
        update?: (request: unknown) => Promise<void>;
        confirmationTokens?: ConfirmationTokenStore;
    } = {},
): Context {
    const users = options.users ?? [
        { id: ALICE, name: "Alice", email: "alice@example.com" },
        { id: BOB, name: "Bob", email: "bob@example.com" },
        { id: SAM_ONE, name: "Sam", email: "sam.one@example.com" },
        { id: SAM_TWO, name: "Sam", email: "sam.two@example.com" },
    ];
    return {
        workspaceId: options.workspaceId ?? "ws-1",
        ...(options.confirmationTokens ? { confirmationTokens: options.confirmationTokens } : {}),
        client: {
            balances: {
                update:
                    options.update ??
                    (async (request: unknown) => {
                        captured.balanceUpdates.push(request);
                    }),
            },
            timeOffPolicies: {
                list: async (request: unknown) => {
                    captured.policyLists.push(request);
                    return options.policies ?? [{ id: POLICY_ID, name: "PTO" }];
                },
            },
            users: {
                list: async (request: unknown) => {
                    captured.userLists.push(request);
                    return users;
                },
                getCurrentUser: async () => {
                    captured.currentUserCalls.push({});
                    return { id: ALICE };
                },
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "time-off-balances-update-test", version: "0.0.0" });
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

function confirmationToken(result: unknown): string {
    const data = envelope(result).data as { confirm_token?: unknown };
    expect(typeof data.confirm_token).toBe("string");
    return data.confirm_token as string;
}

function captured(): Captured {
    return { balanceUpdates: [], currentUserCalls: [], policyLists: [], userLists: [] };
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode });
}

describe("clockify_time_off_balances_update", () => {
    it("resolves policy and users in preview, then sends one exact flat replacement request", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            policyId: "PTO",
            userIds: ["Alice", "BOB@EXAMPLE.COM"],
            value: "7.5",
            note: "private leave correction",
        };

        const preview = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(calls.balanceUpdates).toEqual([]);
        expect(envelope(preview).data).toMatchObject({
            risk_class: "business_write",
            preview: {
                action: "update",
                entity: "time_off_balance_adjustment",
                policyId: POLICY_ID,
                userIds: [ALICE, BOB],
                value: 7.5,
                request: {
                    workspaceId: "ws-1",
                    policyId: POLICY_ID,
                    userIds: [ALICE, BOB],
                    value: 7.5,
                    note: "private leave correction",
                },
            },
        });

        const executed = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(executed.isError).toBeFalsy();
        expect(calls.balanceUpdates).toEqual([
            {
                workspaceId: "ws-1",
                policyId: POLICY_ID,
                userIds: [ALICE, BOB],
                value: 7.5,
                note: "private leave correction",
            },
        ]);
        expect(envelope(executed)).toMatchObject({
            ok: true,
            entity: "time_off_balance_adjustment",
            ids: { workspaceId: "ws-1", policyId: POLICY_ID },
            meta: { workspaceId: "ws-1", policyId: POLICY_ID, affectedUserCount: 2 },
            changed: { updated: [{ type: "time_off_balance_adjustment", id: POLICY_ID }] },
            data: { updated: true, policyId: POLICY_ID, userIds: [ALICE, BOB], value: 7.5 },
            next: [
                {
                    tool: "clockify_time_off_balances_list",
                    args: { policyId: POLICY_ID },
                    reason: "Verify the resulting balances for this policy.",
                },
            ],
        });
        expect(envelope(executed).data).toEqual({
            updated: true,
            policyId: POLICY_ID,
            userIds: [ALICE, BOB],
            value: 7.5,
        });
        expect(JSON.stringify(envelope(preview))).toContain("private leave correction");
        expect(JSON.stringify(envelope(executed))).not.toContain("private leave correction");
        expect(calls.policyLists).toHaveLength(1);
        expect(calls.userLists).toHaveLength(1);
        expect(calls.currentUserCalls).toHaveLength(1);
        expect((calls.balanceUpdates[0] as Record<string, unknown>).body).toBeUndefined();
        expect((calls.balanceUpdates[0] as Record<string, unknown>).delta).toBeUndefined();
        expect((calls.balanceUpdates[0] as Record<string, unknown>).amount).toBeUndefined();
    });

    it("preserves multi-user order and requires at least one user", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: {
                policyId: POLICY_ID,
                userIds: [BOB, ALICE],
                value: 3,
                note: "ordered replacement",
                dry_run: true,
            },
        });

        expect(result.isError).toBeFalsy();
        expect(envelope(result).data).toMatchObject({
            preview: { userIds: [BOB, ALICE], request: { userIds: [BOB, ALICE] } },
        });
        expect(calls.userLists).toHaveLength(1);

        const empty = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: {
                policyId: POLICY_ID,
                userIds: [],
                value: 3,
                note: "invalid empty batch",
                dry_run: true,
            },
        });
        expect(empty.isError).toBe(true);
        expect(calls.balanceUpdates).toEqual([]);
    });

    it.each(["Sam", "Nobody"])(
        "clarifies the %s user reference without issuing a token or PATCH",
        async (userId) => {
            const calls = captured();
            const client = await connect(context(calls));

            const result = await client.callTool({
                name: "clockify_time_off_balances_update",
                arguments: {
                    policyId: "PTO",
                    userIds: [userId],
                    value: 4,
                    note: "clarification case",
                    dry_run: true,
                },
            });
            const json = envelope(result);

            expect(result.isError).toBeFalsy();
            expect(json).toMatchObject({
                ok: true,
                data: null,
                clarification: { field: "userIds" },
            });
            expect(JSON.stringify(json)).not.toContain("confirm_token");
            expect(calls.balanceUpdates).toEqual([]);
        },
    );

    it("verifies a 24-hex user id before issuing the preview token", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: {
                policyId: POLICY_ID,
                userIds: [BOB],
                value: 2,
                note: "verified id",
                dry_run: true,
            },
        });

        expect(result.isError).toBeFalsy();
        expect(calls.userLists).toHaveLength(1);
        expect(envelope(result).data).toMatchObject({ preview: { userIds: [BOB] } });
        expect(calls.balanceUpdates).toEqual([]);
    });

    it("preserves the shared unknown-policy error and does not PATCH", async () => {
        const calls = captured();
        const client = await connect(context(calls, { policies: [] }));

        const result = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: {
                policyId: "Unknown policy",
                userIds: [BOB],
                value: 2,
                note: "unknown policy",
                dry_run: true,
            },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ ok: false, error: { code: "error" } });
        expect(calls.userLists).toEqual([]);
        expect(calls.balanceUpdates).toEqual([]);
    });

    it("rejects bare and combined guard controls before resolving or writing", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = { policyId: "PTO", userIds: ["Alice"], value: 5, note: "guard" };

        const bare = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: args,
        });
        const combined = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true, confirm_token: "not-a-token" },
        });

        expect(bare.isError).toBe(true);
        expect(combined.isError).toBe(true);
        expect(envelope(bare)).toMatchObject({ error: { code: "invalid_request" } });
        expect(envelope(combined)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.policyLists).toEqual([]);
        expect(calls.userLists).toEqual([]);
        expect(calls.balanceUpdates).toEqual([]);
    });

    it.each([
        ["policyId", "dddddddddddddddddddddddd"],
        ["userIds", [ALICE]],
        ["value", 9],
        ["note", "changed note"],
    ] as const)("rejects a token after %s changes", async (field, changedValue) => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = { policyId: POLICY_ID, userIds: [BOB], value: 5, note: "original note" };
        const preview = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true },
        });

        const changed = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: {
                ...args,
                [field]: changedValue,
                confirm_token: confirmationToken(preview),
            },
        });

        expect(changed.isError).toBe(true);
        expect(envelope(changed)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.balanceUpdates).toEqual([]);
    });

    it("rejects a token after the workspace changes", async () => {
        const calls = captured();
        const ctx = context(calls);
        const client = await connect(ctx);
        const args = { policyId: POLICY_ID, userIds: [BOB], value: 5, note: "workspace" };
        const preview = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true },
        });
        ctx.workspaceId = "ws-2";

        const result = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.balanceUpdates).toEqual([]);
    });

    it("rejects an expired token before PATCH", async () => {
        const clock = { now: 1_000 };
        const calls = captured();
        const client = await connect(
            context(calls, {
                confirmationTokens: new ConfirmationTokenStore({
                    ttlMs: 100,
                    now: () => clock.now,
                }),
            }),
        );
        const args = { policyId: POLICY_ID, userIds: [BOB], value: 5, note: "expiry" };
        const preview = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true },
        });
        clock.now += 100;

        const result = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.balanceUpdates).toEqual([]);
    });

    it("rejects token replay without a second PATCH", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = { policyId: POLICY_ID, userIds: [BOB], value: 5, note: "replay" };
        const preview = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, dry_run: true },
        });
        const token = confirmationToken(preview);
        const first = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, confirm_token: token },
        });
        expect(first.isError).toBeFalsy();
        expect(calls.balanceUpdates).toHaveLength(1);
        calls.balanceUpdates.length = 0;

        const replay = await client.callTool({
            name: "clockify_time_off_balances_update",
            arguments: { ...args, confirm_token: token },
        });

        expect(replay.isError).toBe(true);
        expect(envelope(replay)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.balanceUpdates).toEqual([]);
    });

    it.each([
        [402, "feature_unavailable"],
        [403, "auth_or_permission"],
        [404, "not_found"],
    ] as const)("maps a %i PATCH failure without retrying", async (statusCode, code) => {
        const calls = captured();
        const client = await connect(
            context(calls, {
                update: async (request) => {
                    calls.balanceUpdates.push(request);
                    throw httpError(`status ${statusCode}`, statusCode);
                },
            }),
        );

        const result = await (async () => {
            const args = { policyId: POLICY_ID, userIds: [BOB], value: 5, note: "failure" };
            const preview = await client.callTool({
                name: "clockify_time_off_balances_update",
                arguments: { ...args, dry_run: true },
            });
            return client.callTool({
                name: "clockify_time_off_balances_update",
                arguments: { ...args, confirm_token: confirmationToken(preview) },
            });
        })();

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            error: { code },
            recovery: { retryable: false },
        });
        expect(calls.balanceUpdates).toHaveLength(1);
    });

    it("publishes business-write metadata and only guard-owned controls", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const tool = (await client.listTools()).tools.find(
            (candidate) => candidate.name === "clockify_time_off_balances_update",
        );
        const properties = (tool?.inputSchema as { properties?: Record<string, unknown> })
            ?.properties;

        expect(tool).toBeDefined();
        expect(tool?._meta?.["io.github.apet97.clockify115/risk"]).toBe("business_write");
        expect(tool?._meta?.["io.github.apet97.clockify115/confirmation"]).toBe(
            "preview_token",
        );
        expect(tool?.annotations).toMatchObject({
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
        });
        expect(properties).toHaveProperty("dry_run");
        expect(properties).toHaveProperty("confirm_token");
        expect(properties).toHaveProperty("value");
        expect(properties).not.toHaveProperty("delta");
        expect(properties).not.toHaveProperty("amount");
    });
});
