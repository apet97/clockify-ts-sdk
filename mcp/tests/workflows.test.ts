import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";
import { recordExpense, scheduleWork } from "../src/tools/workflows/business.js";
import { createWorkPackage } from "../src/tools/workflows/resolve.js";

const fakeUser = { id: "user-1", email: "alice@example.com", name: "Alice Example" };

type FakeState = {
    clients: Array<{
        id: string;
        name: string;
        archived?: boolean;
        address?: string;
        currencyCode?: string;
        email?: string;
        note?: string;
    }>;
    projects: Array<{
        id: string;
        name: string;
        clientId?: string;
        billable?: boolean;
        archived?: boolean;
    }>;
    tasks: Array<{ id: string; name: string; projectId: string }>;
    tags: Array<{ id: string; name: string }>;
    entries: Array<Record<string, unknown>>;
    clientListRequests: unknown[];
    cleanupRequests: unknown[];
    webhookCreates: number;
    webhookRequests: unknown[];
    schedulingCreates: number;
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
        webhookRequests: [],
        schedulingCreates: 0,
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
                    const client = {
                        id: `c${state.clients.length + 1}`,
                        name: body.name ?? body.body?.name ?? "",
                    };
                    state.clients.push(client);
                    return client;
                },
                get: async (body: { clientId: string }) => {
                    state.cleanupRequests.push({ type: "client.get", body });
                    const client = state.clients.find((item) => item.id === body.clientId);
                    if (!client)
                        throw Object.assign(new Error("client not found"), { statusCode: 404 });
                    return client;
                },
                update: async (body: {
                    clientId: string;
                    name?: string;
                    archived?: boolean;
                    body?: Record<string, unknown>;
                }) => {
                    state.cleanupRequests.push({ type: "client.update", body });
                    const client = state.clients.find((item) => item.id === body.clientId);
                    if (!client)
                        throw Object.assign(new Error("client not found"), { statusCode: 404 });
                    Object.assign(client, body.body ?? body);
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
                        if (req.clients?.length && !req.clients.includes(project.clientId ?? ""))
                            return false;
                        return true;
                    }),
                create: async (body: { name: string; clientId?: string; billable?: boolean }) => {
                    const project = {
                        id: `p${state.projects.length + 1}`,
                        name: body.name,
                        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
                        ...(body.billable !== undefined ? { billable: body.billable } : {}),
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
                    if (!project)
                        throw Object.assign(new Error("project not found"), { statusCode: 404 });
                    Object.assign(project, body);
                    return project;
                },
                delete: async (body: { projectId: string }) => {
                    state.cleanupRequests.push({ type: "project.delete", body });
                    state.projects = state.projects.filter(
                        (project) => project.id !== body.projectId,
                    );
                    return {};
                },
            },
            tasks: {
                list: async (req: { projectId: string; name?: string }) =>
                    state.tasks.filter(
                        (task) =>
                            task.projectId === req.projectId &&
                            (!req.name || task.name === req.name),
                    ),
                create: async (body: { projectId: string; name: string }) => {
                    const task = {
                        id: `ta${state.tasks.length + 1}`,
                        name: body.name,
                        projectId: body.projectId,
                    };
                    state.tasks.push(task);
                    return task;
                },
                get: async (body: { projectId: string; taskId: string }) => {
                    state.cleanupRequests.push({ type: "task.get", body });
                    const task = state.tasks.find((item) => item.id === body.taskId);
                    if (!task)
                        throw Object.assign(new Error("task not found"), { statusCode: 404 });
                    return task;
                },
                update: async (body: {
                    projectId: string;
                    taskId: string;
                    name?: string;
                    status?: string;
                    body?: Record<string, unknown>;
                }) => {
                    state.cleanupRequests.push({ type: "task.update", body });
                    const task = state.tasks.find((item) => item.id === body.taskId);
                    if (!task)
                        throw Object.assign(new Error("task not found"), { statusCode: 404 });
                    Object.assign(task, body.body ?? body);
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
                // Page-aware so iterAll/iterPages terminate: a fetcher
                // that returned the full array on every page would loop to
                // maxPages. Returns the requested slice; a short page ends
                // the walk via the length heuristic.
                listForUser: async (req: { page?: number; "page-size"?: number } = {}) => {
                    const page = req.page ?? 1;
                    const size = req["page-size"] ?? 50;
                    return state.entries.slice((page - 1) * size, page * size);
                },
                create: async (body: Record<string, unknown>) => {
                    const entry = {
                        id: `e${state.entries.length + 1}`,
                        userId: fakeUser.id,
                        ...body,
                    };
                    state.entries.push(entry);
                    return entry;
                },
                get: async (req: { timeEntryId: string }) =>
                    state.entries.find((entry) => entry.id === req.timeEntryId) ?? {
                        id: req.timeEntryId,
                        description: "missing",
                    },
                update: async (body: Record<string, unknown>) => {
                    const entry = state.entries.find(
                        (candidate) => candidate.id === body.timeEntryId,
                    );
                    if (!entry)
                        throw Object.assign(new Error("entry not found"), { statusCode: 404 });
                    Object.assign(entry, body.body ?? body);
                    return entry;
                },
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
                createRecurring: async (body: Record<string, unknown>) => {
                    state.schedulingCreates += 1;
                    return [{ id: "sch-1", ...body }];
                },
                list: async () => [],
            },
            webhooks: {
                create: async (body: Record<string, unknown>) => {
                    state.webhookCreates += 1;
                    state.webhookRequests.push(body);
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
        expect(
            tools.find((tool) => tool.name === "clockify_review_day")?.annotations,
        ).toMatchObject({
            readOnlyHint: true,
        });
        expect(
            tools.find((tool) => tool.name === "clockify_setup_webhook")?.annotations,
        ).toMatchObject({
            destructiveHint: true,
        });
    });

    it("review tools do not advertise gap/overlap detection or accept inert threshold fields", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;
        for (const name of ["clockify_review_day", "clockify_review_week"]) {
            const tool = tools.find((t) => t.name === name);
            expect(tool, `${name} should be registered`).toBeDefined();
            expect(tool?.description ?? "").not.toMatch(/gap|overlap/i);
            const props =
                (tool?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
            expect(Object.keys(props)).not.toContain("workday_start");
            expect(Object.keys(props)).not.toContain("workday_end");
            expect(Object.keys(props)).not.toContain("min_gap_minutes");
        }
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
        expect(ctx.state.clientListRequests).toContainEqual(
            expect.objectContaining({ name: "Acme" }),
        );
    });

    it.each([
        ["billable", { billable: "yes" }],
        ["is_public", { is_public: 1 }],
        ["color", { color: "not-a-hex-color" }],
    ] as const)(
        "createWorkPackage rejects invalid project %s before mutation",
        async (_field, invalid) => {
            const ctx = fakeContext();

            await expect(createWorkPackage(ctx, { project: "Launch", ...invalid })).rejects.toThrow(
                /billable|is_public|color/i,
            );
            expect(ctx.state.projects).toHaveLength(0);
            expect(ctx.state.clients).toHaveLength(0);
        },
    );

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

    it("log_work emits a clarification receipt when a name matches more than one project", async () => {
        const client = await connect(
            fakeContext({
                projects: [
                    { id: "p1", name: "Launch" },
                    { id: "p2", name: "Launch" },
                ],
            }),
        );
        const res = await client.callTool({
            name: "clockify_log_work",
            arguments: {
                description: "Ship workflows",
                start: "2026-05-26T09:00:00.000Z",
                end: "2026-05-26T10:00:00.000Z",
                project: "Launch",
            },
        });
        // An ambiguous name is a success envelope carrying a grounded "did you mean?"
        // receipt with the real candidate ids — never an error, never a guessed id.
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env).toMatchObject({
            ok: true,
            action: "clockify_log_work",
            clarification: {
                question: 'More than one project is named "Launch". Which one?',
                field: "project",
                candidates: [
                    { type: "project", id: "p1", name: "Launch" },
                    { type: "project", id: "p2", name: "Launch" },
                ],
            },
        });
        expect((res as { structuredContent?: unknown }).structuredContent).toEqual(env);
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
            trigger_source_type: "USER_ID",
            trigger_source: ["attacker-user"],
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
        expect(ctx.state.webhookRequests).toEqual([
            {
                workspaceId: "ws-1",
                body: expect.objectContaining({
                    triggerSourceType: "WORKSPACE_ID",
                    triggerSource: ["ws-1"],
                }),
            },
        ]);

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

    it("request_time_off (DAYS policy) builds period:{start,days} and omits end", async () => {
        // Capture what reaches timeOff.submit so we can prove the DAYS-unit shape.
        const ctx = fakeContext();
        const submits: Array<Record<string, unknown>> = [];
        (ctx.client.timeOff as { submit: unknown }).submit = async (
            body: Record<string, unknown>,
        ) => {
            submits.push(body);
            return { id: "to-1", ...body };
        };
        const client = await connect(ctx);
        const args = { policy_id: "pol-1", start: "2026-07-01", days: 3 };
        const previewRes = await client.callTool({
            name: "clockify_request_time_off",
            arguments: { ...args, dry_run: true },
        });
        const preview = parse(previewRes);
        // The previewed body carries the DAYS shape: {start, days}, no end.
        expect(
            (
                preview.data as {
                    preview: {
                        body: { note: string; timeOffPeriod: { period: Record<string, unknown> } };
                    };
                }
            ).preview.body,
        ).toMatchObject({ note: "" });
        expect(
            (
                preview.data as {
                    preview: { body: { timeOffPeriod: { period: Record<string, unknown> } } };
                }
            ).preview.body.timeOffPeriod.period,
        ).toEqual({ start: "2026-07-01", days: 3 });

        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        const createRes = await client.callTool({
            name: "clockify_request_time_off",
            arguments: { ...args, confirm_token: confirmToken },
        });
        expect(createRes.isError).toBeFalsy();
        // The actual wire body has period:{start,days} with no `end` key.
        const period = (submits[0]?.body as { timeOffPeriod: { period: Record<string, unknown> } })
            .timeOffPeriod.period;
        expect((submits[0]?.body as { note?: string }).note).toBe("");
        expect(period).toEqual({ start: "2026-07-01", days: 3 });
        expect("end" in period).toBe(false);
    });

    it("request_time_off errors before any write when neither end nor days is given", async () => {
        const ctx = fakeContext();
        let submitted = 0;
        (ctx.client.timeOff as { submit: unknown }).submit = async (
            body: Record<string, unknown>,
        ) => {
            submitted += 1;
            return { id: "to-1", ...body };
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_request_time_off",
            arguments: { policy_id: "pol-1", start: "2026-07-01" },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { message: string }).message).toMatch(
            /provide either .*end.* or .*days/,
        );
        expect(submitted).toBe(0);
    });

    it("request_time_off rejects end and days together before preview or write", async () => {
        const ctx = fakeContext();
        let submitted = 0;
        (ctx.client.timeOff as { submit: unknown }).submit = async () => {
            submitted += 1;
            return { id: "to-1" };
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_request_time_off",
            arguments: {
                policy_id: "pol-1",
                start: "2026-07-01",
                end: "2026-07-02",
                days: 2,
                dry_run: true,
            },
        });

        expect(res.isError).toBe(true);
        expect(parse(res)).toMatchObject({ ok: false, error: { code: "invalid_request" } });
        expect(submitted).toBe(0);
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

    it("invoice workflow does not advertise or preview an unsupported note", async () => {
        const client = await connect(fakeContext());
        const tool = (await client.listTools()).tools.find(
            (item) => item.name === "clockify_invoice_client_work",
        );
        const properties = (tool?.inputSchema as { properties?: Record<string, unknown> })
            .properties;
        expect(properties).not.toHaveProperty("note");

        const previewRes = await client.callTool({
            name: "clockify_invoice_client_work",
            arguments: {
                client_id: "c1",
                currency: "USD",
                number: "INV-NOTE",
                note: "must not be silently promised",
                dry_run: true,
            },
        });
        const preview = (parse(previewRes).data as { preview: Record<string, unknown> }).preview;
        expect(preview).not.toHaveProperty("note");
    });

    it("record_expense with no date is confirmable: the default date is stable across dry_run and confirm", async () => {
        // The defaulted expense date must be that day's midnight-UTC (a sliced
        // YYYY-MM-DD widened by normalizeDate), not a fresh ms wall-clock — else
        // the preview hash differs between dry_run and confirm and the token never
        // matches, making the common "record a $10 expense" (date omitted) case
        // un-confirmable forever.
        const ctx = fakeContext();
        const creates: Array<Record<string, unknown>> = [];
        (ctx.client.expenses as { create: unknown }).create = async (
            body: Record<string, unknown>,
        ) => {
            creates.push(body);
            return { id: "ex-1", ...body };
        };
        const client = await connect(ctx);
        const args = { category: "Travel", amount: 10 };

        const previewRes = await client.callTool({
            name: "clockify_record_expense",
            arguments: { ...args, dry_run: true },
        });
        const preview = parse(previewRes);
        expect(preview).toMatchObject({
            ok: true,
            data: {
                preview: expect.objectContaining({
                    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
                }),
            },
        });
        expect(creates).toHaveLength(0);

        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        const createRes = await client.callTool({
            name: "clockify_record_expense",
            arguments: { ...args, confirm_token: confirmToken },
        });
        expect(createRes.isError).toBeFalsy();
        expect(parse(createRes)).toMatchObject({ ok: true, entity: "expense" });
        // The mutation ran exactly once — the defaulted date survived the round-trip.
        expect(creates).toHaveLength(1);
    });

    it.each([
        ["amount", { amount: "ten" }],
        ["billable", { amount: 10, billable: "false" }],
    ] as const)(
        "recordExpense rejects invalid %s before preview or mutation",
        async (_field, invalid) => {
            const ctx = fakeContext();
            let creates = 0;
            (ctx.client.expenses as { create: unknown }).create = async () => {
                creates += 1;
                return { id: "ex-1" };
            };

            await expect(
                recordExpense(ctx, {
                    category_id: "cat-1",
                    dry_run: true,
                    ...invalid,
                }),
            ).rejects.toThrow(/amount|billable/i);
            expect(creates).toBe(0);
        },
    );

    it.each([
        ["hours_per_day", { hours_per_day: "8" }],
        ["billable", { hours_per_day: 8, billable: "true" }],
        ["include_non_working_days", { hours_per_day: 8, include_non_working_days: "false" }],
    ] as const)(
        "scheduleWork rejects invalid %s before preview or mutation",
        async (_field, invalid) => {
            const ctx = fakeContext();

            await expect(
                scheduleWork(ctx, {
                    user_id: "user-1",
                    project_id: "project-1",
                    start: "2026-07-01T09:00:00Z",
                    end: "2026-07-01T17:00:00Z",
                    dry_run: true,
                    ...invalid,
                }),
            ).rejects.toThrow(/hours_per_day|billable|include_non_working_days/i);
            expect(ctx.state.schedulingCreates).toBe(0);
        },
    );

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

    it("demo_cleanup requires dry_run confirmation, then deletes after archiving active parents", async () => {
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

        // dry_run:true issues a preview + confirm_token and performs NO deletion.
        const previewRes = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean", dry_run: true },
        });
        expect(previewRes.isError).toBeFalsy();
        const preview = parse(previewRes);
        expect(preview.ok).toBe(true);
        expect((preview.data as { preview: Record<string, unknown> }).preview).toEqual({
            prefix: "DEMO-clean",
            entries: 1,
            projects: 1,
            tasks: 1,
            tags: 1,
            clients: 1,
        });
        const confirmToken = (preview.data as { confirm_token: string }).confirm_token;
        expect(typeof confirmToken).toBe("string");
        expect(ctx.state.cleanupRequests).toEqual([]);
        expect(ctx.state.clients).toHaveLength(2);
        expect(ctx.state.entries).toHaveLength(2);

        // A bare call (neither dry_run nor confirm_token) is refused with no deletion.
        const refused = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean" },
        });
        expect(refused.isError).toBe(true);
        expect(parse(refused).ok).toBe(false);
        expect(ctx.state.cleanupRequests).toEqual([]);

        // The confirm_token executes the archive-then-delete cleanup.
        const res = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "DEMO-clean", confirm_token: confirmToken },
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
                { type: "tag.delete", body: expect.objectContaining({ tagId: "tg-demo" }) },
                {
                    type: "task.get",
                    body: expect.objectContaining({ projectId: "p-demo", taskId: "ta-demo" }),
                },
                {
                    type: "task.update",
                    body: expect.objectContaining({
                        projectId: "p-demo",
                        taskId: "ta-demo",
                        body: { name: "DEMO-clean-task", status: "DONE" },
                    }),
                },
                { type: "task.delete", body: expect.objectContaining({ taskId: "ta-demo" }) },
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
                    type: "client.get",
                    body: expect.objectContaining({ clientId: "c-demo" }),
                },
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

    it("demo_cleanup refuses a non-demo prefix before any delete", async () => {
        const ctx = fakeContext({
            clients: [{ id: "c-prod", name: "Acme-client" }],
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_demo_cleanup",
            arguments: { prefix: "Acme", dry_run: true },
        });
        expect(res.isError).toBe(true);
        expect((parse(res).error as { message: string }).message).toMatch(/reserved DEMO-/);
        expect(ctx.state.cleanupRequests).toEqual([]);
        expect(ctx.state.clients).toEqual([{ id: "c-prod", name: "Acme-client" }]);
    });
});

