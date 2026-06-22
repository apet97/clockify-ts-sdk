/**
 * A webhook's `authToken` is the HMAC signing secret Clockify uses to sign
 * outbound payloads — it must NEVER appear in a tool result envelope (an agent
 * log would expose it). Every webhook tool (create/update/get/list) must redact
 * it while keeping id/name/url/event/enabled.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const SECRET = "shhh-hmac-signing-secret-1234567890";

// Every webhook the fake API returns carries the secret authToken.
function webhookWithSecret(id: string): Record<string, unknown> {
    return {
        id,
        name: "Audit",
        url: "https://example.com/hook",
        webhookEvent: "NEW_PROJECT",
        enabled: true,
        authToken: SECRET,
    };
}

function webhooksContext(): Context {
    return {
        workspaceId: "ws-1",
        client: {
            webhooks: {
                create: async () => webhookWithSecret("wh-1"),
                update: async () => webhookWithSecret("wh-1"),
                get: async () => webhookWithSecret("wh-1"),
                list: async () => ({
                    workspaceWebhookCount: 1,
                    webhooks: [webhookWithSecret("wh-1"), webhookWithSecret("wh-2")],
                }),
            },
        } as never,
    };
}

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

function rawText(res: unknown): string {
    return ((res as { content: Array<{ text: string }> }).content[0] ?? { text: "{}" }).text;
}

describe("webhook tools redact the HMAC authToken", () => {
    const cases: Array<{ name: string; arguments: Record<string, unknown> }> = [
        {
            name: "clockify_webhooks_create",
            arguments: { name: "Audit", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        },
        {
            name: "clockify_webhooks_update",
            arguments: { webhookId: "wh-1", name: "Audit" },
        },
        { name: "clockify_webhooks_get", arguments: { webhookId: "wh-1" } },
        { name: "clockify_webhooks_list", arguments: {} },
    ];

    for (const c of cases) {
        it(`${c.name} never emits the raw authToken`, async () => {
            const client = await connect(webhooksContext());
            const res = await client.callTool({ name: c.name, arguments: c.arguments });
            expect((res as { isError?: boolean }).isError).toBeFalsy();
            const text = rawText(res);
            // The secret must not appear anywhere in the serialized envelope.
            expect(text).not.toContain(SECRET);
            // The redaction sentinel is present and the safe fields survive.
            const env = JSON.parse(text) as { data: unknown };
            const flat = JSON.stringify(env.data);
            expect(flat).toContain("***redacted***");
            expect(flat).toContain("wh-1");
            expect(flat).toContain("https://example.com/hook");
        });
    }

    it("clockify_setup_webhook (workflow create path) never emits the raw authToken", async () => {
        // The workflow tool creates a webhook too; its create response carries the
        // authToken just like the domain tool's, so it must redact identically.
        // Drive the dry_run -> confirm flow so the create actually fires.
        const client = await connect(webhooksContext());
        const args = { name: "Audit", url: "https://example.com/hook", event: "NEW_PROJECT" };
        const preview = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: { ...args, dry_run: true },
        });
        const token = (JSON.parse(rawText(preview)).data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        const res = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: { ...args, confirm_token: token },
        });
        expect((res as { isError?: boolean }).isError).toBeFalsy();
        const text = rawText(res);
        expect(text).not.toContain(SECRET);
        const flat = JSON.stringify(JSON.parse(text).data);
        expect(flat).toContain("***redacted***");
        expect(flat).toContain("wh-1");
    });
});
