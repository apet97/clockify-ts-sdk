// Server tests exercise the canonical envelope: every tool returns content[0].text
// plus structuredContent matching the advertised output schema.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { MissingCredentialsError } from "../src/client.js";
import { PACKAGE_VERSION } from "../src/generated/version.js";
import { buildServer } from "../src/server.js";

const fakeUser = { id: "user-1", email: "alice@example.com", name: "Alice" };

function fakeContext(overrides?: {
    clientsUpdate?: (req: unknown) => Promise<unknown>;
    listInProgress?: () => Promise<unknown>;
    projectsCreate?: (req: unknown) => Promise<unknown>;
    projectsList?: (req: unknown) => PromiseLike<unknown[]>;
    projectsUpdate?: (req: unknown) => Promise<unknown>;
}): Context {
    return {
        workspaceId: "ws-1",
        client: {
            users: { getCurrentUser: async () => fakeUser },
            timeEntries: {
                listInProgress: overrides?.listInProgress ?? (async () => []),
                listForUser: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "te-1", ...body }),
                updateForUser: async (req: Record<string, unknown>) => ({
                    id: "te-1",
                    stopped: true,
                    ...req,
                }),
                delete: async () => ({}),
            },
            projects: {
                list: overrides?.projectsList ?? (async () => [{ id: "p1", name: "Proj" }]),
                create:
                    overrides?.projectsCreate ??
                    (async (body: Record<string, unknown>) => ({ id: "p2", ...body })),
                get: async () => ({ id: "p1", name: "Proj" }),
                update: overrides?.projectsUpdate ?? (async (req: unknown) => req),
            },
            clients: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "c1", ...body }),
                get: async () => ({ id: "c1", name: "Client" }),
                update: overrides?.clientsUpdate ?? (async (req: unknown) => req),
            },
            tasks: {
                list: async () => [],
                get: async () => ({ id: "t1", name: "Task" }),
                update: async (req: unknown) => req,
                delete: async () => ({}),
            },
            tags: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "t1", ...body }),
            },
        } as never,
    };
}

function responseAware<T>(data: T, headers: Record<string, string>) {
    const promise = Promise.resolve(data) as Promise<T> & {
        withRawResponse(): Promise<{ data: T; rawResponse: { headers: Headers } }>;
    };
    promise.withRawResponse = async () => ({
        data,
        rawResponse: { headers: new Headers(headers) },
    });
    return promise;
}

let teardown: () => Promise<void> = async () => {};

afterEach(async () => {
    await teardown();
});

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

