import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

async function listToolInputSchema(toolName: string): Promise<Record<string, unknown>> {
    const ctx = {
        client: {} as never,
        workspaceId: "000000000000000000000001",
    } as never;
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "time-off-statuses-test", version: "0.0.0" });
    await client.connect(clientTransport);
    try {
        const { tools } = await client.listTools();
        const tool = tools.find((item) => item.name === toolName);
        expect(tool, `tool ${toolName} must be registered`).toBeTruthy();
        return (tool?.inputSchema ?? {}) as Record<string, unknown>;
    } finally {
        await client.close();
        await server.close();
    }
}

describe("time-off requests list statuses guard", () => {
    it("offers ALL but not WITHDRAWN in the search status enum", async () => {
        const schema = await listToolInputSchema("clockify_time_off_requests_list");
        const json = JSON.stringify(schema);
        expect(json).toContain("ALL");
        expect(json).not.toContain("WITHDRAWN");
    });
});
