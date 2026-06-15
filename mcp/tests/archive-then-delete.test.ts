/**
 * Clockify rejects DELETE of an ACTIVE project/task (400 "Cannot delete an active
 * …", live-verified 2026-06-15). The delete tools must archive (project) / mark
 * DONE (task) FIRST, via GET-then-PUT, then delete. This pins that order.
 *
 * (Clients are deliberately NOT covered: the generated `clients.update` whitelist
 * drops `archived`, so the SDK exposes no clean client-archive path — that's a
 * generator/spec defect, tracked OPEN in spec/evidence/discrepancies.md.)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

let teardown: () => Promise<void> = async () => {};
afterEach(async () => {
    await teardown();
});

function capturingContext(calls: string[]): Context {
    return {
        workspaceId: "ws-1",
        client: {
            projects: {
                get: async () => ({ id: "p1", name: "Proj" }),
                update: async (req: { archived?: boolean }) => {
                    calls.push(`project.update:archived=${req.archived === true}`);
                    return req;
                },
                delete: async () => {
                    calls.push("project.delete");
                    return {};
                },
            },
            tasks: {
                get: async () => ({ id: "t1", name: "Task" }),
                update: async (req: { status?: string }) => {
                    calls.push(`task.update:status=${req.status}`);
                    return req;
                },
                delete: async () => {
                    calls.push("task.delete");
                    return {};
                },
            },
        } as never,
    };
}

async function connect(ctx: Context): Promise<Client> {
    const server = buildServer(ctx);
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "test-harness", version: "0.0.0" });
    await client.connect(ct);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function dataOf(res: unknown): Record<string, unknown> {
    return JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}") as Record<string, unknown>;
}

async function confirmAndExecute(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const dry = dataOf(await client.callTool({ name, arguments: { ...args, dry_run: true } }));
    const token = (dry.data as { confirm_token?: string }).confirm_token;
    expect(token).toBeTruthy();
    return dataOf(await client.callTool({ name, arguments: { ...args, confirm_token: token } }));
}

describe("destructive deletes archive/DONE before deleting", () => {
    it("clockify_projects_delete archives (archived:true) BEFORE deleting", async () => {
        const calls: string[] = [];
        const client = await connect(capturingContext(calls));
        const res = await confirmAndExecute(client, "clockify_projects_delete", { projectId: "p1" });
        expect(res.ok).toBe(true);
        expect((res.data as { deleted?: boolean }).deleted).toBe(true);
        expect(calls).toEqual(["project.update:archived=true", "project.delete"]);
    });

    it("clockify_tasks_delete marks the task DONE BEFORE deleting", async () => {
        const calls: string[] = [];
        const client = await connect(capturingContext(calls));
        const res = await confirmAndExecute(client, "clockify_tasks_delete", { projectId: "p1", taskId: "t1" });
        expect(res.ok).toBe(true);
        expect((res.data as { deleted?: boolean }).deleted).toBe(true);
        expect(calls).toEqual(["task.update:status=DONE", "task.delete"]);
    });
});
