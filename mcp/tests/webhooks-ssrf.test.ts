import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function webhooksContext(captured: { created: number; updated: number }): Context {
    return {
        workspaceId: "ws-1",
        client: {
            webhooks: {
                create: async () => {
                    captured.created += 1;
                    return { id: "wh-1" };
                },
                update: async () => {
                    captured.updated += 1;
                    return { id: "wh-1" };
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

describe("webhook SSRF guard (create/update preflight)", () => {
    const badUrls = [
        "http://169.254.169.254/latest/meta-data/",
        "https://169.254.169.254/hook",
        "https://localhost/hook",
        "https://127.0.0.1/hook",
        "https://10.0.0.5/hook",
    ];

    for (const url of badUrls) {
        it(`clockify_webhooks_create rejects ${url} without calling the API`, async () => {
            const captured = { created: 0, updated: 0 };
            const client = await connect(webhooksContext(captured));
            const res = await client.callTool({
                name: "clockify_webhooks_create",
                arguments: { name: "evil", url, webhookEvent: "NEW_PROJECT" },
            });
            expect(res.isError).toBe(true);
            expect(captured.created).toBe(0);
            expect(envelope(res).ok).toBe(false);
        });

        it(`clockify_webhooks_update rejects ${url} without calling the API`, async () => {
            const captured = { created: 0, updated: 0 };
            const client = await connect(webhooksContext(captured));
            const res = await client.callTool({
                name: "clockify_webhooks_update",
                arguments: { webhookId: "wh-1", url },
            });
            expect(res.isError).toBe(true);
            expect(captured.updated).toBe(0);
            expect(envelope(res).ok).toBe(false);
        });
    }

    it("clockify_webhooks_create accepts a public HTTPS URL", async () => {
        const captured = { created: 0, updated: 0 };
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: { name: "ok", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.created).toBe(1);
    });
});
