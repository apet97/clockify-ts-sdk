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
                listOnProject: async (req: unknown) => {
                    captured.listOnProject = req;
                    return { projectId: "proj-1", total: 40 };
                },
                listPerProject: async (req: unknown) => {
                    captured.listPerProject = req;
                    return [{ projectId: "proj-1" }, { projectId: "proj-2" }];
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

describe("clockify_scheduling_assignments_list_per_project — single vs all routing", () => {
    it("uses the single-project GET endpoint when projectId is given", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        // start/end are required by the schema (the all-projects search needs
        // them); the single-project GET ignores them.
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_list_per_project",
            arguments: { projectId: "proj-1", start: "2020-01-01T00:00:00Z", end: "2030-01-01T00:00:00Z" },
        });
        expect(res.isError).toBeFalsy();
        // Routes to listOnProject (GET .../projects/totals/{projectId}); NOT the
        // all-projects POST (where projectId would be silently dropped).
        expect(captured.listOnProject).toEqual({ workspaceId: "ws-1", projectId: "proj-1" });
        expect(captured.listPerProject).toBeUndefined();
    });

    it("uses the all-projects endpoint when no projectId is given, with camel pageSize", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        // start/end are required (omitting them 400s on the wire, live-verified 2026-06-18).
        await client.callTool({
            name: "clockify_scheduling_assignments_list_per_project",
            arguments: { start: "2020-01-01T00:00:00Z", end: "2030-01-01T00:00:00Z" },
        });
        expect(captured.listPerProject).toBeDefined();
        expect(captured.listOnProject).toBeUndefined();
        const req = captured.listPerProject as Record<string, unknown>;
        // The body whitelist reads camel `pageSize`; kebab `page-size` is ignored
        // (returns ALL projects), so the tool must NOT send it.
        expect(req.pageSize).toBe(50);
        expect(req["page-size"]).toBeUndefined();
        expect(req.start).toBe("2020-01-01T00:00:00Z");
        expect(req.end).toBe("2030-01-01T00:00:00Z");
    });

    it("requires start and end (rejects the request at the input layer)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(schedulingContext(captured));
        const res = await client.callTool({
            name: "clockify_scheduling_assignments_list_per_project",
            arguments: {},
        });
        expect(res.isError).toBeTruthy();
        expect(captured.listPerProject).toBeUndefined();
    });
});
