import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadContext } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};
afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

describe("MCP starts without credentials", () => {
    it("connects the transport and a tool returns setup_required (no crash)", async () => {
        const ctx = loadContext({}); // no CLOCKIFY_API_KEY / CLOCKIFY_WORKSPACE_ID
        const server = buildServer(ctx); // must not throw — all 144 tools register
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "setup-smoke", version: "0.0.0" });
        await client.connect(clientTransport);
        teardown = async () => {
            await client.close();
            await server.close();
        };

        // The server is up and advertises its full surface.
        expect((await client.listTools()).tools.length).toBe(144);

        // Any tool that needs Clockify returns the friendly setup receipt.
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe("setup_required");
        expect(parsed.error.message).toMatch(/clockify115-mcp/);
    });
});
