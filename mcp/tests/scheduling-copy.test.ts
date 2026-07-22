import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ASSIGNMENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SAM_ONE = "cccccccccccccccccccccccc";
const SAM_TWO = "dddddddddddddddddddddddd";

interface UserFixture {
    id: string;
    name: string;
}

interface Captured {
    copies: unknown[];
    creates: unknown[];
    updates: unknown[];
    deletes: unknown[];
    userLists: unknown[];
    currentUserCalls: unknown[];
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function captured(): Captured {
    return {
        copies: [],
        creates: [],
        updates: [],
        deletes: [],
        userLists: [],
        currentUserCalls: [],
    };
}

function context(
    calls: Captured,
    options: {
        copyResult?: unknown[];
        users?: UserFixture[];
        copy?: (request: unknown) => Promise<unknown[]>;
    } = {},
): Context {
    const users = options.users ?? [
        { id: ALICE, name: "Alice" },
        { id: SAM_ONE, name: "Sam" },
        { id: SAM_TWO, name: "Sam" },
    ];
    return {
        workspaceId: "ws-1",
        client: {
            scheduling: {
                copy:
                    options.copy ??
                    (async (request: unknown) => {
                        calls.copies.push(request);
                        return options.copyResult ?? [{ id: "copy-1" }, { id: "copy-2" }];
                    }),
                createRecurring: async (request: unknown) => {
                    calls.creates.push(request);
                    return [];
                },
                updateRecurring: async (request: unknown) => {
                    calls.updates.push(request);
                    return [];
                },
                deleteRecurring: async (request: unknown) => {
                    calls.deletes.push(request);
                },
            },
            users: {
                list: async (request: unknown) => {
                    calls.userLists.push(request);
                    return users;
                },
                getCurrentUser: async () => {
                    calls.currentUserCalls.push({});
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
    const client = new Client({ name: "scheduling-copy-test", version: "0.0.0" });
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

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode });
}

describe("clockify_scheduling_copy", () => {
    it("resolves the target user in preview and confirms one exact generated copy request", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: "Alice",
            seriesUpdateOption: "THIS_AND_FOLLOWING",
        };

        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(calls.copies).toEqual([]);
        expect(envelope(preview).data).toMatchObject({
            risk_class: "business_write",
            preview: {
                action: "copy",
                entity: "scheduling_assignment",
                assignmentId: ASSIGNMENT_ID,
                userId: ALICE,
                seriesUpdateOption: "THIS_AND_FOLLOWING",
                request: {
                    workspaceId: "ws-1",
                    assignmentId: ASSIGNMENT_ID,
                    userId: ALICE,
                    seriesUpdateOption: "THIS_AND_FOLLOWING",
                },
            },
        });

        const executed = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(executed.isError).toBeFalsy();
        expect(calls.copies).toEqual([
            {
                workspaceId: "ws-1",
                assignmentId: ASSIGNMENT_ID,
                userId: ALICE,
                seriesUpdateOption: "THIS_AND_FOLLOWING",
            },
        ]);
        expect(calls.creates).toEqual([]);
        expect(calls.updates).toEqual([]);
        expect(calls.deletes).toEqual([]);
        expect(calls.userLists).toHaveLength(1);
        expect(calls.currentUserCalls).toHaveLength(1);
        expect(envelope(executed)).toMatchObject({
            ok: true,
            entity: "scheduling_assignment",
            changed: { created: [{ type: "scheduling_assignment", id: "copy-1" }] },
            data: [{ id: "copy-1" }, { id: "copy-2" }],
            meta: {
                workspaceId: "ws-1",
                assignmentId: ASSIGNMENT_ID,
                userId: ALICE,
                seriesUpdateOption: "THIS_AND_FOLLOWING",
            },
        });
    });

    it("returns the honest empty array with a warning instead of inventing a copied assignment", async () => {
        const calls = captured();
        const client = await connect(context(calls, { copyResult: [] }));
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: ALICE,
            seriesUpdateOption: "THIS_ONE",
        };
        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true },
        });
        const executed = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });
        const json = envelope(executed);

        expect(executed.isError).toBeFalsy();
        expect(json.data).toEqual([]);
        expect(json.warnings).toEqual([
            {
                code: "scheduling_copy_empty_result",
                message:
                    "Clockify returned no copied scheduling assignments. Verify the target schedule before retrying.",
            },
        ]);
        expect({ entity: json.entity, changed: json.changed }).toEqual({
            entity: undefined,
            changed: undefined,
        });
    });

    it("clarifies an ambiguous target-user name without issuing a token or copying", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: {
                assignmentId: ASSIGNMENT_ID,
                userId: "Sam",
                seriesUpdateOption: "ALL",
                dry_run: true,
            },
        });
        const json = envelope(result);

        expect(result.isError).toBeFalsy();
        expect(json).toMatchObject({
            ok: true,
            data: null,
            clarification: {
                field: "userId",
                candidates: [
                    { id: SAM_ONE, name: "Sam" },
                    { id: SAM_TWO, name: "Sam" },
                ],
            },
        });
        expect(JSON.stringify(json)).not.toContain("confirm_token");
        expect(calls.copies).toEqual([]);
    });

    it("clarifies a missing target-user name without issuing a token or copying", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: {
                assignmentId: ASSIGNMENT_ID,
                userId: "Nobody",
                seriesUpdateOption: "THIS_ONE",
                dry_run: true,
            },
        });
        const json = envelope(result);

        expect(result.isError).toBeFalsy();
        expect(json).toMatchObject({ ok: true, data: null, clarification: { field: "userId" } });
        expect(JSON.stringify(json)).not.toContain("confirm_token");
        expect(calls.copies).toEqual([]);
    });

    it("verifies a direct 24-hex target-user ID before preview", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: {
                assignmentId: ASSIGNMENT_ID,
                userId: ALICE,
                seriesUpdateOption: "THIS_ONE",
                dry_run: true,
            },
        });

        expect(preview.isError).toBeFalsy();
        expect(calls.userLists).toHaveLength(1);
        expect(envelope(preview).data).toMatchObject({
            preview: { userId: ALICE, request: { userId: ALICE } },
        });
        expect(calls.copies).toEqual([]);
    });

    it.each([
        [403, "auth_or_permission"],
        [404, "not_found"],
    ] as const)("maps a %i copy failure without a success receipt or retry", async (status, code) => {
        const calls = captured();
        const client = await connect(
            context(calls, {
                copy: async (request) => {
                    calls.copies.push(request);
                    throw httpError(`status ${status}`, status);
                },
            }),
        );
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: ALICE,
            seriesUpdateOption: "ALL",
        };
        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true },
        });

        const executed = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });
        const json = envelope(executed);

        expect(executed.isError).toBe(true);
        expect(json).toMatchObject({ ok: false, error: { code }, recovery: { retryable: false } });
        expect(json.entity).toBeUndefined();
        expect(json.changed).toBeUndefined();
        expect(calls.copies).toHaveLength(1);
    });

    it("rejects bare and mixed guard controls before resolving or copying", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: "Alice",
            seriesUpdateOption: "THIS_ONE",
        };

        const bare = await client.callTool({ name: "clockify_scheduling_copy", arguments: args });
        const mixed = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true, confirm_token: "not-a-token" },
        });

        expect(bare.isError).toBe(true);
        expect(mixed.isError).toBe(true);
        expect(envelope(bare)).toMatchObject({ error: { code: "invalid_request" } });
        expect(envelope(mixed)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.userLists).toEqual([]);
        expect(calls.currentUserCalls).toEqual([]);
        expect(calls.copies).toEqual([]);
    });

    it.each([
        ["assignmentId", SAM_ONE],
        ["userId", SAM_ONE],
        ["seriesUpdateOption", "ALL"],
    ] as const)("rejects a token after %s changes", async (field, changedValue) => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: ALICE,
            seriesUpdateOption: "THIS_ONE",
        };
        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true },
        });

        const tampered = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: {
                ...args,
                [field]: changedValue,
                confirm_token: confirmationToken(preview),
            },
        });

        expect(tampered.isError).toBe(true);
        expect(envelope(tampered)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.copies).toEqual([]);
    });

    it("rejects token replay without a second copy", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            assignmentId: ASSIGNMENT_ID,
            userId: ALICE,
            seriesUpdateOption: "THIS_ONE",
        };
        const preview = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, dry_run: true },
        });
        const token = confirmationToken(preview);
        const first = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, confirm_token: token },
        });
        expect(first.isError).toBeFalsy();
        expect(calls.copies).toHaveLength(1);

        const replay = await client.callTool({
            name: "clockify_scheduling_copy",
            arguments: { ...args, confirm_token: token },
        });

        expect(replay.isError).toBe(true);
        expect(envelope(replay)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.copies).toHaveLength(1);
    });
});
