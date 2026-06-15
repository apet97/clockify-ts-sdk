import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function groupsContext(): Context {
    return {
        workspaceId: "ws-1",
        client: {
            userGroups: {
                // The generated get() is typed `void` — if the tool used it, it
                // would return nothing. Throw so the test fails loudly if it does.
                get: async () => {
                    throw new Error("userGroups.get must not be called (it returns void)");
                },
                list: async () => [
                    { id: "g-1", name: "Engineering" },
                    { id: "g-2", name: "Design" },
                ],
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

function parse(res: unknown): Record<string, unknown> {
    const text = ((res as { content?: Array<{ text: string }> }).content?.[0] ?? { text: "{}" }).text;
    return JSON.parse(text) as Record<string, unknown>;
}

describe("clockify_groups_get reads from the list (generated get is void)", () => {
    it("returns the matching group by id, scanned from the list", async () => {
        const client = await connect(groupsContext());
        const res = await client.callTool({ name: "clockify_groups_get", arguments: { groupId: "g-2" } });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        expect(JSON.stringify(env)).toContain("Design");
    });

    it("errors clearly on an unknown id (never silently returns void)", async () => {
        const client = await connect(groupsContext());
        const res = await client.callTool({ name: "clockify_groups_get", arguments: { groupId: "missing" } });
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect(JSON.stringify(env)).toMatch(/no user group with id/);
    });
});