describe("@apet97/clockify-mcp-115", () => {
    it("advertises every tool we registered", async () => {
        const client = await connect(fakeContext());
        const list = await client.listTools();
        const names = list.tools.map((t) => t.name).sort();
        expect(names).toEqual(
            [
                // Agent discovery
                "clockify_docs_search",
                "clockify_operation_guide",
                "clockify_sdk_snippet",
                // Status
                "clockify_status",
                "clockify_doctor",
                "clockify_tools_guide",
                "clockify_plan_change",
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
                // Clients
                "clockify_clients_list",
                "clockify_clients_get",
                "clockify_clients_create",
                "clockify_clients_update",
                "clockify_clients_delete",
                // Projects
                "clockify_projects_list",
                "clockify_projects_get",
                "clockify_projects_create",
                "clockify_projects_update",
                "clockify_projects_delete",
                "clockify_projects_set_member_rate",
                // Tasks
                "clockify_tasks_list",
                "clockify_tasks_get",
                "clockify_tasks_create",
                "clockify_tasks_update",
                "clockify_tasks_delete",
                "clockify_tasks_set_rate",
                // Tags
                "clockify_tags_list",
                "clockify_tags_get",
                "clockify_tags_create",
                "clockify_tags_update",
                "clockify_tags_delete",
                // Entries
                "clockify_entries_list",
                "clockify_entries_get",
                "clockify_entries_log",
                "clockify_entries_update",
                "clockify_entries_delete",
                "clockify_entries_mark_invoiced",
                // Timer
                "clockify_timer_start",
                "clockify_timer_stop",
                // Invoices
                "clockify_invoices_list",
                "clockify_invoices_get",
                "clockify_invoices_create",
                "clockify_invoices_update",
                "clockify_invoices_delete",
                "clockify_invoices_update_status",
                "clockify_invoices_export",
                "clockify_invoices_import_time",
                "clockify_invoices_info",
                "clockify_invoices_items_list",
                "clockify_invoices_payments_list",
                // Expenses + categories
                "clockify_expenses_list",
                "clockify_expenses_get",
                "clockify_expenses_create",
                "clockify_expenses_update",
                "clockify_expenses_delete",
                "clockify_expenses_categories_list",
                "clockify_expenses_categories_create",
                "clockify_expenses_categories_update",
                "clockify_expenses_categories_delete",
                "clockify_expenses_categories_archive",
                // Webhooks
                "clockify_webhooks_list",
                "clockify_webhooks_get",
                "clockify_webhooks_delivery_diagnose",
                "clockify_webhooks_create",
                "clockify_webhooks_update",
                "clockify_webhooks_delete",
                "clockify_webhooks_events",
                // Custom fields
                "clockify_custom_fields_list",
                "clockify_custom_fields_create",
                "clockify_custom_fields_update",
                "clockify_custom_fields_delete",
                "clockify_project_custom_fields_list",
                "clockify_project_custom_fields_update",
                "clockify_project_custom_fields_remove",
                // Time off
                "clockify_time_off_requests_list",
                "clockify_time_off_requests_get",
                "clockify_time_off_requests_submit",
                "clockify_time_off_requests_update_status",
                "clockify_time_off_requests_delete",
                "clockify_time_off_policies_list",
                "clockify_time_off_policies_get",
                "clockify_time_off_policies_create",
                "clockify_time_off_policies_update",
                "clockify_time_off_policies_archive",
                "clockify_time_off_balances_list",
                "clockify_time_off_balance_for_user",
                // Users + roles
                "clockify_users_list",
                "clockify_member_profile_get",
                "clockify_users_grant_role",
                "clockify_users_revoke_role",
                "clockify_users_set_status",
                "clockify_users_set_member_rate",
                "clockify_users_invite",
                "clockify_member_profile_update",
                // Scheduling
                "clockify_scheduling_assignments_list",
                "clockify_scheduling_assignments_list_per_project",
                "clockify_scheduling_assignments_create",
                "clockify_scheduling_assignments_update",
                "clockify_scheduling_assignments_delete",
                "clockify_scheduling_publish",
                "clockify_scheduling_capacity",
                // Reports
                "clockify_reports_summary",
                "clockify_reports_detailed",
                "clockify_reports_weekly",
                "clockify_reports_attendance",
                "clockify_reports_expense",
                // Shared reports
                "clockify_shared_reports_list",
                "clockify_shared_reports_view",
                "clockify_shared_reports_create",
                "clockify_shared_reports_update",
                "clockify_shared_reports_delete",
                // Groups
                "clockify_groups_list",
                "clockify_groups_get",
                "clockify_groups_create",
                "clockify_groups_update",
                "clockify_groups_delete",
                "clockify_groups_list_members",
                "clockify_groups_add_member",
                "clockify_groups_remove_member",
                // Holidays
                "clockify_holidays_list",
                "clockify_holidays_list_in_period",
                "clockify_holidays_create",
                "clockify_holidays_update",
                "clockify_holidays_delete",
                // Approvals
                "clockify_approvals_list",
                "clockify_approvals_submit",
                "clockify_approvals_update_state",
                "clockify_approvals_resubmit",
                // Audit log
                "clockify_audit_log_search",
            ].sort(),
        );
        expect(names).toHaveLength(142);
    });

    it("advertises the generated package version", async () => {
        const client = await connect(fakeContext());
        expect(client.getServerVersion()).toEqual({
            name: "@apet97/clockify-mcp-115",
            version: PACKAGE_VERSION,
        });
    });

    it("clockify_timer_start creates a running entry and emits a created receipt", async () => {
        // Coverage gap: the handler body was never invoked by any test (only its
        // registration was asserted). Drive it end-to-end.
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_timer_start",
            arguments: { description: "writing tests", projectId: "p-9", billable: true },
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "{}");
        expect(parsed.ok).toBe(true);
        // The fake `create` echoes the request, so the assembled body is observable.
        expect(parsed.data.body.description).toBe("writing tests");
        expect(parsed.data.body.projectId).toBe("p-9");
        expect(parsed.data.body.billable).toBe(true);
        expect(typeof parsed.data.body.start).toBe("string");
        expect(parsed.changed.created[0].type).toBe("time_entry");
    });

    it("advertises agent-ready metadata for every tool", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;

        const weakDescriptions = tools
            .filter(
                (tool) =>
                    !tool.title?.trim() ||
                    !tool.description?.trim() ||
                    tool.description.length < 40,
            )
            .map((tool) => ({
                name: tool.name,
                title: tool.title ?? "",
                descriptionLength: tool.description?.length ?? 0,
            }));
        const missingAnnotations = tools
            .filter((tool) => !tool.annotations)
            .map((tool) => tool.name);

        expect(weakDescriptions).toEqual([]);
        expect(missingAnnotations).toEqual([]);
    });

    it("advertises a structured output schema for every tool", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;

        const missingOutputSchema = tools
            .filter((tool) => !tool.outputSchema)
            .map((tool) => tool.name);
        const weakOutputSchema = tools
            .filter((tool) => tool.outputSchema && !("properties" in tool.outputSchema))
            .map((tool) => tool.name);

        expect(missingOutputSchema).toEqual([]);
        expect(weakOutputSchema).toEqual([]);
    });

    it("advertises guide resources and workflow prompt", async () => {
        const client = await connect(fakeContext());
        const resources = await client.listResources();
        const prompts = await client.listPrompts();

        expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
            "clockify://guide/agent-mode",
            "clockify://guide/axioms",
            "clockify://guide/safety",
            "clockify://guide/which-tool",
            "clockify://guide/workflows",
            "clockify://mcp/doctor",
        ]);
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-workflow-plan");
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-getting-started");

        const cookbook = await client.readResource({ uri: "clockify://guide/workflows" });
        expect((cookbook.contents[0] as { text?: string }).text).toContain("clockify_status");

        const doctor = await client.readResource({ uri: "clockify://mcp/doctor" });
        expect((doctor.contents[0] as { text?: string }).text).toContain(
            "no-network diagnostics checklist",
        );
        expect((doctor.contents[0] as { text?: string }).text).toContain("CLOCKIFY_API_KEY");
    });

    it("clockify_status returns the canonical envelope", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBeFalsy();
        const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
        const parsed = JSON.parse(text);
        expect(parsed.ok).toBe(true);
        expect(parsed.data.workspaceId).toBe("ws-1");
        expect(parsed.data.user.email).toBe("alice@example.com");
        expect(parsed.data.runningEntry).toBeNull();
        expect(parsed.next).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ tool: "clockify_create_work_package" }),
            ]),
        );
    });

    it("clockify_status returns a 401-class recovery hint when auth fails", async () => {
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    getCurrentUser: async () => {
                        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
                    },
                },
                timeEntries: { listInProgress: async () => [] },
            },
        } as unknown as Context;
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.error.code).toBe("auth_or_permission");
        expect(parsed.recovery.hint).toContain("Profile");
        // First-timer friction (invalid key) points at the getting-started prompt.
        expect(parsed.recovery.hint).toContain("clockify-getting-started");
        expect(parsed.recovery.retryable).toBe(false);
    });

    it("clockify_status points an unconfigured server at the getting-started prompt", async () => {
        const error = new MissingCredentialsError(["CLOCKIFY_API_KEY", "CLOCKIFY_WORKSPACE_ID"]);
        const fail = (): never => {
            throw error;
        };
        const ctx = {
            get client() {
                return fail();
            },
            get workspaceId() {
                return fail();
            },
        } as unknown as Context;
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.error.code).toBe("setup_required");
        expect(parsed.recovery.hint).toContain("clockify-getting-started");
    });

    it("clockify_status keeps the plain failure-class hint for non-credential errors", async () => {
        const ctx = {
            workspaceId: "ws-1",
            client: {
                users: {
                    getCurrentUser: async () => {
                        throw Object.assign(new Error("Service Unavailable"), { statusCode: 503 });
                    },
                },
                timeEntries: { listInProgress: async () => [] },
            },
        } as unknown as Context;
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_status", arguments: {} });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
        expect(parsed.error.code).toBe("clockify_upstream_error");
        expect(parsed.recovery.hint).not.toContain("clockify-getting-started");
        expect(parsed.recovery.retryable).toBe(true);
    });

    it("clockify_projects_list passes pagination args through to the SDK", async () => {
        let captured: unknown = null;
        const client = await connect(
            fakeContext({
                projectsList: async (req) => {
                    captured = req;
                    return [{ id: "p1", name: "A" }];
                },
            }),
        );
        const res = await client.callTool({
            name: "clockify_projects_list",
            arguments: { page: 2, pageSize: 25, name: "foo" },
        });
        expect(res.isError).toBeFalsy();
        expect(captured).toEqual({
            workspaceId: "ws-1",
            page: 2,
            "page-size": 25,
            name: "foo",
        });
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.meta.count).toBe(1);
        expect(parsed.meta.page).toBe(2);
    });

    it("clockify_projects_list uses Last-Page:true for full final pages", async () => {
        const client = await connect(
            fakeContext({
                projectsList: () =>
                    responseAware(
                        [
                            { id: "p1", name: "A" },
                            { id: "p2", name: "B" },
                        ],
                        {
                            "Last-Page": "true",
                        },
                    ),
            }),
        );
        const res = await client.callTool({
            name: "clockify_projects_list",
            arguments: { pageSize: 2 },
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.meta.hasMore).toBe(false);
        expect(parsed.meta.lastPageHeader).toBe(true);
    });

    it("clockify_projects_update passes update fields at the SDK request top level", async () => {
        let captured: unknown = null;
        const client = await connect(
            fakeContext({
                projectsUpdate: async (req) => {
                    captured = req;
                    return { id: "p1", name: "Renamed", archived: true };
                },
            }),
        );

        const res = await client.callTool({
            name: "clockify_projects_update",
            arguments: { projectId: "p1", name: "Renamed", archived: true },
        });

        expect(res.isError).toBeFalsy();
        expect(captured).toEqual({
            workspaceId: "ws-1",
            projectId: "p1",
            body: {
                name: "Renamed",
                archived: true,
            },
        });
    });

    it.each([
        ["short name", { name: "x" }],
        ["long name", { name: "x".repeat(251) }],
        ["invalid color", { name: "Valid", color: "red" }],
        ["long note", { name: "Valid", note: "x".repeat(16_385) }],
    ])("clockify_projects_create rejects %s before dispatch", async (_label, arguments_) => {
        let dispatches = 0;
        const client = await connect(
            fakeContext({
                projectsCreate: async () => {
                    dispatches += 1;
                    return { id: "p1" };
                },
            }),
        );

        const res = await client.callTool({
            name: "clockify_projects_create",
            arguments: arguments_ as Record<string, unknown>,
        });
        expect(res.isError).toBe(true);
        expect(dispatches).toBe(0);
    });

    it.each([
        ["no fields", {}],
        ["empty name", { name: "" }],
        ["short name", { name: "x" }],
        ["invalid color", { color: "#12345" }],
        ["long note", { note: "x".repeat(16_385) }],
    ])("clockify_projects_update rejects %s before dispatch", async (_label, fields) => {
        let dispatches = 0;
        const client = await connect(
            fakeContext({
                projectsUpdate: async () => {
                    dispatches += 1;
                    return { id: "p1" };
                },
            }),
        );

        const res = await client.callTool({
            name: "clockify_projects_update",
            arguments: { projectId: "p1", ...(fields as Record<string, unknown>) },
        });
        expect(res.isError).toBe(true);
        expect(dispatches).toBe(0);
    });

    it("clockify_clients_update passes update fields in the generated SDK body", async () => {
        let captured: unknown = null;
        const client = await connect(
            fakeContext({
                clientsUpdate: async (req) => {
                    captured = req;
                    return { id: "c1", name: "Renamed", archived: true };
                },
            }),
        );

        const res = await client.callTool({
            name: "clockify_clients_update",
            arguments: { clientId: "c1", name: "Renamed", archived: true },
        });

        expect(res.isError).toBeFalsy();
        expect(captured).toEqual({
            workspaceId: "ws-1",
            clientId: "c1",
            body: {
                name: "Renamed",
                archived: true,
            },
        });
    });

    it("clockify_entries_log rejects when neither start nor durationSeconds is given", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: { description: "missing time" },
        });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.error.message).toMatch(/start.*durationSeconds/);
    });

    it("clockify_entries_log derives start from end - durationSeconds", async () => {
        const client = await connect(fakeContext());
        const res = await client.callTool({
            name: "clockify_entries_log",
            arguments: {
                description: "wrote tests",
                durationSeconds: 1800,
                end: "2026-05-26T10:00:00.000Z",
            },
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.start).toBe("2026-05-26T09:30:00.000Z");
        expect(parsed.data.end).toBe("2026-05-26T10:00:00.000Z");
    });

    it("clockify_timer_stop returns a friendly ok when no timer is in progress", async () => {
        const ctx = fakeContext(); // listInProgress defaults to []
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_timer_stop", arguments: {} });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.running).toBe(false);
        expect(parsed.data.note).toMatch(/no timer was running/i);
    });

    it("clockify_timer_stop stops the user's in-progress timer via the bound route", async () => {
        const ctx = fakeContext({ listInProgress: async () => [{ id: "te-1", userId: "user-1" }] });
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_timer_stop", arguments: {} });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.ok).toBe(true);
        expect(parsed.data.stopped).toBe(true);
    });

    it("clockify_review_week rejects an unparseable week_start with a clear, field-named error", async () => {
        const ctx = fakeContext();
        const client = await connect(ctx);
        const res = await client.callTool({
            name: "clockify_review_week",
            arguments: { week_start: "garbage" },
        });
        expect(res.isError).toBe(true);
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "{}");
        expect(parsed.ok).toBe(false);
        expect(parsed.error.code).toBe("invalid_request");
        expect(parsed.error.message).toMatch(/invalid week_start "garbage"/);
    });
});

