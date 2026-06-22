import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

// A 24-hex id so the resolver treats it as a real id, plus the short "user-1"
// id the existing grant/revoke fixtures pass (resolved against the list by id).
const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const SAM1 = "cccccccccccccccccccccccc";
const SAM2 = "dddddddddddddddddddddddd";
const ME = "eeeeeeeeeeeeeeeeeeeeeeee";

function usersContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: {
                list: async (req: unknown) => {
                    captured.list = req;
                    captured.usersListCalled = true;
                    return [
                        { id: "user-1", name: "Alice" },
                        { id: ALICE, name: "Alicia" },
                        { id: SAM1, name: "Sam" },
                        { id: SAM2, name: "Sam" },
                    ];
                },
                getCurrentUser: async () => ({ id: ME }),
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
                update: async (req: unknown) => {
                    captured.profileUpdate = req;
                    return { id: "user-1", weekStart: "TUESDAY" };
                },
            },
            workspaces: {
                addUser: async (req: unknown) => {
                    captured.addUser = req;
                    return { id: "ws-1", name: "Acme" };
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

    it("clockify_users_invite adds the user (send-email as string) with a created receipt", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_invite",
            arguments: { email: "new@acme.test", sendEmail: false },
        });
        expect(res.isError).toBeFalsy();
        // The boolean sendEmail is serialized to the "true"/"false" query string the wire wants.
        expect(captured.addUser).toEqual({
            workspaceId: "ws-1",
            "send-email": "false",
            email: "new@acme.test",
        });
        const changed = envelope(res).changed as { created: Array<{ type: string; name?: string }> };
        expect(changed.created[0]).toMatchObject({ type: "workspace_member", name: "new@acme.test" });
    });

    it("clockify_member_profile_update assembles ONLY the provided fields into the body", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_member_profile_update",
            arguments: { userId: "user-1", weekStart: "TUESDAY", workCapacity: "PT8H" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.profileUpdate).toEqual({
            workspaceId: "ws-1",
            userId: "user-1",
            body: { weekStart: "TUESDAY", workCapacity: "PT8H" },
        });
        // Omitted optional fields must not leak into the replace body.
        const sent = captured.profileUpdate as { body: Record<string, unknown> };
        expect("name" in sent.body).toBe(false);
        expect("workingDays" in sent.body).toBe(false);
        const changed = envelope(res).changed as { updated: Array<{ type: string; id: string }> };
        expect(changed.updated[0]).toEqual({ type: "member_profile", id: "user-1" });
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

    it("clockify_users_grant_role resolves a user NAME to its id before giveRole", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_grant_role",
            arguments: { userId: "Alicia", role: "PROJECT_MANAGER", entityId: "proj-1" },
        });
        expect(res.isError).toBeFalsy();
        expect((captured.giveRole as { userId?: string }).userId).toBe(ALICE);
    });

    it("clockify_users_grant_role clarifies + does NOT call giveRole on an ambiguous name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_grant_role",
            arguments: { userId: "Sam", role: "PROJECT_MANAGER", entityId: "proj-1" },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured.giveRole).toBeUndefined();
    });

    it("clockify_users_grant_role passes a 24-hex userId through", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const res = await client.callTool({
            name: "clockify_users_grant_role",
            arguments: { userId: ALICE, role: "PROJECT_MANAGER", entityId: "proj-1" },
        });
        expect(res.isError).toBeFalsy();
        expect((captured.giveRole as { userId?: string }).userId).toBe(ALICE);
    });

    it("clockify_users_revoke_role resolves a name and clarifies on unknown", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(usersContext(captured));
        const ok = await client.callTool({
            name: "clockify_users_revoke_role",
            arguments: { userId: "Alicia", role: "TEAM_MANAGER", entityId: "ws-1" },
        });
        expect(ok.isError).toBeFalsy();
        expect((captured.removeRole as { userId?: string }).userId).toBe(ALICE);

        const captured2: Record<string, unknown> = {};
        const client2 = await connect(usersContext(captured2));
        const bad = await client2.callTool({
            name: "clockify_users_revoke_role",
            arguments: { userId: "Nobody", role: "TEAM_MANAGER", entityId: "ws-1" },
        });
        expect(bad.isError).toBeFalsy();
        const env = envelope(bad);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured2.removeRole).toBeUndefined();
    });
});
