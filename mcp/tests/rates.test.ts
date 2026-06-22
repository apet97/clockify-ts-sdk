import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

function ratesContext(captured: Record<string, unknown>): Context {
    return {
        workspaceId: "ws-1",
        client: {
            projects: {
                updateUserHourlyRate: async (r: unknown) => {
                    captured.projHourly = r;
                    return { id: "proj-1" };
                },
                updateUserCostRate: async (r: unknown) => {
                    captured.projCost = r;
                    return { id: "proj-1" };
                },
            },
            tasks: {
                updateBillableRate: async (r: unknown) => {
                    captured.taskHourly = r;
                    return { id: "task-1" };
                },
                updateCostRate: async (r: unknown) => {
                    captured.taskCost = r;
                    return { id: "task-1" };
                },
            },
            workspaces: {
                updateUserHourlyRate: async (r: unknown) => {
                    captured.wsHourly = r;
                    return {};
                },
                updateUserCostRate: async (r: unknown) => {
                    captured.wsCost = r;
                    return {};
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

describe("rate-setting tools convert MAJOR → integer minor and route by kind", () => {
    it("clockify_projects_set_member_rate HOURLY → updateUserHourlyRate with minor units", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        const res = await client.callTool({
            name: "clockify_projects_set_member_rate",
            arguments: { projectId: "proj-1", userId: "u1", rateKind: "HOURLY", amount: 75 },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.projHourly).toEqual({ workspaceId: "ws-1", projectId: "proj-1", userId: "u1", amount: 7500 });
        expect(captured.projCost).toBeUndefined();
    });

    it("clockify_projects_set_member_rate coerces a numeric-string amount (\"75\" → 75 → 7500 minor)", async () => {
        // zNumberLike unwraps "75" to 75 before the number schema, so a model
        // that emits the amount as a string still routes the right minor units.
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        const res = await client.callTool({
            name: "clockify_projects_set_member_rate",
            arguments: { projectId: "proj-1", userId: "u1", rateKind: "HOURLY", amount: "75" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured.projHourly).toEqual({ workspaceId: "ws-1", projectId: "proj-1", userId: "u1", amount: 7500 });
    });

    it("clockify_projects_set_member_rate COST → updateUserCostRate, with float-safe rounding", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        await client.callTool({
            name: "clockify_projects_set_member_rate",
            arguments: { projectId: "proj-1", userId: "u1", rateKind: "COST", amount: 75.5, since: "2026-06-01" },
        });
        expect(captured.projCost).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            userId: "u1",
            amount: 7550,
            since: "2026-06-01",
        });
    });

    it("clockify_tasks_set_rate HOURLY → tasks.updateBillableRate", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        await client.callTool({
            name: "clockify_tasks_set_rate",
            arguments: { projectId: "proj-1", taskId: "task-1", rateKind: "HOURLY", amount: 120 },
        });
        expect(captured.taskHourly).toEqual({
            workspaceId: "ws-1",
            projectId: "proj-1",
            taskId: "task-1",
            amount: 12000,
        });
    });

    it("clockify_users_set_member_rate COST → workspaces.updateUserCostRate", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        await client.callTool({
            name: "clockify_users_set_member_rate",
            arguments: { userId: "u1", rateKind: "COST", amount: 60 },
        });
        expect(captured.wsCost).toEqual({ workspaceId: "ws-1", userId: "u1", amount: 6000 });
    });

    it("clockify_users_set_member_rate emits a writeReceipt (entity + changed.updated)", async () => {
        const captured: Record<string, unknown> = {};
        const client = await connect(ratesContext(captured));
        const res = await client.callTool({
            name: "clockify_users_set_member_rate",
            arguments: { userId: "u1", rateKind: "HOURLY", amount: 80 },
        });
        const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
        const json = JSON.parse(text) as {
            ok: boolean;
            entity?: string;
            changed?: { updated?: Array<{ type: string; id: string }> };
        };
        // Was the only rate-write tool with no receipt — agents could not chain on
        // changed.updated. Now it matches the projects/tasks rate siblings.
        expect(json.ok).toBe(true);
        expect(json.entity).toBe("workspace_member");
        expect(json.changed?.updated).toEqual([{ type: "workspace_member", id: "u1" }]);
    });
});
