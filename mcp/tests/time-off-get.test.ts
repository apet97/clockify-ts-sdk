import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

// GET /time-off/requests/{id} is a dead 404 route (live-verified 2026-06-15);
// the requests live behind the POST search (`timeOff.list`, an envelope
// {count, requests}). The tool must list-and-scan, never call the dead get().
function timeOffContext(): Context {
    return {
        workspaceId: "ws-1",
        client: {
            timeOff: {
                get: async () => {
                    throw new Error("timeOff.get must not be called (it 404s on the wire)");
                },
                list: async () => ({
                    count: 2,
                    requests: [
                        { id: "req-1", policyName: "Vacation", statusType: "APPROVED" },
                        { id: "req-2", policyName: "Sick", statusType: "PENDING" },
                    ],
                }),
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

function parse(res: unknown): Record<string, unknown> {
    const text = ((res as { content?: Array<{ text: string }> }).content?.[0] ?? { text: "{}" }).text;
    return JSON.parse(text) as Record<string, unknown>;
}

describe("clockify_time_off_requests_get scans the POST search (dead single-GET)", () => {
    it("returns the matching request by id, scanned from the search envelope", async () => {
        const client = await connect(timeOffContext());
        const res = await client.callTool({ name: "clockify_time_off_requests_get", arguments: { requestId: "req-2" } });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        expect(JSON.stringify(env)).toContain("Sick");
    });

    it("errors clearly on an unknown id", async () => {
        const client = await connect(timeOffContext());
        const res = await client.callTool({ name: "clockify_time_off_requests_get", arguments: { requestId: "missing" } });
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect(JSON.stringify(env)).toMatch(/no time-off request with id/);
    });
});
