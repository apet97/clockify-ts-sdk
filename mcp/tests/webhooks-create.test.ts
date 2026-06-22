/**
 * clockify_webhooks_create body shaping. Official WebhookRequest marks `name`
 * OPTIONAL (required = [triggerSource, triggerSourceType, url, webhookEvent]),
 * so the tool must accept a missing name and omit it from the wire body rather
 * than sending an empty string. These tests capture the request the SDK client
 * receives and assert the body envelope shape.
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

function webhooksContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            webhooks: {
                create: async (req: unknown) => {
                    captured.create = req;
                    return { id: "wh-1", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" };
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

describe("clockify_webhooks_create — name is optional (official WebhookRequest)", () => {
    it("omits `name` from the body when it is not supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: { url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });

        expect(res.isError).toBeFalsy();
        const sent = captured.create as { workspaceId: string; body: Record<string, unknown> };
        expect(sent.workspaceId).toBe("ws-1");
        // No empty-string name; the key is simply absent.
        expect("name" in sent.body).toBe(false);
        expect(sent.body).toEqual({
            url: "https://example.com/hook",
            webhookEvent: "NEW_PROJECT",
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        // The created receipt carries no name (none was provided).
        const changed = json.changed as { created: Array<Record<string, unknown>> };
        expect(changed.created[0]).toEqual({ type: "webhook", id: "wh-1" });
    });

    it("includes `name` in the body and the receipt when supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "stripe",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
            },
        });

        expect(res.isError).toBeFalsy();
        const sent = captured.create as { body: Record<string, unknown> };
        expect(sent.body).toEqual({
            name: "stripe",
            url: "https://example.com/hook",
            webhookEvent: "NEW_PROJECT",
        });
        const json = envelope(res);
        const changed = json.changed as { created: Array<Record<string, unknown>> };
        expect(changed.created[0]).toEqual({ type: "webhook", id: "wh-1", name: "stripe" });
    });

    it("forwards triggerSource / triggerSourceType alongside an omitted name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                url: "https://example.com/hook",
                webhookEvent: "USER_UPDATED",
                triggerSourceType: "USER_ID",
                triggerSource: ["64a000000000000000000001"],
            },
        });

        expect(res.isError).toBeFalsy();
        const sent = captured.create as { body: Record<string, unknown> };
        expect("name" in sent.body).toBe(false);
        expect(sent.body).toEqual({
            url: "https://example.com/hook",
            webhookEvent: "USER_UPDATED",
            triggerSourceType: "USER_ID",
            triggerSource: ["64a000000000000000000001"],
        });
    });

    it("still rejects an empty-string name at the schema boundary (min length kept)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: { name: "", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });

        // Optional, but if provided it must be non-empty; the handler never runs.
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });
});
