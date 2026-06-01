import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function usersContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: {
                list: async (req: unknown) => {
                    captured.list = req;
                    return [{ id: "user-1", name: "Alice" }];
                },
                giveRole: async (req: unknown) => {
                    captured.giveRole = req;
                    return [{ role: "TEAM_MANAGER" }];
                },
                removeRole: async (req: unknown) => {
                    captured.removeRole = req;
                    return undefined;
                },
            },
            memberProfiles: {
                get: async (req: unknown) => {
                    captured.profile = req;
                    return { weekStart: "MONDAY" };
                },
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

describe("users and roles tools", () => {
    it("clockify_users_list passes pagination + include-roles and is read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_list",
            arguments: { page: 2, pageSize: 10 },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.list).toEqual({
            workspaceId: "ws-1",
            page: 2,
            "page-size": 10,
            "include-roles": false,
        });
        expect(envelope(res).changed).toBeUndefined();
    });

    it("clockify_member_profile_get fetches one profile by user id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_member_profile_get",
            arguments: { userId: "user-1" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.profile).toEqual({ workspaceId: "ws-1", userId: "user-1" });
    });

    it("clockify_users_grant_role forwards the role assignment and is a privileged write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_grant_role",
            arguments: { userId: "user-1", role: "PROJECT_MANAGER", entityId: "proj-1" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.giveRole).toEqual({
            workspaceId: "ws-1",
            userId: "user-1",
            role: "PROJECT_MANAGER",
            entityId: "proj-1",
        });
        const tool = (await client.listTools()).tools.find((t) => t.name === "clockify_users_grant_role");
        expect(tool?.annotations?.readOnlyHint).toBe(false);
        expect(tool?.description ?? "").toContain("privileged");
    });

    it("clockify_users_revoke_role returns a receipt for the void delete", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_revoke_role",
            arguments: { userId: "user-1", role: "TEAM_MANAGER", entityId: "ws-1" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.removeRole).toMatchObject({ userId: "user-1", role: "TEAM_MANAGER", entityId: "ws-1" });
        expect((envelope(res).data as { revoked?: boolean }).revoked).toBe(true);
    });
});