describe("P0 correctness — pagination + validation", () => {
    function bulkEntries(
        n: number,
        overrides: (i: number) => Record<string, unknown> = () => ({}),
    ) {
        return Array.from({ length: n }, (_, i) => ({
            id: `e${i}`,
            description: `entry ${i}`,
            start: "2026-06-15T09:00:00.000Z",
            end: "2026-06-15T10:00:00.000Z",
            projectId: "p1",
            ...overrides(i),
        }));
    }

    it("review_week walks ALL pages, not just the first 200 (no silent truncation)", async () => {
        const ctx = fakeContext({ entries: bulkEntries(250) });
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_review_week", arguments: {} });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        // count + totals reflect all 250 entries (2 pages of 200), proving
        // the single-page-200 truncation is gone.
        expect((env.meta as Record<string, unknown>).count).toBe(250);
        expect((env.data as { totals: { entries: number } }).totals.entries).toBe(250);
    });

    it("fix_entry finds an entry past row 200 (pagination, not a 200-row cap)", async () => {
        const ctx = fakeContext({
            entries: bulkEntries(250, (i) => (i === 230 ? { description: "FINDME-unique" } : {})),
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { exact_description: "FINDME-unique", new_description: "fixed-past-200" },
        });
        expect(res.isError).toBeFalsy();
        const env = parse(res);
        expect(env.ok).toBe(true);
        expect(ctx.state.entries[230]!.description).toBe("fixed-past-200");
    });

    it("fix_entry refuses an ambiguous exact_description and never updates", async () => {
        // Two entries share the exact description: fix_entry must NOT guess one —
        // it errors ("found at least .." / "expected exactly one") and fires no update.
        const ctx = fakeContext({
            entries: bulkEntries(2, () => ({ description: "DUP" })),
        });
        let updates = 0;
        const realUpdate = (
            ctx.client.timeEntries as unknown as {
                update: (b: Record<string, unknown>) => Promise<unknown>;
            }
        ).update;
        (ctx.client.timeEntries as { update: unknown }).update = async (
            body: Record<string, unknown>,
        ) => {
            updates += 1;
            return realUpdate(body);
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { exact_description: "DUP", new_description: "should-not-apply" },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { message: string }).message).toMatch(
            /found at least|expected exactly one/,
        );
        // No write fired and neither entry was mutated.
        expect(updates).toBe(0);
        expect(ctx.state.entries.map((e) => e.description)).toEqual(["DUP", "DUP"]);
    });

    it("fix_entry bounds the scan and reports a narrow-the-window error past 10k entries", async () => {
        // >10000 non-matching entries: the scan stops at the cap and asks to narrow
        // the window (or pass entry_id) rather than draining the whole history.
        const ctx = fakeContext({ entries: bulkEntries(10_050) });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { exact_description: "NEVER-MATCHES", new_description: "x" },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { message: string }).message).toMatch(
            /scanned more than|narrow the window/,
        );
    });

    it("fix_entry resolves task & tag names into the update body (was a silent no-op)", async () => {
        const ctx = fakeContext({
            entries: [
                {
                    id: "e1",
                    description: "Work",
                    start: "2026-06-15T09:00:00.000Z",
                    projectId: "p9",
                },
            ],
            projects: [{ id: "p9", name: "Launch" }],
            tasks: [{ id: "ta9", name: "Build", projectId: "p9" }],
            tags: [{ id: "tg9", name: "Deep Work" }],
        });
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { entry_id: "e1", task: "Build", tag: "Deep Work" },
        });
        expect(res.isError).toBeFalsy();
        const entry = ctx.state.entries[0]!;
        expect(entry.taskId).toBe("ta9");
        expect(entry.tagIds).toEqual(["tg9"]);
    });

    it("fix_entry preserves end/projectId/taskId/tagIds/billable on a description-only fix (replace-PUT semantics)", async () => {
        const ctx = fakeContext({
            entries: [
                {
                    id: "e1",
                    userId: "u1",
                    description: "Original",
                    billable: true,
                    projectId: "p9",
                    taskId: "ta9",
                    tagIds: ["tg9"],
                    timeInterval: {
                        start: "2026-06-15T09:00:00.000Z",
                        end: "2026-06-15T10:00:00.000Z",
                    },
                },
            ],
        });
        // The live wire is a PUT-replace: model update as DROPPING every key the
        // caller omits (the opposite of the default merge fake), so any field
        // fix_entry forgets to forward is provably wiped.
        (ctx.client.timeEntries as { update: unknown }).update = async (
            payload: Record<string, unknown>,
        ) => {
            const idx = ctx.state.entries.findIndex((e) => e.id === payload.timeEntryId);
            if (idx === -1) throw Object.assign(new Error("entry not found"), { statusCode: 404 });
            const sent = (payload.body ?? payload) as Record<string, unknown>;
            const replaced = {
                id: ctx.state.entries[idx]!.id,
                userId: ctx.state.entries[idx]!.userId,
                ...sent,
            };
            ctx.state.entries[idx] = replaced;
            return replaced;
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_fix_entry",
            arguments: { entry_id: "e1", new_description: "Updated" },
        });
        expect(res.isError).toBeFalsy();
        const entry = ctx.state.entries[0]!;
        expect(entry.description).toBe("Updated");
        expect(entry.end).toBe("2026-06-15T10:00:00.000Z");
        expect(entry.start).toBe("2026-06-15T09:00:00.000Z");
        expect(entry.projectId).toBe("p9");
        expect(entry.taskId).toBe("ta9");
        expect(entry.tagIds).toEqual(["tg9"]);
        expect(entry.billable).toBe(true);
    });

    it("review rejects an explicit start+end range with a garbage end (offline, field-named)", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_review_day",
            arguments: { start: "2026-06-01T00:00:00.000Z", end: "garbage" },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { code: string }).code).toBe("invalid_request");
        expect((env.error as { message: string }).message).toMatch(/invalid end "garbage"/);
    });

    it("log_work rejects a garbage end even when start is supplied (offline, field-named)", async () => {
        const client = await connect(fakeContext({ projects: [{ id: "p9", name: "Launch" }] }));
        const res = await client.callTool({
            name: "clockify_log_work",
            arguments: {
                description: "x",
                start: "2026-06-01T09:00:00.000Z",
                end: "garbage",
                project: "Launch",
            },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { message: string }).message).toMatch(
            /not a valid ISO 8601 timestamp/,
        );
    });
});