describe("destructive domain delete confirmation gating", () => {
    // A delete-spy harness: the spy records each SDK delete call so we can
    // assert the delete only fires after a valid confirm_token. We reuse the
    // existing fakeContext surface and overwrite the delete fns we observe.
    function deleteSpy() {
        const calls: unknown[] = [];
        const fn = async (req: unknown) => {
            calls.push(req);
            return {};
        };
        return { fn, calls };
    }

    function projectsCtx(spy: { fn: (req: unknown) => Promise<unknown> }): Context {
        const ctx = fakeContext();
        (ctx.client.projects as unknown as { delete: (req: unknown) => Promise<unknown> }).delete =
            spy.fn;
        return ctx;
    }

    function entriesCtx(spy: { fn: (req: unknown) => Promise<unknown> }): Context {
        const ctx = fakeContext();
        (
            ctx.client.timeEntries as unknown as { delete: (req: unknown) => Promise<unknown> }
        ).delete = spy.fn;
        return ctx;
    }

    function dataOf(res: unknown): Record<string, unknown> {
        const parsed = JSON.parse(
            (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}",
        );
        return parsed as Record<string, unknown>;
    }

    it("clockify_projects_delete refuses without dry_run/confirm_token and never calls the SDK", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const res = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1" },
        });
        const json = dataOf(res);
        expect(json.ok).toBe(false);
        expect(JSON.stringify(json)).toMatch(/dry_run/i);
        expect(spy.calls).toHaveLength(0);
    });

    it("clockify_projects_delete dry_run returns a confirm_token + preview without deleting", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const res = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1", dry_run: true },
        });
        const json = dataOf(res);
        expect(json.ok).toBe(true);
        const data = json.data as {
            confirm_token?: string;
            preview?: { action?: string; id?: string };
        };
        expect(data.confirm_token).toBeTruthy();
        expect(data.preview?.action).toBe("delete");
        expect(data.preview?.id).toBe("p-1");
        expect(spy.calls).toHaveLength(0);
    });

    it("clockify_projects_delete executes with a valid confirm_token", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const preview = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1", dry_run: true },
        });
        const token = (dataOf(preview).data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        expect(spy.calls).toHaveLength(0);

        const res = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1", confirm_token: token },
        });
        const json = dataOf(res);
        expect(json.ok).toBe(true);
        expect((json.data as { deleted?: boolean }).deleted).toBe(true);
        expect(spy.calls).toHaveLength(1);
        expect(spy.calls[0]).toMatchObject({ projectId: "p-1" });
    });

    it("clockify_projects_delete rejects a tampered confirm_token and does not delete", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const res = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1", confirm_token: "not-a-real-token" },
        });
        expect(dataOf(res).ok).toBe(false);
        expect(spy.calls).toHaveLength(0);
    });

    it("clockify_projects_delete rejects a token issued for a different id (preview mismatch)", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const preview = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-1", dry_run: true },
        });
        const token = (dataOf(preview).data as { confirm_token?: string }).confirm_token;
        // Same token, different project id → payload hash differs → rejected.
        const res = await client.callTool({
            name: "clockify_projects_delete",
            arguments: { projectId: "p-2", confirm_token: token },
        });
        expect(dataOf(res).ok).toBe(false);
        expect(spy.calls).toHaveLength(0);
    });

    it("clockify_entries_delete refuses without confirmation and executes after dry_run+token", async () => {
        const spy = deleteSpy();
        const client = await connect(entriesCtx(spy));

        const refused = await client.callTool({
            name: "clockify_entries_delete",
            arguments: { timeEntryId: "e-1" },
        });
        expect(dataOf(refused).ok).toBe(false);
        expect(spy.calls).toHaveLength(0);

        const preview = await client.callTool({
            name: "clockify_entries_delete",
            arguments: { timeEntryId: "e-1", dry_run: true },
        });
        const previewJson = dataOf(preview);
        expect(previewJson.ok).toBe(true);
        const token = (previewJson.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        expect(spy.calls).toHaveLength(0);

        const executed = await client.callTool({
            name: "clockify_entries_delete",
            arguments: { timeEntryId: "e-1", confirm_token: token },
        });
        const executedJson = dataOf(executed);
        expect(executedJson.ok).toBe(true);
        expect((executedJson.data as { deleted?: boolean }).deleted).toBe(true);
        expect(spy.calls).toHaveLength(1);
        expect(spy.calls[0]).toMatchObject({ timeEntryId: "e-1" });
    });
});
