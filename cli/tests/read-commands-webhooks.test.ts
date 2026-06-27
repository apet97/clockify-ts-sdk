import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerWebhooksCommand } from "../src/commands/webhooks.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

describe("webhooks read and create commands", () => {
    it("normalizes the webhooks envelope and maps webhookEvent to event", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        workspaceWebhookCount: 1,
                        webhooks: [
                            {
                                id: "wh-1",
                                name: "ci",
                                url: "https://x",
                                webhookEvent: "NEW_PROJECT",
                                enabled: true,
                            },
                        ],
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        expect(calls[0]).toMatchObject({ workspaceId: "ws-1" });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: "wh-1",
            event: "NEW_PROJECT",
            url: "https://x",
            enabled: true,
        });
    });

    it("handles a bare-array webhook list response", async () => {
        const client = {
            webhooks: {
                list: async () => [
                    {
                        id: "wh-2",
                        name: "n",
                        url: "https://y",
                        webhookEvent: "NEW_TIME_ENTRY",
                    },
                ],
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({
            id: "wh-2",
            event: "NEW_TIME_ENTRY",
            enabled: true,
        });
    });

    it("webhook list falls back to an empty array when the envelope is missing", async () => {
        const client = {
            webhooks: { list: async () => ({ workspaceWebhookCount: 0 }) },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        expect(lastJson()).toEqual([]);
    });

    it("create splits trigger sources into the body envelope", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        id: "wh-3",
                        name: "ci",
                        webhookEvent: "NEW_PROJECT",
                        url: "https://x",
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "create",
            "--name",
            "ci",
            "--url",
            "https://x",
            "--event",
            "NEW_PROJECT",
            "--trigger-source-type",
            "PROJECT_ID",
            "--trigger-source",
            "p1, p2 ,p3",
        ]);
        const body = calls[0].body as Record<string, unknown>;
        expect(body.webhookEvent).toBe("NEW_PROJECT");
        expect(body.triggerSource).toEqual(["p1", "p2", "p3"]);
        expect((lastJson() as Record<string, unknown>).action).toBe("webhooks.create");
    });

    it("list accepts a type filter and create works without trigger-source options", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { webhooks: [] };
                },
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return {
                        id: "wh-4",
                        name: body.name,
                        webhookEvent: body.webhookEvent,
                        url: body.url,
                        enabled: false,
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
            "--type",
            "WEBHOOK",
        ]);
        expect(calls[0]).toMatchObject({ type: "WEBHOOK" });

        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "create",
            "--name",
            "plain",
            "--url",
            "https://plain",
            "--event",
            "NEW_TIME_ENTRY",
        ]);
        expect(calls[1].body).toMatchObject({
            name: "plain",
            url: "https://plain",
            webhookEvent: "NEW_TIME_ENTRY",
        });
        expect(lastJson()).toMatchObject({ enabled: false });
    });
});
