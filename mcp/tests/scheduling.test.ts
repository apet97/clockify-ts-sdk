import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function schedulingContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            scheduling: {
                publish: async (req: unknown) => {
                    captured.publish = req;
                    return undefined;
                },
                getUsersCapacityFiltered: async (req: unknown) => {
                    captured.capacity = req;
                    return [{ userId: "u-1", capacityPerDay: 28800 }];
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

describe("scheduling completion tools", () => {
    it("clockify_scheduling_publish is a write that pins the workspace and merges extra filters", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_publish",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                notifyUsers: true,
                extra: { userGroupFilter: { ids: ["g-1"] } },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.publish).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            notifyUsers: true,
            userGroupFilter: { ids: ["g-1"] },
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect((json.data as { published?: boolean }).published).toBe(true);

        const tool = (await client.listTools()).tools.find((t) => t.name === "clockify_scheduling_publish");
        expect(tool?.annotations?.readOnlyHint).toBe(false);
    });

    it("clockify_scheduling_capacity passes pagination + filters and returns the rows read-only", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_capacity",
            arguments: {
                start: "2026-06-01T00:00:00Z",
                end: "2026-06-07T00:00:00Z",
                page: 2,
                pageSize: 10,
                extra: { statusFilter: "PUBLISHED" },
            },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.capacity).toEqual({
            workspaceId: "ws-1",
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-07T00:00:00Z",
            page: 2,
            pageSize: 10,
            statusFilter: "PUBLISHED",
        });
        const json = envelope(res);
        expect(json.ok).toBe(true);
        expect(json.changed).toBeUndefined();
        expect((json.meta as { count?: number }).count).toBe(1);

        const tool = (await client.listTools()).tools.find((t) => t.name === "clockify_scheduling_capacity");
        expect(tool?.annotations?.readOnlyHint).toBe(true);
    });
});
