import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
    teardown = async () => {};
});

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "demo-replacement-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function envelope(result: unknown): Record<string, unknown> {
    const text = (result as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

it("demo cleanup GETs full task/client state instead of replacing from sparse list rows", async () => {
    const captured: Record<string, unknown> = {};
    const ctx: Context = {
        workspaceId: "ws-1",
        client: {
            users: { getCurrentUser: async () => ({ id: "user-1" }) },
            timeEntries: {
                listForUser: async () => [],
                delete: async () => undefined,
            },
            projects: {
                list: async () => [{ id: "p-1", name: "DEMO-safe-project" }],
                update: async () => ({}),
                delete: async () => undefined,
            },
            tasks: {
                list: async () => [{ id: "t-1", name: "DEMO-safe-task" }],
                get: async (request: unknown) => {
                    captured.taskGet = request;
                    return {
                        id: "t-1",
                        name: "DEMO-safe-task",
                        billable: false,
                        budgetEstimate: 0,
                        estimate: "",
                        assigneeIds: [],
                        userGroupIds: [],
                        status: "ACTIVE",
                    };
                },
                update: async (request: unknown) => {
                    captured.taskUpdate = request;
                    return {};
                },
                delete: async () => undefined,
            },
            tags: { list: async () => [] },
            clients: {
                list: async () => [{ id: "c-1", name: "DEMO-safe-client" }],
                get: async (request: unknown) => {
                    captured.clientGet = request;
                    return {
                        id: "c-1",
                        name: "DEMO-safe-client",
                        address: "",
                        currencyCode: "USD",
                        email: "",
                        note: "",
                        archived: false,
                    };
                },
                update: async (request: unknown) => {
                    captured.clientUpdate = request;
                    return {};
                },
                delete: async () => undefined,
            },
        } as never,
    };
    const client = await connect(ctx);
    const dryRun = envelope(
        await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-safe", dry_run: true },
        }),
    );
    const confirmToken = (dryRun.data as { confirm_token?: string }).confirm_token;
    const result = await client.callTool({
        name: "clockify_demo_cleanup",
        arguments: { prefix: "DEMO-safe", confirm_token: confirmToken },
    });

    expect(result.isError).toBeFalsy();
    expect(captured.taskGet).toEqual({ workspaceId: "ws-1", projectId: "p-1", taskId: "t-1" });
    expect(captured.taskUpdate).toEqual({
        workspaceId: "ws-1",
        projectId: "p-1",
        taskId: "t-1",
        body: {
            name: "DEMO-safe-task",
            status: "DONE",
            assigneeIds: [],
            userGroupIds: [],
            billable: false,
            budgetEstimate: 0,
            estimate: "",
        },
    });
    expect(captured.clientGet).toEqual({ workspaceId: "ws-1", clientId: "c-1" });
    expect(captured.clientUpdate).toEqual({
        workspaceId: "ws-1",
        clientId: "c-1",
        body: {
            name: "DEMO-safe-client",
            archived: true,
            address: "",
            currencyCode: "USD",
            email: "",
            note: "",
        },
    });
});
