/**
 * Live sandbox tests for @clockify115/mcp-server. Connects to a real
 * Clockify workspace via the same `loadContext()` + `buildServer()`
 * path that the stdio bin uses, but pipes the MCP transport through
 * `InMemoryTransport.createLinkedPair()` so the assertions can run
 * inside vitest without spawning a child process.
 *
 * Gated on `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`; without
 * them the suite skips cleanly. Mirrors `wrapper/tests/sandbox.test.ts`
 * and `cli/tests/sandbox.test.ts` so GitHub-hosted CI runners (which
 * intentionally don't get production credentials) keep passing.
 *
 * Coverage includes read-only list/status smoke plus workflow live
 * paths that create and clean up sandbox clients, projects, tasks,
 * tags, and time entries in the same test.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import { loadContext } from "../src/client.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const liveSandboxAvailable = Boolean(apiKey && workspaceId);

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; MCP live tests skipped.",
    );
}

type EnvelopeOk = {
    ok: true;
    action: string;
    data: unknown;
    meta?: Record<string, unknown>;
    ids?: Record<string, string>;
    changed?: Record<string, unknown>;
};
type EnvelopeErr = { ok: false; action: string; error: { message: string; code?: string } };
type Envelope = EnvelopeOk | EnvelopeErr;

describeLive("@clockify115/mcp-server live sandbox", () => {
    let teardown: () => Promise<void> = async () => {};

    afterEach(async () => {
        await teardown();
        teardown = async () => {};
    });

    async function connect(): Promise<Client> {
        // loadContext reads CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID
        // from process.env, the exact path the stdio bin uses, so any
        // env-loading regression surfaces in this test.
        const ctx = loadContext();
        const server = buildServer(ctx);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await server.connect(serverTransport);
        const client = new Client({ name: "sandbox-test", version: "0.0.0" });
        await client.connect(clientTransport);
        teardown = async () => {
            await client.close();
            await server.close();
        };
        return client;
    }

    function parse(res: unknown): Envelope {
        const content = (res as { content?: unknown }).content;
        const text = (content as Array<{ type: string; text: string }> | undefined)?.[0]?.text ?? "";
        return JSON.parse(text) as Envelope;
    }

    async function cleanupPackage(ids: Record<string, string>): Promise<void> {
        const ctx = loadContext();
        if (ids.taskId && ids.projectId) {
            await ctx.client.tasks
                .delete({ workspaceId: workspaceId!, projectId: ids.projectId, taskId: ids.taskId })
                .catch(() => {});
        }
        if (ids.projectId) {
            const project = (await ctx.client.projects
                .get({ workspaceId: workspaceId!, projectId: ids.projectId })
                .catch(() => null)) as { name?: string } | null;
            if (project?.name) {
                await ctx.client.projects
                    .update({
                        workspaceId: workspaceId!,
                        projectId: ids.projectId,
                        name: project.name,
                        archived: true,
                    } as never)
                    .catch(() => {});
            }
            await ctx.client.projects
                .delete({ workspaceId: workspaceId!, projectId: ids.projectId })
                .catch(() => {});
        }
        if (ids.tagId) {
            await ctx.client.tags.delete({ workspaceId: workspaceId!, tagId: ids.tagId }).catch(() => {});
        }
        if (ids.clientId) {
            const client = (await ctx.client.clients
                .get({ workspaceId: workspaceId!, clientId: ids.clientId })
                .catch(() => null)) as { name?: string } | null;
            if (client?.name) {
                await ctx.client.clients
                    .update({
                        workspaceId: workspaceId!,
                        clientId: ids.clientId,
                        body: { name: client.name, archived: true },
                    } as never)
                    .catch(() => {});
            }
            await ctx.client.clients
                .delete({ workspaceId: workspaceId!, clientId: ids.clientId })
                .catch(() => {});
        }
    }

    it("clockify_status returns the canonical envelope and pinned workspace", async () => {
        const client = await connect();
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return; // narrow
        const data = env.data as { workspaceId?: string; user?: { id?: string; email?: string } };
        expect(data.workspaceId).toBe(workspaceId);
        expect(typeof data.user?.id).toBe("string");
    }, 20_000);

    it("clockify_clients_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_clients_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
        expect(env.meta?.page).toBe(1);
    }, 20_000);

    it("clockify_projects_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_projects_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_tags_list returns a paginated envelope", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_tags_list",
            arguments: { page: 1, pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_entries_list returns the current user's entries", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_entries_list",
            arguments: { pageSize: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        expect(Array.isArray(env.data)).toBe(true);
    }, 20_000);

    it("clockify_tags_create + delete round-trips against real Clockify", async () => {
        const client = await connect();
        const slug = `mcp-sandbox-${Date.now()}`;

        const createRes = await client.callTool({
            name: "clockify_tags_create",
            arguments: { name: slug },
        });
        expect(createRes.isError).toBeFalsy();
        const created = parse(createRes);
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error("tag create envelope was not ok");
        const tagId = (created.data as { id?: string }).id;
        expect(typeof tagId).toBe("string");

        // Listing should surface the just-created tag (within the
        // first page; the sandbox workspace has bounded tag count).
        const listRes = await client.callTool({
            name: "clockify_tags_list",
            arguments: { page: 1, pageSize: 200, name: slug },
        });
        const listEnv = parse(listRes);
        expect(listEnv.ok).toBe(true);
        if (listEnv.ok) {
            const tags = listEnv.data as Array<{ id?: string; name?: string }>;
            expect(tags.some((t) => t.id === tagId)).toBe(true);
        }

        // Mandatory cleanup — pair every create with a delete per the
        // sandbox-workspace contract. Reaching through the SDK client
        // keeps this test focused on the cheapest mutable MCP create
        // while still proving the workspace is clean afterward.
        const ctx = loadContext();
        await ctx.client.tags.delete({ workspaceId: workspaceId!, tagId: tagId! });
    }, 30_000);

    it("clockify_tools_guide returns workflow guidance", async () => {
        const client = await connect();
        const res = await client.callTool({ name: "clockify_tools_guide", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        const data = env.data as { workflows?: unknown[]; commonTasks?: unknown[] };
        expect(Array.isArray(data.workflows)).toBe(true);
        expect(Array.isArray(data.commonTasks)).toBe(true);
    }, 20_000);

    it("clockify_create_work_package creates a client/project/task/tag bundle and cleans it up", async () => {
        const client = await connect();
        const slug = `mcp-workflow-${Date.now()}`;
        let ids: Record<string, string> = {};
        try {
            const res = await client.callTool({
                name: "clockify_create_work_package",
                arguments: {
                    client: `${slug}-client`,
                    project: `${slug}-project`,
                    task: `${slug}-task`,
                    tag: `${slug}-tag`,
                },
            });
            expect(res.isError).toBeFalsy();
            const env = parse(res);
            expect(env.ok).toBe(true);
            if (!env.ok) throw new Error("create_work_package envelope was not ok");
            ids = env.ids ?? {};
            expect(ids.clientId).toBeTruthy();
            expect(ids.projectId).toBeTruthy();
            expect(ids.taskId).toBeTruthy();
            expect(ids.tagId).toBeTruthy();
            expect(env.changed).toHaveProperty("created");
        } finally {
            await cleanupPackage(ids);
        }
    }, 45_000);

    it("clockify_log_work logs a named package entry and deletes it", async () => {
        const client = await connect();
        const slug = `mcp-log-${Date.now()}`;
        let ids: Record<string, string> = {};
        let entryId = "";
        try {
            const packageRes = await client.callTool({
                name: "clockify_create_work_package",
                arguments: { project: `${slug}-project`, task: `${slug}-task`, tag: `${slug}-tag` },
            });
            const packageEnv = parse(packageRes);
            expect(packageEnv.ok).toBe(true);
            if (!packageEnv.ok) throw new Error("create_work_package envelope was not ok");
            ids = packageEnv.ids ?? {};

            const start = "2026-05-26T09:00:00.000Z";
            const end = "2026-05-26T09:15:00.000Z";
            const logRes = await client.callTool({
                name: "clockify_log_work",
                arguments: {
                    start,
                    end,
                    description: `${slug} finished work`,
                    project_id: ids.projectId,
                    task_id: ids.taskId,
                    tag_ids: ids.tagId ? [ids.tagId] : [],
                    allow_overlap: true,
                },
            });
            expect(logRes.isError).toBeFalsy();
            const logged = parse(logRes);
            expect(logged.ok).toBe(true);
            if (!logged.ok) throw new Error("log_work envelope was not ok");
            entryId = logged.ids?.entryId ?? "";
            expect(entryId).toBeTruthy();
            expect(logged.changed).toHaveProperty("created");
        } finally {
            const ctx = loadContext();
            if (entryId) {
                await ctx.client.timeEntries
                    .delete({ workspaceId: workspaceId!, timeEntryId: entryId })
                    .catch(() => {});
            }
            await cleanupPackage(ids);
        }
    }, 45_000);

    it("clockify_review_day returns totals and next actions", async () => {
        const client = await connect();
        const res = await client.callTool({
            name: "clockify_review_day",
            arguments: { date: "2026-05-26", include_entries: true, max_rows: 5 },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        if (!env.ok) return;
        const data = env.data as { totals?: unknown; issues?: unknown[] };
        expect(data).toHaveProperty("totals");
        expect(Array.isArray(data.issues)).toBe(true);
    }, 30_000);

    it("clockify_fix_entry updates a logged entry and deletes it", async () => {
        const client = await connect();
        const slug = `mcp-fix-${Date.now()}`;
        let ids: Record<string, string> = {};
        let entryId = "";
        try {
            const packageRes = await client.callTool({
                name: "clockify_create_work_package",
                arguments: { project: `${slug}-project` },
            });
            const packageEnv = parse(packageRes);
            expect(packageEnv.ok).toBe(true);
            if (!packageEnv.ok) throw new Error("create_work_package envelope was not ok");
            ids = packageEnv.ids ?? {};

            const logRes = await client.callTool({
                name: "clockify_log_work",
                arguments: {
                    start: "2026-05-26T10:00:00.000Z",
                    end: "2026-05-26T10:10:00.000Z",
                    description: `${slug} before`,
                    project_id: ids.projectId,
                    allow_overlap: true,
                },
            });
            const logged = parse(logRes);
            expect(logged.ok).toBe(true);
            if (!logged.ok) throw new Error("log_work envelope was not ok");
            entryId = logged.ids?.entryId ?? "";

            const fixRes = await client.callTool({
                name: "clockify_fix_entry",
                arguments: { entry_id: entryId, new_description: `${slug} after` },
            });
            expect(fixRes.isError).toBeFalsy();
            const fixed = parse(fixRes);
            expect(fixed.ok).toBe(true);
            if (!fixed.ok) throw new Error("fix_entry envelope was not ok");
            expect(fixed.changed).toHaveProperty("updated");
        } finally {
            const ctx = loadContext();
            if (entryId) {
                await ctx.client.timeEntries
                    .delete({ workspaceId: workspaceId!, timeEntryId: entryId })
                    .catch(() => {});
            }
            await cleanupPackage(ids);
        }
    }, 45_000);
});
