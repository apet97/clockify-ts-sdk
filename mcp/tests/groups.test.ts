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
const SAM1 = "cccccccccccccccccccccccc";
const SAM2 = "dddddddddddddddddddddddd";
const ME = "eeeeeeeeeeeeeeeeeeeeeeee";

function groupsContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            userGroups: {
                list: async () => [{ id: "g-1", name: "Engineering" }],
                addMembers: async (req: unknown) => {
                    captured.addMembers = req;
                    return { id: "g-1" };
                },
                // GET /user-groups/{id}/users is a dead 405 route ("DOES NOT
                // EXIST") and the generated method is typed `void`. Throw so any
                // tool that still reaches for it fails the suite loudly.
                listMembers: async () => {
                    throw new Error("userGroups.listMembers must not be called (dead 405 route)");
                },
            },
            users: {
                list: async () => {
                    captured.usersListCalled = true;
                    return [
                        { id: ALICE, name: "Alice" },
                        { id: SAM1, name: "Sam" },
                        { id: SAM2, name: "Sam" },
                    ];
                },
                filterWorkspaceUsers: async (req: unknown) => {
                    captured.filterWorkspaceUsers = req;
                    return [
                        { id: ALICE, name: "Alice" },
                        { id: SAM1, name: "Sam" },
                    ];
                },
                getCurrentUser: async () => ({ id: ME }),
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

describe("clockify_groups_add_member resolves NAME -> id", () => {
    it("groups_add_member resolves a user NAME to its id", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_add_member",
            arguments: { groupId: "g-1", userId: "Alice" },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.addMembers as { userId?: string };
        expect(req.userId).toBe(ALICE);
    });

    it("groups_add_member clarifies + does NOT call addMembers on an ambiguous name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_add_member",
            arguments: { groupId: "g-1", userId: "Sam" },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect((env.clarification as { field?: string }).field).toBe("userId");
        expect(captured.addMembers).toBeUndefined();
    });

    it("groups_add_member clarifies + does NOT call addMembers on an unknown name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_add_member",
            arguments: { groupId: "g-1", userId: "Nobody" },
        });
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        expect(env.clarification).toBeDefined();
        expect(captured.addMembers).toBeUndefined();
    });

    it("groups_add_member passes a 24-hex userId through", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_add_member",
            arguments: { groupId: "g-1", userId: ALICE },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.addMembers as { userId?: string };
        expect(req.userId).toBe(ALICE);
    });
});

describe("clockify_groups_list_members uses the documented users filter (not the dead 405 route)", () => {
    it("returns members via users.filterWorkspaceUsers and never calls userGroups.listMembers", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_list_members",
            arguments: { groupId: "g-1" },
        });
        // The throwing listMembers stub would have surfaced as isError if the
        // tool still reached for the dead GET /user-groups/{id}/users route.
        expect(res.isError).toBeFalsy();
        const env = envelope(res);
        expect(env.ok).toBe(true);
        // The matched users come back as the data payload (POST /users/info).
        expect(JSON.stringify(env.data)).toContain(ALICE);
        expect(JSON.stringify(env.data)).toContain(SAM1);
        expect((env.meta as { count?: number }).count).toBe(2);
    });

    it("forwards the group id to the users filter as userGroups:[groupId]", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(groupsContext(captured));
        const res = await client.callTool({
            name: "clockify_groups_list_members",
            arguments: { groupId: "g-1" },
        });
        expect(res.isError).toBeFalsy();
        const req = captured.filterWorkspaceUsers as { workspaceId?: string; userGroups?: string[] };
        expect(req.workspaceId).toBe("ws-1");
        expect(req.userGroups).toEqual(["g-1"]);
    });
});
