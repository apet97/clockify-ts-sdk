import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { ConfirmationTokenStore } from "../src/orchestration/confirmation.js";
import { buildServer } from "../src/server.js";

const PROJECT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ALICE = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BOB = "cccccccccccccccccccccccc";
const GROUP_ID = "dddddddddddddddddddddddd";
const OTHER_ID = "eeeeeeeeeeeeeeeeeeeeeeee";

interface Captured {
    currentUserCalls: unknown[];
    groupLists: unknown[];
    projectGets: unknown[];
    setMembers: unknown[];
    updates: unknown[];
    userLists: unknown[];
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function captured(): Captured {
    return {
        currentUserCalls: [],
        groupLists: [],
        projectGets: [],
        setMembers: [],
        updates: [],
        userLists: [],
    };
}

function context(
    calls: Captured,
    options: {
        confirmationTokens?: ConfirmationTokenStore;
        get?: (request: unknown) => Promise<Record<string, unknown>>;
        groups?: Array<{ id: string; name: string }>;
        project?: Record<string, unknown>;
        update?: (request: unknown) => Promise<Record<string, unknown>>;
        users?: Array<{ id: string; name: string }>;
    } = {},
): Context {
    return {
        workspaceId: "ws-1",
        ...(options.confirmationTokens ? { confirmationTokens: options.confirmationTokens } : {}),
        client: {
            projects: {
                get:
                    options.get ??
                    (async (request: unknown) => {
                        calls.projectGets.push(request);
                        return (
                            options.project ?? {
                                id: PROJECT_ID,
                                memberships: [{ userId: ALICE }, { userId: BOB }],
                                userGroups: {
                                    contains: "CONTAINS",
                                    ids: [GROUP_ID],
                                    status: "ACTIVE",
                                },
                            }
                        );
                    }),
                updateMemberships:
                    options.update ??
                    (async (request: unknown) => {
                        calls.updates.push(request);
                        return { id: PROJECT_ID, memberships: [{ userId: ALICE }] };
                    }),
                setMembers: async (request: unknown) => {
                    calls.setMembers.push(request);
                    return {};
                },
            },
            users: {
                list: async (request: unknown) => {
                    calls.userLists.push(request);
                    return (
                        options.users ?? [
                            { id: ALICE, name: "Alice" },
                            { id: BOB, name: "Bob" },
                        ]
                    );
                },
                getCurrentUser: async () => {
                    calls.currentUserCalls.push({});
                    return { id: ALICE };
                },
            },
            userGroups: {
                list: async (request: unknown) => {
                    calls.groupLists.push(request);
                    return options.groups ?? [{ id: GROUP_ID, name: "Developers" }];
                },
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "project-memberships-test", version: "0.0.0" });
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

describe("project membership administration", () => {
    it("lists the membership projection from one exact project get", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_projects_memberships_list",
            arguments: { projectId: PROJECT_ID },
        });

        expect(result.isError).toBeFalsy();
        expect(calls.projectGets).toEqual([{ workspaceId: "ws-1", projectId: PROJECT_ID }]);
        expect(envelope(result)).toMatchObject({
            ok: true,
            data: {
                projectId: PROJECT_ID,
                memberships: [{ userId: ALICE }, { userId: BOB }],
                userGroups: { contains: "CONTAINS", ids: [GROUP_ID], status: "ACTIVE" },
            },
            meta: { workspaceId: "ws-1", projectId: PROJECT_ID, count: 2 },
        });
        expect(envelope(result).changed).toBeUndefined();
    });

    it("returns an honest empty membership projection", async () => {
        const calls = captured();
        const client = await connect(context(calls, { project: { id: PROJECT_ID } }));

        const result = await client.callTool({
            name: "clockify_projects_memberships_list",
            arguments: { projectId: PROJECT_ID },
        });

        expect(result.isError).toBeFalsy();
        expect(envelope(result)).toMatchObject({
            data: { projectId: PROJECT_ID, memberships: [] },
            meta: { count: 0 },
        });
        expect(envelope(result).changed).toBeUndefined();
    });

    it.each([
        [403, "auth_or_permission"],
        [404, "not_found"],
    ] as const)("maps a %i project read failure to stable recovery", async (status, code) => {
        const calls = captured();
        const client = await connect(
            context(calls, {
                get: async (request) => {
                    calls.projectGets.push(request);
                    throw httpError(`status ${status}`, status);
                },
            }),
        );

        const result = await client.callTool({
            name: "clockify_projects_memberships_list",
            arguments: { projectId: PROJECT_ID },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            ok: false,
            error: { code },
            recovery: { retryable: false },
        });
        expect(calls.projectGets).toHaveLength(1);
    });

    it("resolves every reference before one exact stored-preview PATCH without re-resolution", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            projectId: PROJECT_ID,
            memberships: [
                {
                    userId: "Alice",
                    hourlyRate: { amount: 7500, since: "2026-07-22T00:00:00Z" },
                },
                { userId: "Bob", costRate: { amount: 4200 } },
            ],
            userGroups: { contains: "CONTAINS", ids: ["Developers"], status: "ACTIVE" },
        };

        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(calls.updates).toEqual([]);
        expect(envelope(preview).data).toMatchObject({
            risk_class: "privileged",
            preview: {
                action: "update_memberships",
                entity: "project",
                request: {
                    workspaceId: "ws-1",
                    projectId: PROJECT_ID,
                    memberships: [
                        {
                            userId: ALICE,
                            hourlyRate: { amount: 7500, since: "2026-07-22T00:00:00Z" },
                        },
                        { userId: BOB, costRate: { amount: 4200 } },
                    ],
                    userGroups: { contains: "CONTAINS", ids: [GROUP_ID], status: "ACTIVE" },
                },
            },
        });

        const executed = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(executed.isError).toBeFalsy();
        expect(calls.updates).toEqual([
            {
                workspaceId: "ws-1",
                projectId: PROJECT_ID,
                memberships: [
                    {
                        userId: ALICE,
                        hourlyRate: { amount: 7500, since: "2026-07-22T00:00:00Z" },
                    },
                    { userId: BOB, costRate: { amount: 4200 } },
                ],
                userGroups: { contains: "CONTAINS", ids: [GROUP_ID], status: "ACTIVE" },
            },
        ]);
        expect(calls.setMembers).toEqual([]);
        expect(calls.userLists).toHaveLength(1);
        expect(calls.groupLists).toHaveLength(1);
        expect(calls.currentUserCalls).toHaveLength(1);
        expect(envelope(executed)).toMatchObject({
            ok: true,
            entity: "project",
            changed: { updated: [{ type: "project", id: PROJECT_ID }] },
            data: { id: PROJECT_ID, memberships: [{ userId: ALICE }] },
            meta: {
                workspaceId: "ws-1",
                projectId: PROJECT_ID,
                membershipCount: 2,
                groupIdCount: 1,
            },
            next: [
                {
                    tool: "clockify_projects_memberships_list",
                    args: { projectId: PROJECT_ID },
                },
            ],
        });
    });

    it.each([
        ["bare", {}],
        ["mixed", { dry_run: true, confirm_token: "not-a-token" }],
    ] as const)("rejects %s guard controls before resolution or PATCH", async (_label, controls) => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: "Alice" }],
                ...controls,
            },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.currentUserCalls).toEqual([]);
        expect(calls.userLists).toEqual([]);
        expect(calls.updates).toEqual([]);
    });

    it.each([
        ["projectId", { projectId: OTHER_ID }],
        ["memberships", { memberships: [{ userId: BOB }] }],
        ["userGroups", { userGroups: { ids: [OTHER_ID] } }],
    ] as const)("rejects %s tampering without re-resolution or PATCH", async (_label, changed) => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            projectId: PROJECT_ID,
            memberships: [{ userId: "Alice" }],
            userGroups: { ids: ["Developers"] },
        };
        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, ...changed, confirm_token: confirmationToken(preview) },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.currentUserCalls).toHaveLength(1);
        expect(calls.userLists).toHaveLength(1);
        expect(calls.groupLists).toHaveLength(1);
        expect(calls.updates).toEqual([]);
    });

    it("rejects a token after the workspace changes", async () => {
        const calls = captured();
        const ctx = context(calls);
        const client = await connect(ctx);
        const args = { projectId: PROJECT_ID, memberships: [{ userId: ALICE }] };
        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });
        ctx.workspaceId = "ws-2";

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.userLists).toHaveLength(1);
        expect(calls.updates).toEqual([]);
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
        const args = { projectId: PROJECT_ID, memberships: [{ userId: ALICE }] };
        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });
        clock.now += 100;

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.userLists).toHaveLength(1);
        expect(calls.updates).toEqual([]);
    });

    it("executes once without re-resolution and rejects token replay", async () => {
        const calls = captured();
        const client = await connect(context(calls));
        const args = {
            projectId: PROJECT_ID,
            memberships: [{ userId: "Alice" }],
            userGroups: { ids: ["Developers"] },
        };
        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });
        const token = confirmationToken(preview);

        const first = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: token },
        });
        const replay = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: token },
        });

        expect(first.isError).toBeFalsy();
        expect(replay.isError).toBe(true);
        expect(envelope(replay)).toMatchObject({ error: { code: "invalid_request" } });
        expect(calls.currentUserCalls).toHaveLength(1);
        expect(calls.userLists).toHaveLength(1);
        expect(calls.groupLists).toHaveLength(1);
        expect(calls.updates).toHaveLength(1);
    });

    it("maps updateMemberships 403 to permission recovery without a success receipt", async () => {
        const calls = captured();
        const client = await connect(
            context(calls, {
                update: async (request) => {
                    calls.updates.push(request);
                    throw httpError("status 403", 403);
                },
            }),
        );
        const args = { projectId: PROJECT_ID, memberships: [{ userId: ALICE }] };
        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });
        const json = envelope(result);

        expect(result.isError).toBe(true);
        expect(json).toMatchObject({
            ok: false,
            error: { code: "auth_or_permission" },
            recovery: { retryable: false },
        });
        expect(json.entity).toBeUndefined();
        expect(json.changed).toBeUndefined();
        expect(calls.updates).toHaveLength(1);
    });

    it.each([
        {
            label: "ambiguous user",
            options: {
                users: [
                    { id: ALICE, name: "Sam" },
                    { id: BOB, name: "Sam" },
                ],
            },
            arguments: { projectId: PROJECT_ID, memberships: [{ userId: "Sam" }] },
            field: "memberships.0.userId",
        },
        {
            label: "missing user",
            options: {},
            arguments: { projectId: PROJECT_ID, memberships: [{ userId: "Nobody" }] },
            field: "memberships.0.userId",
        },
        {
            label: "ambiguous group",
            options: {
                groups: [
                    { id: GROUP_ID, name: "Ops" },
                    { id: "eeeeeeeeeeeeeeeeeeeeeeee", name: "Ops" },
                ],
            },
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: ALICE }],
                userGroups: { ids: ["Ops"] },
            },
            field: "userGroups.ids",
        },
        {
            label: "missing group",
            options: {},
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: ALICE }],
                userGroups: { ids: ["Nobody"] },
            },
            field: "userGroups.ids",
        },
    ])("clarifies a $label before token issuance or PATCH", async ({ options, arguments: args, field }) => {
        const calls = captured();
        const client = await connect(context(calls, options));

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: { ...args, dry_run: true },
        });
        const json = envelope(result);

        expect(result.isError).toBeFalsy();
        expect(json).toMatchObject({ ok: true, data: null, clarification: { field } });
        expect(JSON.stringify(json)).not.toContain("confirm_token");
        expect(calls.updates).toEqual([]);
    });

    it("rejects duplicate resolved users before preview", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: "Alice" }, { userId: ALICE }],
                dry_run: true,
            },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            error: {
                code: "invalid_request",
                message: expect.stringMatching(/duplicate resolved userId/i),
            },
        });
        expect(JSON.stringify(envelope(result))).not.toContain("confirm_token");
        expect(calls.updates).toEqual([]);
    });

    it("verifies direct user and group IDs before issuing a preview", async () => {
        const calls = captured();
        const client = await connect(context(calls));

        const preview = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: ALICE }],
                userGroups: { ids: [GROUP_ID] },
                dry_run: true,
            },
        });

        expect(preview.isError).toBeFalsy();
        expect(envelope(preview).data).toMatchObject({
            preview: {
                request: {
                    memberships: [{ userId: ALICE }],
                    userGroups: { ids: [GROUP_ID] },
                },
            },
        });
        expect(calls.userLists).toHaveLength(1);
        expect(calls.groupLists).toHaveLength(1);
        expect(calls.updates).toEqual([]);
    });

    it.each([
        ["workspaceId", "attacker-workspace"],
        ["body", { memberships: [{ userId: ALICE }] }],
        ["unexpected", true],
    ] as const)("rejects reserved top-level field %s before resolution", async (field, value) => {
        const calls = captured();
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_projects_memberships_update",
            arguments: {
                projectId: PROJECT_ID,
                memberships: [{ userId: ALICE }],
                [field]: value,
                dry_run: true,
            },
        });

        expect(result.isError).toBe(true);
        expect(calls.userLists).toEqual([]);
        expect(calls.groupLists).toEqual([]);
        expect(calls.updates).toEqual([]);
    });
});
