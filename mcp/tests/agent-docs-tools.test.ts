import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

async function connect(): Promise<Client> {
    const ctx = { workspaceId: "ws-1", client: {} as never } as Context;
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

describe("agent discovery tools", () => {
    it("lists the three read-only discovery tools", async () => {
        const client = await connect();
        const names = (await client.listTools()).tools.map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                "clockify_docs_search",
                "clockify_operation_guide",
                "clockify_sdk_snippet",
            ]),
        );
    });

    it("clockify_docs_search returns ranked guidance without a change set", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_docs_search",
            arguments: { query: "pagination tags" },
        });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        const data = json.data as { results: unknown[] };
        expect(data.results.length).toBeGreaterThan(0);
    });

    it("clockify_operation_guide maps a webhook task to the webhook tool", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_operation_guide",
            arguments: { task: "setup webhook safely" },
        });
        expect(res.isError).toBeFalsy();
        const json = envelope(res);
        const matches = (json.data as { matches: Array<{ recommended_tools: string[] }> }).matches;
        expect(matches.flatMap((match) => match.recommended_tools)).toContain("clockify_setup_webhook");
    });

    it("clockify_operation_guide errors when no selector is given", async () => {
        const client = await connect();
        const res = await client.callTool({ name: "clockify_operation_guide", arguments: {} });
        expect(res.isError).toBe(true);
        expect(envelope(res).ok).toBe(false);
    });

    it("clockify_sdk_snippet returns a CLI snippet for raw-api", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_sdk_snippet",
            arguments: { topic: "raw-api", surface: "cli" },
        });
        expect(res.isError).toBeFalsy();
        const snippet = (envelope(res).data as { snippet: string }).snippet;
        expect(snippet).toContain("clockify115 api");
    });

    it("exposes the agent-mode guide resource", async () => {
        const client = await connect();
        const uris = (await client.listResources()).resources.map((resource) => resource.uri);
        expect(uris).toContain("clockify://guide/agent-mode");
    });
});
