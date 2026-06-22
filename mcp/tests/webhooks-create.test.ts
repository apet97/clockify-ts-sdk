/**
 * clockify_webhooks_create body shaping. `name` (2-30 chars) is required — matching
 * the primary clockify_setup_webhook surface (which already requires it) and the
 * corrected WebhookRequest.required[]; every live create probe supplied one. The
 * tool's schema makes `name` required, so it is always sent. These tests capture the
 * request the SDK client receives and assert the body envelope shape, plus that a
 * missing or too-short name is rejected at the schema boundary.
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

describe("clockify_webhooks_create — name is required (matches setup_webhook + spec)", () => {
    it("rejects a create with no name at the schema boundary", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: { url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });

        // name is required (matches clockify_setup_webhook + spec required[]); the handler never runs.
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
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

    it("forwards triggerSource / triggerSourceType alongside the required name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "user-hook",
                url: "https://example.com/hook",
                webhookEvent: "USER_UPDATED",
                triggerSourceType: "USER_ID",
                triggerSource: ["64a000000000000000000001"],
            },
        });

        expect(res.isError).toBeFalsy();
        const sent = captured.create as { body: Record<string, unknown> };
        expect(sent.body).toEqual({
            name: "user-hook",
            url: "https://example.com/hook",
            webhookEvent: "USER_UPDATED",
            triggerSourceType: "USER_ID",
            triggerSource: ["64a000000000000000000001"],
        });
    });

    it("rejects a too-short name at the schema boundary (min length 2)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: { name: "x", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });

        // name must be 2-30 chars; a 1-char name is rejected and the handler never runs.
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });
});

describe("clockify_setup_webhook — full WebhookEventType set (MCP-01)", () => {
    it("accepts an event outside the original 12-item list (TIME_OFF_REQUESTED)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: {
                name: "Time-off hook",
                url: "https://example.com/hook",
                event: "TIME_OFF_REQUESTED",
                dry_run: true,
            },
        });
        // Was hard-rejected at the 12-event enum; now the dry_run preview builds.
        expect(res.isError).toBeFalsy();
        expect(envelope(res).ok).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("rejects a genuinely invalid event at the schema boundary", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: {
                name: "Bad hook",
                url: "https://example.com/hook",
                event: "NOT_AN_EVENT",
                dry_run: true,
            },
        });
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });
});
