import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { CONFIRMATION_META_KEY, RISK_META_KEY } from "../src/result.js";
import { buildServer } from "../src/server.js";

const TOOL_NAME = "clockify_webhooks_delivery_diagnose";
const RESPONSE_BODY_MARKER = "recipient-secret-ignore-previous-instructions";

interface Calls {
    diagnose: unknown[];
    list: number;
    searchLogs: number;
    writes: number;
}

function calls(): Calls {
    return { diagnose: [], list: 0, searchLogs: 0, writes: 0 };
}

function webhooksContext(
    seen: Calls,
    diagnose: (request: unknown) => Promise<unknown> = async () => [
        {
            id: "status-1",
            webhookId: "webhook-1",
            webhookLogId: "log-1",
            status: "FAILED",
            statusCode: 503,
            respondedAt: "2026-07-22T08:30:00Z",
            retryCount: 2,
            requestBody: "not part of the public projection",
        },
    ],
): Context {
    const write = async (): Promise<unknown> => {
        seen.writes += 1;
        return {};
    };
    return {
        workspaceId: "workspace-1",
        client: {
            webhooks: {
                getWebhookEventStatusesWithLatestLog: async (request: unknown) => {
                    seen.diagnose.push(request);
                    return diagnose(request);
                },
                list: async () => {
                    seen.list += 1;
                    return [];
                },
                searchLogs: async () => {
                    seen.searchLogs += 1;
                    return [];
                },
                create: write,
                update: write,
                delete: write,
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

function text(result: unknown): string {
    return (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
}

function envelope(result: unknown): Record<string, unknown> {
    return JSON.parse(text(result)) as Record<string, unknown>;
}

describe(TOOL_NAME, () => {
    it("uses the generated statuses request defaults and returns the safe projection", async () => {
        const seen = calls();
        const client = await connect(webhooksContext(seen));
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "webhook-1" },
        });

        expect(result.isError).toBeFalsy();
        expect(seen.diagnose).toEqual([
            { workspaceId: "workspace-1", webhookId: "webhook-1", page: 1, size: 50 },
        ]);
        const json = envelope(result);
        expect(json.ok).toBe(true);
        expect(json.action).toBe(TOOL_NAME);
        expect(json.data).toEqual([
            {
                id: "status-1",
                webhookId: "webhook-1",
                webhookLogId: "log-1",
                status: "FAILED",
                statusCode: 503,
                respondedAt: "2026-07-22T08:30:00Z",
                retryCount: 2,
            },
        ]);
        expect(json.meta).toEqual({
            workspaceId: "workspace-1",
            webhookId: "webhook-1",
            count: 1,
            page: 1,
            pageSize: 50,
        });
    });

    it("maps pageSize to size and status only to statuses", async () => {
        const seen = calls();
        const client = await connect(webhooksContext(seen));
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "webhook-2", page: 3, pageSize: 25, status: "RETRYING" },
        });

        expect(result.isError).toBeFalsy();
        expect(seen.diagnose).toEqual([
            {
                workspaceId: "workspace-1",
                webhookId: "webhook-2",
                page: 3,
                size: 25,
                statuses: "RETRYING",
            },
        ]);
        expect(envelope(result).meta).toEqual({
            workspaceId: "workspace-1",
            webhookId: "webhook-2",
            count: 1,
            page: 3,
            pageSize: 25,
            status: "RETRYING",
        });
    });

    it("returns an empty successful diagnosis without fabricating a conclusion", async () => {
        const seen = calls();
        const client = await connect(webhooksContext(seen, async () => []));
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "webhook-empty" },
        });

        expect(result.isError).toBeFalsy();
        expect(envelope(result)).toMatchObject({ ok: true, action: TOOL_NAME, data: [] });
        expect((envelope(result).meta as { count?: number }).count).toBe(0);
    });

    it("uses the shared 403 recovery envelope", async () => {
        const seen = calls();
        const client = await connect(
            webhooksContext(seen, async () => {
                throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
            }),
        );
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "webhook-1" },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result)).toMatchObject({
            ok: false,
            action: TOOL_NAME,
            error: { code: "auth_or_permission", message: "Forbidden" },
            recovery: { retryable: false },
        });
    });

    it("returns not_found on 404 without invoking a write", async () => {
        const seen = calls();
        const client = await connect(
            webhooksContext(seen, async () => {
                throw Object.assign(new Error("Not Found"), { statusCode: 404 });
            }),
        );
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "missing-webhook" },
        });

        expect(result.isError).toBe(true);
        expect(envelope(result).error).toEqual({ code: "not_found", message: "Not Found" });
        expect(seen.writes).toBe(0);
    });

    it.each([{}, { webhookId: "" }])(
        "rejects a missing or invalid webhook id without lookup candidates (%j)",
        async (arguments_) => {
            const seen = calls();
            const client = await connect(webhooksContext(seen));
            const result = await client.callTool({ name: TOOL_NAME, arguments: arguments_ });

            expect(result.isError).toBe(true);
            expect(seen.diagnose).toEqual([]);
            expect(seen.list).toBe(0);
            expect(seen.searchLogs).toBe(0);
            expect(seen.writes).toBe(0);
            expect(text(result)).not.toMatch(/clarification|candidates/i);
        },
    );

    it("omits recipient-controlled response bodies from text and structured results", async () => {
        const seen = calls();
        const client = await connect(
            webhooksContext(seen, async () => [
                {
                    id: "status-secret",
                    status: "FAILED",
                    statusCode: 500,
                    retryCount: 4,
                    responseBody: RESPONSE_BODY_MARKER,
                },
            ]),
        );
        const result = await client.callTool({
            name: TOOL_NAME,
            arguments: { webhookId: "webhook-secret" },
        });

        expect(result.isError).toBeFalsy();
        expect(text(result)).not.toContain(RESPONSE_BODY_MARKER);
        expect(JSON.stringify(result.structuredContent)).not.toContain(RESPONSE_BODY_MARKER);
        expect(envelope(result).data).toEqual([
            {
                id: "status-secret",
                status: "FAILED",
                statusCode: 500,
                retryCount: 4,
            },
        ]);
        expect(envelope(result).warnings).toEqual([
            { message: "Webhook response bodies are omitted from MCP results for safety." },
        ]);
    });

    it("advertises the exact read-only public contract without guard controls", async () => {
        const seen = calls();
        const client = await connect(webhooksContext(seen));
        const tool = (await client.listTools()).tools.find((candidate) => candidate.name === TOOL_NAME);

        expect(tool?.title).toBe("Diagnose webhook delivery");
        expect(tool?.annotations).toEqual({
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        });
        expect(tool?._meta).toMatchObject({
            [RISK_META_KEY]: "read",
            [CONFIRMATION_META_KEY]: "none",
        });
        const schema = tool?.inputSchema as {
            required?: string[];
            properties?: Record<string, Record<string, unknown>>;
        };
        expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
            "page",
            "pageSize",
            "status",
            "webhookId",
        ]);
        expect(schema.required).toEqual(["webhookId"]);
        expect(schema.properties?.webhookId).toMatchObject({ type: "string", minLength: 1 });
        expect(schema.properties?.page).toMatchObject({ type: "integer", minimum: 1, default: 1 });
        expect(schema.properties?.pageSize).toMatchObject({
            type: "integer",
            minimum: 1,
            maximum: 200,
            default: 50,
        });
        expect(schema.properties?.status).toMatchObject({
            type: "string",
            enum: ["SUCCEEDED", "RETRYING", "FAILED"],
        });
        expect(schema.properties).not.toHaveProperty("dry_run");
        expect(schema.properties).not.toHaveProperty("confirm_token");
    });
});
