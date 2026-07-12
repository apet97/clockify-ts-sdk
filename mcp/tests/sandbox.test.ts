/**
 * Live sandbox tests for @apet97/clockify-mcp-115. Connects to a real
 * Clockify workspace via the same `loadContext()` + `buildServer()`
 * path that the stdio bin uses, but pipes the MCP transport through
 * `InMemoryTransport.createLinkedPair()` so the assertions can run
 * inside vitest without spawning a child process.
 *
 * Gated on `CLOCKIFY_API_KEY` + `CLOCKIFY_WORKSPACE_ID`; without
 * them the suite skips cleanly. When credentials exist, the root live
 * orchestrator's governed `CLOCKIFY_LIVE_PREFIX` is mandatory so every
 * created object belongs to one discoverable cleanup run. Mirrors
 * `wrapper/tests/sandbox.test.ts` and `cli/tests/sandbox.test.ts` so
 * GitHub-hosted CI runners (which intentionally don't get production
 * credentials) keep passing.
 *
 * Coverage includes read-only list/status smoke plus workflow live
 * paths that create and clean up sandbox clients, projects, tasks,
 * tags, time entries, and one guarded business resource in the same test.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { loadContext } from "../src/client.js";
import { buildServer } from "../src/server.js";

import {
    buildClientArchiveBody,
    buildProjectArchiveBody,
    buildTaskDoneBody,
    countExactInvoiceNumber,
    entitlementMarker,
    exerciseGuardedLiveWrite,
    liveObjectName,
    parseLiveEnvelope,
    requireLivePrefix,
    runCleanupSteps,
    type LiveCleanupReceipt,
    type LiveCleanupStep,
    type LiveEnvelope,
    type GuardedLiveWriteResult,
} from "./live-sandbox-support.js";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
const liveCredentialsAvailable = Boolean(apiKey && workspaceId);
// Fail closed when someone supplies credentials outside the governed root
// orchestrator. A missing prefix must never create unowned sandbox objects.
const livePrefix = liveCredentialsAvailable ? requireLivePrefix() : undefined;
const liveSandboxAvailable = liveCredentialsAvailable && livePrefix !== undefined;

const describeLive = liveSandboxAvailable ? describe : describe.skip;

if (!liveSandboxAvailable) {
    console.warn(
        "[sandbox.test] CLOCKIFY_API_KEY and/or CLOCKIFY_WORKSPACE_ID not set in env; MCP live tests skipped.",
    );
}

describeLive("@apet97/clockify-mcp-115 live sandbox", () => {
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

    function parse(res: unknown): LiveEnvelope {
        return parseLiveEnvelope(res);
    }

    function expectClean(receipt: LiveCleanupReceipt): void {
        expect(receipt.failed).toBe(0);
        expect(receipt.remaining).toBe(0);
        expect(receipt.deleted).toBe(receipt.idCount);
    }

    async function cleanupPackage(
        ids: Record<string, string>,
        leadingSteps: readonly LiveCleanupStep[] = [],
    ): Promise<LiveCleanupReceipt> {
        const ctx = loadContext();
        const steps: LiveCleanupStep[] = [...leadingSteps];
        if (ids.taskId && ids.projectId) {
            const taskId = ids.taskId;
            const projectId = ids.projectId;
            steps.push({
                entityType: "task",
                idCount: 1,
                cleanup: async () => {
                    const current = await ctx.client.tasks.get({
                        workspaceId: workspaceId!,
                        projectId,
                        taskId,
                    });
                    await ctx.client.tasks.update({
                        workspaceId: workspaceId!,
                        projectId,
                        taskId,
                        body: buildTaskDoneBody(current),
                    } as never);
                    await ctx.client.tasks.delete({
                        workspaceId: workspaceId!,
                        projectId,
                        taskId,
                    });
                },
            });
        }
        if (ids.projectId) {
            const projectId = ids.projectId;
            steps.push({
                entityType: "project",
                idCount: 1,
                cleanup: async () => {
                    const project = await ctx.client.projects.get({
                        workspaceId: workspaceId!,
                        projectId,
                    });
                    await ctx.client.projects.update({
                        workspaceId: workspaceId!,
                        projectId,
                        body: buildProjectArchiveBody(project),
                    } as never);
                    await ctx.client.projects.delete({
                        workspaceId: workspaceId!,
                        projectId,
                    });
                },
            });
        }
        if (ids.clientId) {
            const clientId = ids.clientId;
            steps.push({
                entityType: "client",
                idCount: 1,
                cleanup: async () => {
                    const current = await ctx.client.clients.get({
                        workspaceId: workspaceId!,
                        clientId,
                    });
                    await ctx.client.clients.update({
                        workspaceId: workspaceId!,
                        clientId,
                        body: buildClientArchiveBody(current),
                    } as never);
                    await ctx.client.clients.delete({
                        workspaceId: workspaceId!,
                        clientId,
                    });
                },
            });
        }
        if (ids.tagId) {
            const tagId = ids.tagId;
            steps.push({
                entityType: "tag",
                idCount: 1,
                cleanup: async () => {
                    await ctx.client.tags.delete({
                        workspaceId: workspaceId!,
                        tagId,
                    });
                },
            });
        }
        return runCleanupSteps(steps);
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
        const slug = liveObjectName(livePrefix!, "mcp-tag");
        let tagId = "";
        try {
            const createRes = await client.callTool({
                name: "clockify_tags_create",
                arguments: { name: slug },
            });
            expect(createRes.isError).toBeFalsy();
            const created = parse(createRes);
            expect(created.ok).toBe(true);
            if (!created.ok) throw new Error("tag create envelope was not ok");
            tagId = (created.data as { id?: string }).id ?? "";
            expect(tagId).toBeTruthy();

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
        } finally {
            const ctx = loadContext();
            const receipt = await runCleanupSteps(
                tagId
                    ? [
                          {
                              entityType: "tag",
                              idCount: 1,
                              cleanup: async () => {
                                  await ctx.client.tags.delete({
                                      workspaceId: workspaceId!,
                                      tagId,
                                  });
                              },
                          },
                      ]
                    : [],
            );
            expectClean(receipt);
        }
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
        const slug = liveObjectName(livePrefix!, "mcp-work-package");
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
            expectClean(await cleanupPackage(ids));
        }
    }, 45_000);

    it("guards an entitled business write with bare rejection, dry-run, and one-use execution", async (testContext) => {
        const client = await connect();
        const clientName = liveObjectName(livePrefix!, "mcp-invoice-client");
        const invoiceNumber = liveObjectName(livePrefix!, "mcp-invoice");
        let clientId = "";
        let invoiceId = "";
        try {
            const clientResult = parse(
                await client.callTool({
                    name: "clockify_clients_create",
                    arguments: { name: clientName },
                }),
            );
            expect(clientResult.ok).toBe(true);
            if (!clientResult.ok) throw new Error("invoice client create envelope was not ok");
            clientId = (clientResult.data as { id?: string }).id ?? "";
            expect(clientId).toBeTruthy();

            let result: GuardedLiveWriteResult;
            try {
                result = await exerciseGuardedLiveWrite(
                    client,
                    "clockify_invoices_create",
                    {
                        clientId,
                        number: invoiceNumber,
                        currency: "USD",
                        issuedDate: "2026-07-12",
                        dueDate: "2026-07-19",
                    },
                    {
                        countExactMatches: async () => {
                            const ctx = loadContext();
                            return countExactInvoiceNumber(
                                (page, pageSize) =>
                                    ctx.client.invoices.list({
                                        workspaceId: workspaceId!,
                                        statuses: ["UNSENT"],
                                        page,
                                        "page-size": pageSize,
                                    }),
                                invoiceNumber,
                            );
                        },
                    },
                );
            } catch (error) {
                const marker = entitlementMarker(error);
                if (!marker) throw error;
                console.warn(marker);
                testContext.skip();
                return;
            }
            if (result.outcome === "entitlement_limited") {
                // The helper admits only feature_unavailable / HTTP 402. A 403
                // or 404 throws and fails this test instead of being mislabeled.
                console.warn(result.marker);
                testContext.skip();
                return;
            }

            invoiceId = (result.executed.data as { id?: string }).id ?? "";
            expect(invoiceId).toBeTruthy();
            expect(result.preview.data).toMatchObject({
                preview: {
                    action: "create",
                    entity: "invoice",
                    number: invoiceNumber,
                },
            });
        } finally {
            const ctx = loadContext();
            const invoiceSteps: LiveCleanupStep[] = invoiceId
                ? [
                      {
                          entityType: "invoice",
                          idCount: 1,
                          cleanup: async () => {
                              await ctx.client.invoices.delete({
                                  workspaceId: workspaceId!,
                                  invoiceId,
                              });
                          },
                      },
                  ]
                : [];
            const receipt = await cleanupPackage(
                clientId ? { clientId } : {},
                invoiceSteps,
            );
            expectClean(receipt);
        }
    }, 45_000);

    it("clockify_log_work logs a named package entry and deletes it", async () => {
        const client = await connect();
        const slug = liveObjectName(livePrefix!, "mcp-log-work");
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
            const entryReceipt = await runCleanupSteps(
                entryId
                    ? [
                          {
                              entityType: "time_entry",
                              idCount: 1,
                              cleanup: async () => {
                                  await ctx.client.timeEntries.delete({
                                      workspaceId: workspaceId!,
                                      timeEntryId: entryId,
                                  });
                              },
                          },
                      ]
                    : [],
            );
            expectClean(entryReceipt);
            expectClean(await cleanupPackage(ids));
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
        const slug = liveObjectName(livePrefix!, "mcp-fix-entry");
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
            const entryReceipt = await runCleanupSteps(
                entryId
                    ? [
                          {
                              entityType: "time_entry",
                              idCount: 1,
                              cleanup: async () => {
                                  await ctx.client.timeEntries.delete({
                                      workspaceId: workspaceId!,
                                      timeEntryId: entryId,
                                  });
                              },
                          },
                      ]
                    : [],
            );
            expectClean(entryReceipt);
            expectClean(await cleanupPackage(ids));
        }
    }, 45_000);
});
