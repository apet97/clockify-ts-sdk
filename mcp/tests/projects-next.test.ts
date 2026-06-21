/**
 * Track-C next-action hints on the projects domain-WRITE receipts:
 * `clockify_projects_create` should chain to `clockify_tasks_create` (carrying
 * the new project id). The delete next-hint is pinned in
 * `archive-then-delete.test.ts`.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

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

describe("clockify_projects_create next-action hint", () => {
    it("chains to clockify_tasks_create carrying the new project id", async () => {
        const ctx: Context = {
            workspaceId: "ws-1",
            client: {
                projects: { create: async () => ({ id: "p-99", name: "Launch" }) },
            } as never,
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_projects_create",
            arguments: { name: "Launch" },
        });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        expect(json.entity).toBe("project");
        const next = json.next as Array<{ tool?: string; args?: { projectId?: string } }>;
        expect(next[0]?.tool).toBe("clockify_tasks_create");
        expect(next[0]?.args?.projectId).toBe("p-99");
    });
});
