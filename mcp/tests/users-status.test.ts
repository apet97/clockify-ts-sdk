import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

const ME = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const SAM_ONE = "cccccccccccccccccccccccc";
const SAM_TWO = "dddddddddddddddddddddddd";

interface Captured {
    currentUserCalls: unknown[];
    listCalls: unknown[];
    statusCalls: unknown[];
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
        updateUserStatus?: (request: unknown) => Promise<unknown>;
    } = {},
): Context {
    const users = options.users ?? [
        { id: ME, name: "Alice Owner", email: "alice@example.com" },
        { id: BOB, name: "Bob Member", email: "bob@example.com" },
        { id: SAM_ONE, name: "Sam" },
        { id: SAM_TWO, name: "Sam" },
    ];
    return {
        workspaceId: options.workspaceId ?? "ws-1",
        client: {
            users: {
                list: async (request: unknown) => {
                    captured.listCalls.push(request);
                    return users;
                },
                getCurrentUser: async () => {
                    captured.currentUserCalls.push({});
                    return { id: ME, name: "Alice Owner" };
                },
            },
            workspaces: {
                updateUserStatus:
                    options.updateUserStatus ??
                    (async (request: unknown) => {
                        captured.statusCalls.push(request);
                        return { id: options.workspaceId ?? "ws-1", name: "Acme" };
                    }),
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "users-status-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(result: unknown): Record<string, unknown> {
    const text = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

function confirmationToken(result: unknown): string {
    const data = envelope(result).data as { confirm_token?: unknown };
    expect(typeof data.confirm_token).toBe("string");
    return data.confirm_token as string;
}

function httpError(message: string, statusCode: number): Error & { statusCode: number } {
    return Object.assign(new Error(message), { statusCode });
}

describe("clockify_users_set_status", () => {
    it("resolves a member name in preview and executes the exact flattened request once", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));
        const args = { userId: "Bob Member", status: "ACTIVE" };

        const preview = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { ...args, dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(captured.statusCalls).toEqual([]);
        expect(envelope(preview).data).toMatchObject({
            risk_class: "privileged",
            preview: {
                action: "update",
                entity: "workspace_member",
                id: BOB,
                request: { workspaceId: "ws-1", userId: BOB, status: "ACTIVE" },
            },
        });

        const executed = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { ...args, confirm_token: confirmationToken(preview) },
        });

        expect(executed.isError).toBeFalsy();
        expect(captured.statusCalls).toEqual([
            { workspaceId: "ws-1", userId: BOB, status: "ACTIVE" },
        ]);
        expect(envelope(executed)).toMatchObject({
            ok: true,
            entity: "workspace_member",
            ids: { workspaceId: "ws-1", userId: BOB },
            meta: { workspaceId: "ws-1", userId: BOB, status: "ACTIVE" },
            changed: { updated: [{ type: "workspace_member", id: BOB }] },
            data: { id: "ws-1", name: "Acme" },
        });
    });

    it("resolves an exact email case-insensitively through the verified user list", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const preview = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: "BOB@EXAMPLE.COM", status: "ACTIVE", dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(envelope(preview).data).toMatchObject({
            preview: {
                id: BOB,
                request: { workspaceId: "ws-1", userId: BOB, status: "ACTIVE" },
            },
        });
        expect(captured.listCalls).toHaveLength(1);
        expect(captured.statusCalls).toEqual([]);
    });

    it("passes INACTIVE through unchanged instead of creating a separate deactivate tool", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const result = await callGuarded(client, {
            name: "clockify_users_set_status",
            arguments: { userId: "Bob Member", status: "INACTIVE" },
        });

        expect(result.isError).toBeFalsy();
        expect(captured.statusCalls).toEqual([
            { workspaceId: "ws-1", userId: BOB, status: "INACTIVE" },
        ]);
    });

    it("returns confirmation recovery on a bare call without resolving or writing", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const result = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: "Bob Member", status: "ACTIVE" },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            error: { code: "invalid_request" },
            recovery: {
                tool: "clockify_users_set_status",
                args: { userId: "Bob Member", status: "ACTIVE", dry_run: true },
                retryable: true,
            },
        });
        expect(captured.currentUserCalls).toEqual([]);
        expect(captured.listCalls).toEqual([]);
        expect(captured.statusCalls).toEqual([]);
    });

    it("rejects changed-status token tampering before the SDK write", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));
        const preview = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: "Bob Member", status: "ACTIVE", dry_run: true },
        });

        const tampered = await client.callTool({
            name: "clockify_users_set_status",
            arguments: {
                userId: "Bob Member",
                status: "INACTIVE",
                confirm_token: confirmationToken(preview),
            },
        });

        expect(tampered.isError).toBe(true);
        expect(envelope(tampered)).toMatchObject({ error: { code: "invalid_request" } });
        expect(captured.statusCalls).toEqual([]);
    });

    it("clarifies a duplicate member name without issuing a token or writing", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const result = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: "Sam", status: "ACTIVE", dry_run: true },
        });
        const json = envelope(result);

        expect(result.isError).toBeFalsy();
        expect(json).toMatchObject({
            ok: true,
            data: null,
            clarification: { field: "userId" },
        });
        expect(JSON.stringify(json)).not.toContain("confirm_token");
        expect(captured.statusCalls).toEqual([]);
    });

    it("clarifies an unknown member without issuing a token or writing", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const result = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: "Nobody", status: "INACTIVE", dry_run: true },
        });
        const json = envelope(result);

        expect(result.isError).toBeFalsy();
        expect(json).toMatchObject({
            ok: true,
            data: null,
            clarification: { field: "userId" },
        });
        expect(JSON.stringify(json)).not.toContain("confirm_token");
        expect(captured.statusCalls).toEqual([]);
    });

    it("verifies a 24-hex user id through the workspace-user list before preview", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const preview = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: BOB, status: "ACTIVE", dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(captured.listCalls).toHaveLength(1);
        expect(envelope(preview).data).toMatchObject({ preview: { id: BOB } });
        expect(captured.statusCalls).toEqual([]);
    });

    it("hard-blocks self-deactivation before token issuance while allowing another member", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const self = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: ME, status: "INACTIVE", dry_run: true },
        });
        const selfJson = envelope(self);

        expect(self.isError).toBe(true);
        expect(selfJson).toMatchObject({ error: { code: "invalid_request" } });
        expect(JSON.stringify(selfJson)).not.toContain("confirm_token");
        expect(captured.statusCalls).toEqual([]);

        const other = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: BOB, status: "INACTIVE", dry_run: true },
        });
        expect(other.isError).toBeFalsy();
        expect(typeof confirmationToken(other)).toBe("string");
        expect(captured.statusCalls).toEqual([]);
    });

    it("allows the current user to preview the recoverable ACTIVE status", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const preview = await client.callTool({
            name: "clockify_users_set_status",
            arguments: { userId: ME, status: "ACTIVE", dry_run: true },
        });

        expect(preview.isError).toBeFalsy();
        expect(typeof confirmationToken(preview)).toBe("string");
        expect(captured.statusCalls).toEqual([]);
    });

    it.each([
        [403, "auth_or_permission"],
        [404, "not_found"],
    ] as const)("maps a %i status failure without retrying", async (statusCode, code) => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(
            context(captured, {
                updateUserStatus: async (request) => {
                    captured.statusCalls.push(request);
                    throw httpError(`status ${statusCode}`, statusCode);
                },
            }),
        );

        const result = await callGuarded(client, {
            name: "clockify_users_set_status",
            arguments: { userId: BOB, status: "ACTIVE" },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            error: { code },
            recovery: { retryable: false },
        });
        expect(captured.statusCalls).toEqual([
            { workspaceId: "ws-1", userId: BOB, status: "ACTIVE" },
        ]);
    });

    it("publishes privileged preview-token metadata and guard-owned controls", async () => {
        const captured: Captured = { currentUserCalls: [], listCalls: [], statusCalls: [] };
        const client = await connect(context(captured));

        const tool = (await client.listTools()).tools.find(
            (candidate) => candidate.name === "clockify_users_set_status",
        );
        const properties = (tool?.inputSchema as { properties?: Record<string, unknown> })
            ?.properties;

        expect(tool).toBeDefined();
        expect(tool?._meta?.["io.github.apet97.clockify115/risk"]).toBe("privileged");
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
    });
});
