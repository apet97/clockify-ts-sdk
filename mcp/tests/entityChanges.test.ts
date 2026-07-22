import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { CONFIRMATION_META_KEY, RISK_META_KEY } from "../src/result.js";
import { buildServer } from "../src/server.js";

interface Calls {
    created: unknown[];
    deleted: unknown[];
    updated: unknown[];
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

function context(
    calls: Calls,
    options: {
        created?: (request: unknown) => Promise<unknown>;
        deleted?: (request: unknown) => Promise<unknown>;
        updated?: (request: unknown) => Promise<unknown>;
    } = {},
): Context {
    return {
        workspaceId: "ws-1",
        client: {
            entityChangesExperimental: {
                listCreated: async (request: unknown) => {
                    calls.created.push(request);
                    if (options.created) return options.created(request);
                    return "created-wire-response";
                },
                listDeleted: async (request: unknown) => {
                    calls.deleted.push(request);
                    if (options.deleted) return options.deleted(request);
                    return { response: [{ id: "deleted-1" }] };
                },
                listUpdated: async (request: unknown) => {
                    calls.updated.push(request);
                    if (options.updated) return options.updated(request);
                    return "updated-wire-response";
                },
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "entity-changes-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(result: unknown): Record<string, unknown> {
    const value = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(value) as Record<string, unknown>;
}

function httpError(statusCode: number): Error & { statusCode: number } {
    return Object.assign(new Error(`status ${statusCode}`), { statusCode });
}

describe("experimental entity-change feed", () => {
    it("routes created changes once and preserves the generated string response", async () => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: {
                changeType: "created",
                types: ["PROJECTS", "TIME_ENTRY"],
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-30T23:59:59Z",
                page: "cursor-2",
                limit: "25",
            },
        });

        expect(result.isError).toBeFalsy();
        expect(calls).toEqual({
            created: [
                {
                    workspaceId: "ws-1",
                    type: ["PROJECTS", "TIME_ENTRY"],
                    start: "2026-06-01T00:00:00Z",
                    end: "2026-06-30T23:59:59Z",
                    page: "cursor-2",
                    limit: "25",
                },
            ],
            deleted: [],
            updated: [],
        });
        expect(envelope(result)).toMatchObject({
            ok: true,
            data: "created-wire-response",
            meta: {
                workspaceId: "ws-1",
                changeType: "created",
                types: ["PROJECTS", "TIME_ENTRY"],
                page: "cursor-2",
                limit: "25",
            },
            warnings: [{ code: "experimental_api" }],
        });
        expect(envelope(result).meta).not.toHaveProperty("count");
    });

    it("routes updated changes without inventing query defaults or parsing data", async () => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: { changeType: "updated", types: ["CLIENTS"] },
        });

        expect(result.isError).toBeFalsy();
        expect(calls).toEqual({
            created: [],
            deleted: [],
            updated: [{ workspaceId: "ws-1", type: ["CLIENTS"] }],
        });
        expect(envelope(result)).toMatchObject({
            data: "updated-wire-response",
            meta: { workspaceId: "ws-1", changeType: "updated", types: ["CLIENTS"] },
            warnings: [{ code: "experimental_api" }],
        });
        expect(envelope(result).meta).not.toHaveProperty("page");
        expect(envelope(result).meta).not.toHaveProperty("limit");
        expect(envelope(result).meta).not.toHaveProperty("count");
    });

    it("routes deleted changes and counts only the generated response array", async () => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: { changeType: "deleted", types: ["TASKS"], page: "3", limit: "10" },
        });

        expect(result.isError).toBeFalsy();
        expect(calls).toEqual({
            created: [],
            deleted: [
                { workspaceId: "ws-1", type: ["TASKS"], page: "3", limit: "10" },
            ],
            updated: [],
        });
        expect(envelope(result)).toMatchObject({
            data: { response: [{ id: "deleted-1" }] },
            meta: {
                workspaceId: "ws-1",
                changeType: "deleted",
                types: ["TASKS"],
                page: "3",
                limit: "10",
                count: 1,
            },
            warnings: [{ code: "experimental_api" }],
        });
    });

    it("omits deleted count when the generated response field is absent", async () => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls, { deleted: async () => ({}) }));

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: { changeType: "deleted", types: ["TAGS"] },
        });

        expect(result.isError).toBeFalsy();
        expect(envelope(result).data).toEqual({});
        expect(envelope(result).meta).not.toHaveProperty("count");
    });

    it.each([
        [httpError(403), "auth_or_permission", false],
        [httpError(404), "not_found", false],
        [new Error("fetch failed"), "connection_error", true],
    ] as const)("maps %s through shared recovery", async (error, code, retryable) => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(
            context(calls, {
                created: async () => {
                    throw error;
                },
            }),
        );

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: { changeType: "created", types: ["PROJECTS"] },
        });
        const json = envelope(result);

        expect(result.isError).toBe(true);
        expect(json).toMatchObject({
            ok: false,
            error: { code },
            recovery: { retryable },
        });
        expect(json.data).toBeUndefined();
        expect(json.warnings).toBeUndefined();
        expect(calls).toEqual({
            created: [{ workspaceId: "ws-1", type: ["PROJECTS"] }],
            deleted: [],
            updated: [],
        });
    });

    it.each([
        ["empty types", { changeType: "created", types: [] }],
        ["invalid type", { changeType: "created", types: ["USERS"] }],
        ["invalid discriminator", { changeType: "all", types: ["PROJECTS"] }],
        ["workspace injection", { changeType: "created", types: ["PROJECTS"], workspaceId: "ws-2" }],
        ["body injection", { changeType: "created", types: ["PROJECTS"], body: {} }],
        ["unknown field", { changeType: "created", types: ["PROJECTS"], unexpected: true }],
        ["numeric page", { changeType: "created", types: ["PROJECTS"], page: 2 }],
        ["numeric limit", { changeType: "created", types: ["PROJECTS"], limit: 50 }],
    ] as const)("rejects %s before every generated method", async (_label, arguments_) => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls));

        const result = await client.callTool({
            name: "clockify_entity_changes_list",
            arguments: arguments_,
        });

        expect(result.isError).toBe(true);
        expect(calls).toEqual({ created: [], deleted: [], updated: [] });
    });

    it("publishes read-only metadata with no confirmation controls", async () => {
        const calls: Calls = { created: [], deleted: [], updated: [] };
        const client = await connect(context(calls));
        const tool = (await client.listTools()).tools.find(
            ({ name }) => name === "clockify_entity_changes_list",
        );

        expect(tool).toMatchObject({
            annotations: {
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
            _meta: {
                [RISK_META_KEY]: "read",
                [CONFIRMATION_META_KEY]: "none",
            },
            inputSchema: { additionalProperties: false },
        });
        expect(tool?.inputSchema.properties).not.toHaveProperty("dry_run");
        expect(tool?.inputSchema.properties).not.toHaveProperty("confirm_token");
    });
});
