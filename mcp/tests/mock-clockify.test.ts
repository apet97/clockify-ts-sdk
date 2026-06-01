import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockClockifyServer, type MockClockifyServer } from "../../scripts/mock-clockify-server.mjs";
import { loadContext } from "../src/client.js";
import { buildServer } from "../src/server.js";

let mock: MockClockifyServer;
let baseUrl: string;
let teardownClient: () => Promise<void> = async () => {};

beforeEach(async () => {
    mock = createMockClockifyServer();
    baseUrl = await mock.listen();
    vi.stubEnv("CLOCKIFY_API_KEY", "mock");
    vi.stubEnv("CLOCKIFY_WORKSPACE_ID", mock.workspaceId);
    vi.stubEnv("CLOCKIFY_BASE_URL", baseUrl);
});

afterEach(async () => {
    await teardownClient();
    teardownClient = async () => {};
    vi.unstubAllEnvs();
    await mock.close();
});

async function connect(): Promise<Client> {
    const ctx = loadContext();
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "mock-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardownClient = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function parse(res: unknown): Record<string, unknown> {
    const text = ((res as { content?: Array<{ text: string }> }).content?.[0] ?? { text: "{}" }).text;
    return JSON.parse(text) as Record<string, unknown>;
}

describe("MCP mock Clockify server", () => {
    it("returns a structured status receipt through CLOCKIFY_BASE_URL", async () => {
        const client = await connect();

        const response = await client.callTool({ name: "clockify_status", arguments: {} });

        expect(response.isError).toBeFalsy();
        const envelope = parse(response);
        expect(envelope.ok).toBe(true);
        expect(envelope.ids).toMatchObject({ workspaceId: mock.workspaceId, userId: mock.userId });
    });
});
