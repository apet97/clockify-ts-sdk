import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const fakeUser = { id: "user-1", email: "alice@example.com", name: "Alice Example" };

type FakeState = {
    clients: Array<{ id: string; name: string; archived?: boolean }>;
    projects: Array<{ id: string; name: string; clientId?: string; billable?: boolean; archived?: boolean }>;
    tasks: Array<{ id: string; name: string; projectId: string }>;
    tags: Array<{ id: string; name: string }>;
    entries: Array<Record<string, unknown>>;
    clientListRequests: unknown[];
    cleanupRequests: unknown[];
    webhookCreates: number;
};

function fakeContext(seed?: Partial<FakeState>): Context & { state: FakeState } {
    const state: FakeState = {
        clients: seed?.clients ?? [],
        projects: seed?.projects ?? [],
        tasks: seed?.tasks ?? [],
        tags: seed?.tags ?? [],
        entries: seed?.entries ?? [],
        clientListRequests: [],
        cleanupRequests: [],
        webhookCreates: 0,
    };
    return {
        state,
        workspaceId: "ws-1",
        client: {
            users: {
                getCurrentUser: async () => fakeUser,
                list: async () => [fakeUser],
            },
            clients: {
                list: async (req: { name?: string } = {}) => {
                    state.clientListRequests.push(req);
                    return state.clients.filter((client) => !req.name || client.name === req.name);
                },
                create: async (body: { name?: string; body?: { name?: string } }) => {
                    const client = { id: `c${state.clients.length + 1}`, name: body.name ?? body.body?.name ?? "" };
                    state.clients.push(client);
                    return client;
                },
                update: async (body: { clientId: string; name?: string; archived?: boolean }) => {
                    state.cleanupRequests.push({ type: "client.update", body });
                    const client = state.clients.find((item) => item.id === body.clientId);
                    if (!client) throw Object.assign(new Error("client not found"), { statusCode: 404 });
                    Object.assign(client, body);
                    return client;
                },
                delete: async (body: { clientId: string }) => {
                    state.cleanupRequests.push({ type: "client.delete", body });
                    state.clients = state.clients.filter((client) => client.id !== body.clientId);
                    return {};
                },
            },
            projects: {
                list: async (req: { name?: string; clients?: string[] }) =>
                    state.projects.filter((project) => {
                        if (req.name && project.name !== req.name) return false;
                        if (req.clients?.length && !req.clients.includes(project.clientId ?? "")) return false;
                        return true;
                    }),
                create: async (body: { name: string; clientId?: string; billable?: boolean }) => {
                    const project = {
                        id: `p${state.projects.length + 1}`,
                        name: body.name,
                        clientId: body.clientId,
                        billable: body.billable,
                    };
                    state.projects.push(project);
                    return project;
                },
                get: async (req: { projectId: string }) =>
                    state.projects.find((project) => project.id === req.projectId) ?? {
                        id: req.projectId,
                        name: "Existing",
                    },
                update: async (body: { projectId: string; name?: string; archived?: boolean }) => {
                    state.cleanupRequests.push({ type: "project.update", body });
                    const project = state.projects.find((item) => item.id === body.projectId);
                    if (!project) throw Object.assign(new Error("project not found"), { statusCode: 404 });
                    Object.assign(project, body);
                    return project;
                },
                delete: async (body: { projectId: string }) => {
                    state.cleanupRequests.push({ type: "project.delete", body });
                    state.projects = state.projects.filter((project) => project.id !== body.projectId);
                    return {};
                },
            },
            tasks: {
                list: async (req: { projectId: string; name?: string }) =>
                    state.tasks.filter(
                        (task) => task.projectId === req.projectId && (!req.name || task.name === req.name),
                    ),
                create: async (body: { projectId: string; name: string }) => {
                    const task = { id: `ta${state.tasks.length + 1}`, name: body.name, projectId: body.projectId };
                    state.tasks.push(task);
                    return task;
                },
                delete: async (body: { taskId: string }) => {
                    state.cleanupRequests.push({ type: "task.delete", body });
                    state.tasks = state.tasks.filter((task) => task.id !== body.taskId);
                    return {};
                },
            },
            tags: {
                list: async (req: { name?: string }) =>
                    state.tags.filter((tag) => !req.name || tag.name === req.name),
                create: async (body: { name: string }) => {
                    const tag = { id: `tg${state.tags.length + 1}`, name: body.name };
                    state.tags.push(tag);
                    return tag;
                },
                delete: async (body: { tagId: string }) => {
                    state.cleanupRequests.push({ type: "tag.delete", body });
                    state.tags = state.tags.filter((tag) => tag.id !== body.tagId);
                    return {};
                },
            },
            timeEntries: {
                listInProgress: async () => [],
                listForUser: async () => state.entries,
                create: async (body: Record<string, unknown>) => {
                    const entry = { id: `e${state.entries.length + 1}`, userId: fakeUser.id, ...body };
                    state.entries.push(entry);
                    return entry;
                },
                get: async (req: { timeEntryId: string }) =>
                    state.entries.find((entry) => entry.id === req.timeEntryId) ?? {
                        id: req.timeEntryId,
                        description: "missing",
                    },
                update: async (body: Record<string, unknown>) => {
                    const entry = state.entries.find((candidate) => candidate.id === body.timeEntryId);
                    if (!entry) throw Object.assign(new Error("entry not found"), { statusCode: 404 });
                    Object.assign(entry, body.body ?? body);
                    return entry;
                },
                stopTimer: async () => ({ id: "e-stopped", stopped: true }),
                delete: async (body: { timeEntryId: string }) => {
                    state.cleanupRequests.push({ type: "entry.delete", body });
                    state.entries = state.entries.filter((entry) => entry.id !== body.timeEntryId);
                    return {};
                },
            },
            invoices: {
                create: async (body: Record<string, unknown>) => ({ id: "inv-1", ...body }),
                list: async () => ({ invoices: [] }),
            },
            expenses: {
                create: async (body: Record<string, unknown>) => ({ id: "ex-1", ...body }),
            },
            expenseCategories: {
                list: async () => [{ id: "cat-1", name: "Travel" }],
            },
            timeOffPolicies: {
                list: async () => [{ id: "pol-1", name: "Vacation" }],
            },
            timeOff: {
                submit: async (body: Record<string, unknown>) => ({ id: "to-1", ...body }),
            },
            scheduling: {
                create: async (body: Record<string, unknown>) => ({ id: "sch-1", ...body }),
                list: async () => [],
            },
            webhooks: {
                create: async (body: Record<string, unknown>) => {
                    state.webhookCreates += 1;
                    return { id: "wh-1", ...body };
                },
                list: async () => ({ webhooks: [] }),
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
    const client = new Client({ name: "workflow-test", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function parse(res: unknown): Record<string, unknown> {
    const text = ((res as { content: Array<{ text: string }> }).content[0] ?? { text: "{}" }).text;
    return JSON.parse(text);
}

describe("workflow tools", () => {
    it("advertises the workflow surface with annotations", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;
        const names = tools.map((tool) => tool.name);
        expect(names).toEqual(
            expect.arrayContaining([
                "clockify_tools_guide",
                "clockify_create_work_package",
                "clockify_log_work",
                "clockify_start_work",
                "clockify_stop_work",
                "clockify_switch_work",
                "clockify_review_day",
                "clockify_review_week",
                "clockify_fix_entry",
                "clockify_invoice_client_work",
                "clockify_record_expense",
                "clockify_request_time_off",
                "clockify_schedule_work",
                "clockify_setup_webhook",
                "clockify_demo_seed",
                "clockify_demo_cleanup",
            ]),
        );
        expect(tools.length).toBeGreaterThanOrEqual(105);
        expect(tools.find((tool) => tool.name === "clockify_review_day")?.annotations).toMatchObject({
            readOnlyHint: true,
        });
        expect(tools.find((tool) => tool.name === "clockify_setup_webhook")?.annotations).toMatchObject({
            destructiveHint: true,
        });
    });

    it("create_work_package creates missing objects and reports change sets plus next actions", async () => {
        const ctx = fakeContext();
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_create_work_package",
            arguments: { client: "Acme", project: "Launch", task: "Build", tag: "Deep Work" },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            entity: "work_package",
            ids: { clientId: "c1", projectId: "p1", taskId: "ta1" },
            changed: {
                created: [
                    { type: "client", id: "c1", name: "Acme" },
                    { type: "project", id: "p1", name: "Launch" },
                    { type: "task", id: "ta1", name: "Build" },
                    { type: "tag", id: "tg1", name: "Deep Work" },
                ],
            },
            next: [{ tool: "clockify_log_work" }, { tool: "clockify_start_work" }],
        });
        expect(ctx.state.clients).toHaveLength(1);
        expect(ctx.state.projects).toHaveLength(1);
    });

    it("create_work_package reuses exact existing names when upsert is not false", async () => {
        const ctx = fakeContext({
            clients: [{ id: "c9", name: "Acme" }],
            projects: [{ id: "p9", name: "Launch", clientId: "c9" }],
            tasks: [{ id: "ta9", name: "Build", projectId: "p9" }],
            tags: [{ id: "tg9", name: "Deep Work" }],
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_create_work_package",
            arguments: { client: "Acme", project: "Launch", task: "Build", tags: ["Deep Work"] },
        });
        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            ids: { clientId: "c9", projectId: "p9", taskId: "ta9" },
            changed: {
                reused: [
                    { type: "client", id: "c9", name: "Acme" },
                    { type: "project", id: "p9", name: "Launch" },
                    { type: "task", id: "ta9", name: "Build" },
                    { type: "tag", id: "tg9", name: "Deep Work" },
                ],
            },
        });
        expect(ctx.state.clients).toHaveLength(1);
        expect(ctx.state.projects).toHaveLength(1);
    });

    it("create_work_package filters clients by name before creating", async () => {
        const ctx = fakeContext({
            clients: [{ id: "c-existing", name: "Acme" }],
        });
        const client = await connect(ctx);

        const res = await client.callTool({
            name: "clockify_create_work_package",
            arguments: { client: "Acme", project: "Launch" },
        });

        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            ids: { clientId: "c-existing" },
            changed: {
                reused: [{ type: "client", id: "c-existing", name: "Acme" }],
            },
        });
        expect(ctx.state.clients).toHaveLength(1);
        expect(ctx.state.clientListRequests).toContainEqual(expect.objectContaining({ name: "Acme" }));
    });

    it("log_work accepts names, resolves them, and returns entry change guidance", async () => {
        const client = await connect(
            fakeContext({
                projects: [{ id: "p9", name: "Launch" }],
                tasks: [{ id: "ta9", name: "Build", projectId: "p9" }],
                tags: [{ id: "tg9", name: "Deep Work" }],
            }),
        );
        const res = await client.callTool({
            name: "clockify_log_work",
            arguments: {
                description: "Ship workflows",
                start: "2026-05-26T09:00:00.000Z",
                end: "2026-05-26T10:00:00.000Z",
                project: "Launch",
                task: "Build",
                tag: "Deep Work",
            },
        });
        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            entity: "entry",
            ids: { entryId: "e1", projectId: "p9", taskId: "ta9" },
            changed: { created: [{ type: "entry", id: "e1", name: "Ship workflows" }] },
            next: [{ tool: "clockify_review_day" }, { tool: "clockify_fix_entry" }],
        });
    });

    it("log_work accepts durationSeconds as a camelCase alias", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_log_work",
            arguments: {
                description: "Duration alias",
                durationSeconds: 600,
                end: "2026-05-26T12:30:00.000Z",
            },
        });
        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            data: {
                start: "2026-05-26T12:20:00.000Z",
                end: "2026-05-26T12:30:00.000Z",
            },
        });
    });

    it("setup_webhook dry-runs, confirms once, and rejects token replay", async () => {
        const ctx = fakeContext();
        const client = await connect(ctx);
        const args = {
            name: "Audit",
            url: "https://example.com/clockify",
            webhook_event: "NEW_TIME_ENTRY",
        };
        const directRes = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: args,
        });
        expect(directRes.isError).toBe(true);
        expect(parse(directRes)).toMatchObject({
            ok: false,
            recovery: { tool: "clockify_setup_webhook", args: { dry_run: true } },
        });

        const previewRes = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: { ...args, dry_run: true },
        });
        const preview = parse(previewRes);
        expect(preview).toMatchObject({
            ok: true,
            entity: "confirmation",
            data: {
                preview: expect.objectContaining({
                    name: "Audit",
                    triggerSourceType: "WORKSPACE_ID",
                    triggerSource: ["ws-1"],
                }),
            },
        });
        expect(ctx.state.webhookCreates).toBe(0);

        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        const createRes = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: { ...args, confirm_token: confirmToken },
        });
        expect(parse(createRes)).toMatchObject({
            ok: true,
            entity: "webhook",
            changed: { created: [{ type: "webhook", id: "wh-1", name: "Audit" }] },
        });
        expect(ctx.state.webhookCreates).toBe(1);

        const replayRes = await client.callTool({
            name: "clockify_setup_webhook",
            arguments: { ...args, confirm_token: confirmToken },
        });
        expect(replayRes.isError).toBe(true);
        expect(parse(replayRes)).toMatchObject({
            ok: false,
            error: { code: "invalid_request" },
            recovery: { tool: "clockify_setup_webhook" },
        });
    });

    it("setup_webhook refuses an SSRF/private-host callback URL end-to-end, even on dry_run", async () => {
        const ctx = fakeContext();
        const client = await connect(ctx);
        for (const url of [
            "https://169.254.169.254/hook", // cloud metadata
            "https://10.0.0.5/hook", // RFC-1918 private
            "https://localhost/hook", // loopback name
            "http://example.com/hook", // non-HTTPS
        ]) {
            const res = await client.callTool({
                name: "clockify_setup_webhook",
                // dry_run:true would normally produce a preview; the validator
                // runs first so even the preview is refused for a bad host.
                arguments: { name: "Audit", url, webhook_event: "NEW_TIME_ENTRY", dry_run: true },
            });
            expect(res.isError).toBe(true);
            expect(parse(res)).toMatchObject({ ok: false });
        }
        expect(ctx.state.webhookCreates).toBe(0);
    });

    it("invoice confirmation uses stable default dates", async () => {
        const ctx = fakeContext({ clients: [{ id: "c1", name: "Acme" }] });
        const client = await connect(ctx);
        const args = {
            client: "Acme",
            currency: "USD",
            number: "INV-1",
        };
        const previewRes = await client.callTool({
            name: "clockify_invoice_client_work",
            arguments: { ...args, dry_run: true },
        });
        const preview = parse(previewRes);
        expect(preview).toMatchObject({
            ok: true,
            data: {
                preview: expect.objectContaining({
                    issuedDate: expect.stringMatching(/T00:00:00\.000Z$/),
                    dueDate: expect.stringMatching(/T00:00:00\.000Z$/),
                }),
            },
        });

        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        const createRes = await client.callTool({
            name: "clockify_invoice_client_work",
            arguments: { ...args, confirm_token: confirmToken },
        });
        expect(parse(createRes)).toMatchObject({
            ok: true,
            entity: "invoice",
            changed: { created: [{ type: "invoice", id: "inv-1" }] },
        });
    });

    it("recoverable workflow errors include a concrete recovery tool", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_log_work",
            arguments: { description: "missing dates" },
        });
        expect(res.isError).toBe(true);
        expect(parse(res)).toMatchObject({
            ok: false,
            error: { code: "invalid_request" },
            recovery: {
                tool: "clockify_review_day",
            },
        });
    });

    it("demo_cleanup deletes deterministic entries and objects after archiving active parents", async () => {
        const ctx = fakeContext({
            clients: [
                { id: "c-demo", name: "DEMO-clean-client" },
                { id: "c-other", name: "Other" },
            ],
            projects: [
                { id: "p-demo", name: "DEMO-clean-project", clientId: "c-demo" },
                { id: "p-other", name: "Other", clientId: "c-other" },
            ],
            tasks: [
                { id: "ta-demo", name: "DEMO-clean-task", projectId: "p-demo" },
                { id: "ta-other", name: "Other", projectId: "p-other" },
            ],
            tags: [
                { id: "tg-demo", name: "DEMO-clean-tag" },
                { id: "tg-other", name: "Other" },
            ],
            entries: [
                { id: "e-demo", description: "DEMO-clean-entry" },
                { id: "e-other", description: "Other" },
            ],
        });
        const client = await connect(ctx);

        const res = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean" },
        });

        expect(res.isError).toBeFalsy();
        expect(parse(res)).toMatchObject({
            ok: true,
            data: { prefix: "DEMO-clean", deleted: 5 },
            changed: {
                deleted: expect.arrayContaining([
                    { type: "entry", id: "e-demo", name: "DEMO-clean-entry" },
                    { type: "task", id: "ta-demo", name: "DEMO-clean-task" },
                    { type: "tag", id: "tg-demo", name: "DEMO-clean-tag" },
                    { type: "project", id: "p-demo", name: "DEMO-clean-project" },
                    { type: "client", id: "c-demo", name: "DEMO-clean-client" },
                ]),
            },
        });
        expect(ctx.state.cleanupRequests).toEqual(
            expect.arrayContaining([
                { type: "entry.delete", body: expect.objectContaining({ timeEntryId: "e-demo" }) },
                { type: "task.delete", body: expect.objectContaining({ taskId: "ta-demo" }) },
                { type: "tag.delete", body: expect.objectContaining({ tagId: "tg-demo" }) },
                {
                    type: "project.update",
                    body: expect.objectContaining({
                        projectId: "p-demo",
                        name: "DEMO-clean-project",
                        archived: true,
                    }),
                },
                { type: "project.delete", body: expect.objectContaining({ projectId: "p-demo" }) },
                {
                    type: "client.update",
                    body: expect.objectContaining({
                        clientId: "c-demo",
                        body: { name: "DEMO-clean-client", archived: true },
                    }),
                },
                { type: "client.delete", body: expect.objectContaining({ clientId: "c-demo" }) },
            ]),
        );
        expect(ctx.state.clients).toEqual([{ id: "c-other", name: "Other" }]);
        expect(ctx.state.projects).toEqual([{ id: "p-other", name: "Other", clientId: "c-other" }]);
        expect(ctx.state.tasks).toEqual([{ id: "ta-other", name: "Other", projectId: "p-other" }]);
        expect(ctx.state.tags).toEqual([{ id: "tg-other", name: "Other" }]);
        expect(ctx.state.entries).toEqual([{ id: "e-other", description: "Other" }]);
    });
});
