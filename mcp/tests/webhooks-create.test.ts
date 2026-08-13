/**
 * clockify_webhooks_create body shaping. `name` (2-30 chars) is required on the
 * API-key path this SDK uses — requiredness is auth-scheme-dependent (addon-token
 * creates don't require it; see discrepancies.md
 * webhook.create.name-required-on-api-key-not-addon), matching the corrected
 * WebhookRequest (minLength:2/maxLength:30, in required[]) and the primary
 * clockify_setup_webhook surface. The tool's schema makes `name` required, so it is
 * always sent. These tests capture the request the SDK client receives and assert the
 * body envelope shape, plus that a missing or too-short name is rejected at the schema
 * boundary.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

import { callGuarded } from "./guarded-call.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function webhooksContext(
    captured: Record<string, unknown>,
    currentOverrides: Record<string, unknown> = {},
): Context {
    return {
        workspaceId: "ws-1",
        client: {
            webhooks: {
                get: async (req: unknown) => {
                    captured.get = req;
                    return {
                        id: "wh-1",
                        name: "stripe",
                        url: "https://example.com/hook",
                        webhookEvent: "NEW_PROJECT",
                        triggerSourceType: "WORKSPACE_ID",
                        triggerSource: ["ws-1"],
                        ...currentOverrides,
                    };
                },
                create: async (req: unknown) => {
                    captured.create = req;
                    return {
                        id: "wh-1",
                        url: "https://example.com/hook",
                        webhookEvent: "NEW_PROJECT",
                    };
                },
                update: async (req: unknown) => {
                    captured.update = req;
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

describe("clockify_webhooks_create — name is required (matches setup_webhook + spec)", () => {
    it("rejects a create with no name at the schema boundary", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
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
        const res = await callGuarded(client, {
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
            triggerSourceType: "WORKSPACE_ID",
            triggerSource: ["ws-1"],
        });
        const json = envelope(res);
        const changed = json.changed as { created: Array<Record<string, unknown>> };
        expect(changed.created[0]).toEqual({ type: "webhook", id: "wh-1", name: "stripe" });
    });

    it("forwards triggerSource / triggerSourceType alongside the required name", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
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

    it("refuses a non-WORKSPACE_ID triggerSourceType with no triggerSource", async () => {
        // Without this the guard is dead and a PROJECT_ID create would silently
        // default its scope to the whole workspace.
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_create",
            arguments: {
                name: "proj-hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "PROJECT_ID",
            },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { message: string }).message).toMatch(
            /triggerSource is required/,
        );
        expect(captured.create).toBeUndefined();
    });

    it("accepts a PROJECT_ID triggerSourceType when triggerSource is supplied", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_create",
            arguments: {
                name: "proj-hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "PROJECT_ID",
                triggerSource: ["64a000000000000000000002"],
            },
        });
        expect(res.isError).toBeFalsy();
        const sent = captured.create as { body: Record<string, unknown> };
        expect(sent.body.triggerSourceType).toBe("PROJECT_ID");
        expect(sent.body.triggerSource).toEqual(["64a000000000000000000002"]);
    });

    it("rejects USER_UPDATED unless it has a nonempty USER_ID trigger source", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "user-hook",
                url: "https://example.com/hook",
                webhookEvent: "USER_UPDATED",
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("rejects an explicit foreign WORKSPACE_ID trigger source", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "workspace-hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "WORKSPACE_ID",
                triggerSource: ["another-workspace"],
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("rejects the pinned workspace ID as a non-workspace trigger source", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "project-hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "PROJECT_ID",
                triggerSource: ["ws-1"],
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });

    it("normalizes empty and duplicate pinned WORKSPACE_ID sources", async () => {
        for (const triggerSource of [[], ["ws-1", "ws-1"]]) {
            const captured: Record<string, unknown> = {};
            const client = await connect(webhooksContext(captured));
            const res = await callGuarded(client, {
                name: "clockify_webhooks_create",
                arguments: {
                    name: "workspace-hook",
                    url: "https://example.com/hook",
                    webhookEvent: "NEW_PROJECT",
                    triggerSourceType: "WORKSPACE_ID",
                    triggerSource,
                },
            });

            expect(res.isError).toBeFalsy();
            expect(
                (captured.create as { body: { triggerSource: string[] } }).body.triggerSource,
            ).toEqual(["ws-1"]);
            await teardown();
            teardown = async () => {};
        }
    });

    it("rejects blank non-workspace trigger sources before token or write", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_create",
            arguments: {
                name: "project-hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "PROJECT_ID",
                triggerSource: ["   "],
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(envelope(res)).not.toHaveProperty("data.confirm_token");
        expect(captured.create).toBeUndefined();
    });

    it("clockify_webhooks_events returns the static registry with a matching count", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({ name: "clockify_webhooks_events", arguments: {} });
        expect(res.isError).toBeFalsy();
        const data = envelope(res).data as string[];
        expect(data.length).toBeGreaterThan(0);
        expect(data).toContain("NEW_TIME_ENTRY");
        expect((envelope(res).meta as { count?: number }).count).toBe(data.length);
    });

    it("rejects a too-short name at the schema boundary (min length 2)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_create",
            arguments: { name: "x", url: "https://example.com/hook", webhookEvent: "NEW_PROJECT" },
        });

        // name must be 2-30 chars; a 1-char name is rejected and the handler never runs.
        expect(res.isError).toBe(true);
        expect(captured.create).toBeUndefined();
    });
});

describe("clockify_webhooks_update — full replacement", () => {
    it("GETs the webhook and preserves all five required fields", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_update",
            arguments: { webhookId: "wh-1", name: "renamed" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.get).toEqual({ workspaceId: "ws-1", webhookId: "wh-1" });
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            webhookId: "wh-1",
            body: {
                name: "renamed",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "WORKSPACE_ID",
                triggerSource: ["ws-1"],
            },
        });
    });

    it("rejects a no-op after GET and never updates", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_update",
            arguments: { webhookId: "wh-1" },
        });
        expect(res.isError).toBe(true);
        expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
        expect(captured.get).toEqual({ workspaceId: "ws-1", webhookId: "wh-1" });
        expect(captured.update).toBeUndefined();
    });

    it.each(["x", "x".repeat(31)])(
        "rejects non-canonical webhook name %j before GET",
        async (name) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(webhooksContext(captured));
            const res = await callGuarded(client, {
                name: "clockify_webhooks_update",
                arguments: { webhookId: "wh-1", name },
            });
            expect(res.isError).toBe(true);
            expect(captured.get).toBeUndefined();
            expect(captured.update).toBeUndefined();
        },
    );

    it.each(["x", "x".repeat(31)])(
        "rejects legacy current name %j before replacing another field",
        async (name) => {
            const captured: Record<string, unknown> = {};
            const client = await connect(webhooksContext(captured, { name }));
            const res = await callGuarded(client, {
                name: "clockify_webhooks_update",
                arguments: { webhookId: "wh-1", webhookEvent: "NEW_TASK" },
            });
            expect(res.isError).toBe(true);
            // The legacy-name rejection is input validation, so it must classify
            // invalid_request rather than falling through to the catch-all code.
            expect((envelope(res).error as { code: string }).code).toBe("invalid_request");
            expect(captured.get).toEqual({ workspaceId: "ws-1", webhookId: "wh-1" });
            expect(captured.update).toBeUndefined();
        },
    );

    it("replaces url, event, trigger source type and trigger source with the supplied values", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await callGuarded(client, {
            name: "clockify_webhooks_update",
            arguments: {
                webhookId: "wh-1",
                name: "renamed",
                url: "https://other.example.com/hook",
                webhookEvent: "NEW_TASK",
                triggerSourceType: "PROJECT_ID",
                triggerSource: ["p-1"],
            },
        });
        expect(res.isError).toBeFalsy();
        // Every GET fixture value must be overwritten — toEqual, so a dropped
        // assignment that leaves the GET'd value in place reds.
        expect(captured.update).toEqual({
            workspaceId: "ws-1",
            webhookId: "wh-1",
            body: {
                name: "renamed",
                url: "https://other.example.com/hook",
                webhookEvent: "NEW_TASK",
                triggerSourceType: "PROJECT_ID",
                triggerSource: ["p-1"],
            },
        });
    });

    it("rejects changing to a non-workspace trigger type without a matching source", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_update",
            arguments: {
                webhookId: "wh-1",
                triggerSourceType: "PROJECT_ID",
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.update).toBeUndefined();
    });

    it("reuses a valid non-workspace source when changing between non-workspace types", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(
            webhooksContext(captured, {
                triggerSourceType: "USER_ID",
                triggerSource: ["user-1"],
            }),
        );
        const res = await callGuarded(client, {
            name: "clockify_webhooks_update",
            arguments: {
                webhookId: "wh-1",
                triggerSourceType: "PROJECT_ID",
            },
        });

        expect(res.isError).toBeFalsy();
        expect(
            (captured.update as { body: { triggerSource: string[] } }).body.triggerSource,
        ).toEqual(["user-1"]);
    });

    it("rejects an explicit foreign workspace scope on update", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(webhooksContext(captured));
        const res = await client.callTool({
            name: "clockify_webhooks_update",
            arguments: {
                webhookId: "wh-1",
                triggerSource: ["another-workspace"],
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(captured.update).toBeUndefined();
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
