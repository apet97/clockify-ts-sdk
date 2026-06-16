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
