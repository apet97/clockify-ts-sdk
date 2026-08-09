/**
 * A webhook's `authToken` is the static shared-secret token Clockify echoes in
 * the `Clockify-Signature-Token` delivery header (a comparison value, not an
 * HMAC signature) — it must NEVER appear in a tool result envelope (an agent
 * log would expose it). Every webhook tool (create/update/get/list) must redact
 * it while keeping id/name/url/event/enabled.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

const SECRET = "shhh-shared-secret-token-1234567890";

// Every webhook the fake API returns carries the secret authToken.
function webhookWithSecret(id: string): Record<string, unknown> {
    return {
        id,
        name: "Audit",
        url: "https://example.com/hook",
        webhookEvent: "NEW_PROJECT",
        triggerSourceType: "WORKSPACE_ID",
        triggerSource: ["ws-1"],
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

describe("redactWebhook — flat-DTO assumption (SEC-4)", () => {
    it("redacts the top level and, via the array path, each list element", async () => {
        const { redactWebhook } = await import("../src/tools/webhooks.js");
        const flat = { id: "wh-1", authToken: SECRET };
        expect(redactWebhook(flat).authToken).toBe("***redacted***");
        expect(redactWebhook([flat])[0]?.authToken).toBe("***redacted***");
    });

    it("does NOT descend into nested objects — the DTO is flat today, and this pin exists so a nested-shape change is a deliberate decision", async () => {
        const { redactWebhook } = await import("../src/tools/webhooks.js");
        const nested = { id: "wh-1", details: { authToken: SECRET } };
        // If Clockify ever nests the token, this test failing-on-purpose is
        // wrong: it will keep PASSING. It documents the boundary; the real
        // tripwire is the raw-secret scan in the tool-envelope tests above,
        // which fails the moment a nested token leaks through unredacted...
        // by design it cannot. Keep the redactor and DTO shape reviewed
        // together whenever the webhook wire shape moves.
        expect((redactWebhook(nested).details as { authToken: string }).authToken).toBe(SECRET);
    });
});

describe("webhook tools redact the shared-secret authToken", () => {
    const cases: Array<{ name: string; arguments: Record<string, unknown> }> = [
        {
            name: "clockify_webhooks_create",
            arguments: {
                name: "Audit",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
            },
        },
        {
            name: "clockify_webhooks_update",
            arguments: { webhookId: "wh-1", name: "Audit updated" },
        },
        { name: "clockify_webhooks_get", arguments: { webhookId: "wh-1" } },
        { name: "clockify_webhooks_list", arguments: {} },
    ];

    for (const c of cases) {
        it(`${c.name} never emits the raw authToken`, async () => {
            const client = await connect(webhooksContext());
            const request = { name: c.name, arguments: c.arguments };
            const res =
                c.name === "clockify_webhooks_create" || c.name === "clockify_webhooks_update"
                    ? await callGuarded(client, request)
                    : await client.callTool(request);
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
        const token = (JSON.parse(rawText(preview)).data as { confirm_token?: string })
            .confirm_token;
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