describe("create_work_package — transactional rollback (P1-2 compose)", () => {
    it("rolls back the created client + project when the required task step fails", async () => {
        const ctx = fakeContext();
        // Force task creation to fail after client + project were created.
        (ctx.client.tasks as { create: unknown }).create = async () => {
            Object.assign(ctx.state.clients[0]!, {
                address: "",
                currencyCode: "USD",
                email: "ops@example.test",
                note: "",
            });
            throw new Error("tasks.create 400 boom");
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_create_work_package",
            arguments: { client: "Acme", project: "Launch", task: "Build" },
        });
        expect(res.isError).toBe(true);
        const env = parse(res);
        expect(env.ok).toBe(false);
        expect((env.error as { message: string }).message).toMatch(/failed at task/);
        expect((env.error as { message: string }).message).toMatch(
            /Nothing partial was left behind/,
        );
        // created project rolled back via archive-then-delete (active delete 400s)
        expect(ctx.state.cleanupRequests).toEqual(
            expect.arrayContaining([
                { type: "project.update", body: expect.objectContaining({ archived: true }) },
                { type: "project.delete", body: expect.objectContaining({}) },
                {
                    type: "client.get",
                    body: { workspaceId: "ws-1", clientId: "c1" },
                },
                {
                    type: "client.update",
                    body: {
                        workspaceId: "ws-1",
                        clientId: "c1",
                        body: {
                            name: "Acme",
                            archived: true,
                            address: "",
                            currencyCode: "USD",
                            email: "ops@example.test",
                            note: "",
                        },
                    },
                },
                { type: "client.delete", body: expect.objectContaining({}) },
            ]),
        );
        // no orphans left behind
        expect(ctx.state.projects).toHaveLength(0);
        expect(ctx.state.clients).toHaveLength(0);
    });

    it("does NOT roll back a REUSED project when a later step fails", async () => {
        const ctx = fakeContext({ projects: [{ id: "p9", name: "Launch" }] });
        (ctx.client.tasks as { create: unknown }).create = async () => {
            throw new Error("tasks.create 400");
        };
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_create_work_package",
            arguments: { project: "Launch", task: "Build" }, // project reused, not created
        });
        expect(res.isError).toBe(true);
        // the reused project must survive — never roll back what we didn't create
        expect(ctx.state.projects).toEqual([{ id: "p9", name: "Launch" }]);
        expect(ctx.state.cleanupRequests).not.toContainEqual(
            expect.objectContaining({ type: "project.delete" }),
        );
    });
});
