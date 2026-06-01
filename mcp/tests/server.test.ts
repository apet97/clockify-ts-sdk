// Server tests exercise the canonical envelope: every tool returns content[0].text
// plus structuredContent matching the advertised output schema.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import type { Context } from "../src/client.js";

const fakeUser = { id: "user-1", email: "alice@example.com", name: "Alice" };

function fakeContext(overrides?: {
    clientsUpdate?: (req: unknown) => Promise<unknown>;
    listInProgress?: () => Promise<unknown>;
    projectsList?: (req: unknown) => Promise<unknown[]>;
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
                stopTimer: async () => ({ id: "te-1", stopped: true }),
                delete: async () => ({}),
            },
            projects: {
                list: overrides?.projectsList ?? (async () => [{ id: "p1", name: "Proj" }]),
                create: async (body: Record<string, unknown>) => ({ id: "p2", ...body }),
                update: overrides?.projectsUpdate ?? (async (req: unknown) => req),
            },
            clients: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "c1", ...body }),
                update: overrides?.clientsUpdate ?? (async (req: unknown) => req),
            },
            tasks: { list: async () => [] },
            tags: {
                list: async () => [],
                create: async (body: Record<string, unknown>) => ({ id: "t1", ...body }),
            },
        } as never,
    };
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

describe("@clockify115/mcp-server", () => {
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
                // Tasks
                "clockify_tasks_list",
                "clockify_tasks_get",
                "clockify_tasks_create",
                "clockify_tasks_update",
                "clockify_tasks_delete",
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
                // Expenses + categories
                "clockify_expenses_list",
                "clockify_expenses_get",
                "clockify_expenses_delete",
                "clockify_expenses_categories_list",
                "clockify_expenses_categories_create",
                "clockify_expenses_categories_update",
                "clockify_expenses_categories_delete",
                "clockify_expenses_categories_archive",
                // Webhooks
                "clockify_webhooks_list",
                "clockify_webhooks_get",
                "clockify_webhooks_create",
                "clockify_webhooks_update",
                "clockify_webhooks_delete",
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
                // Scheduling
                "clockify_scheduling_assignments_list",
                "clockify_scheduling_assignments_list_per_project",
                "clockify_scheduling_assignments_create",
                "clockify_scheduling_assignments_update",
                "clockify_scheduling_assignments_delete",
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
                // Audit log
                "clockify_audit_log_search",
            ].sort(),
        );
        expect(names).toHaveLength(108);
    });

    it("advertises agent-ready metadata for every tool", async () => {
        const client = await connect(fakeContext());
        const tools = (await client.listTools()).tools;

        const weakDescriptions = tools
            .filter((tool) => !tool.title?.trim() || !tool.description?.trim() || tool.description.length < 40)
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
            "clockify://guide/workflows",
            "clockify://mcp/doctor",
        ]);
        expect(prompts.prompts.map((prompt) => prompt.name)).toContain("clockify-workflow-plan");

        const cookbook = await client.readResource({ uri: "clockify://guide/workflows" });
        expect(cookbook.contents[0]?.text).toContain("clockify_status");

        const doctor = await client.readResource({ uri: "clockify://mcp/doctor" });
        expect(doctor.contents[0]?.text).toContain("no-network diagnostics checklist");
        expect(doctor.contents[0]?.text).toContain("CLOCKIFY_API_KEY");
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
            name: "Renamed",
            archived: true,
        });
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
            arguments: { description: "wrote tests", durationSeconds: 1800, end: "2026-05-26T10:00:00.000Z" },
        });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.start).toBe("2026-05-26T09:30:00.000Z");
        expect(parsed.data.end).toBe("2026-05-26T10:00:00.000Z");
    });

    it("clockify_timer_stop turns a 404 into a friendly ok envelope", async () => {
        const ctx = fakeContext();
        (ctx.client.timeEntries as unknown as { stopTimer: () => Promise<unknown> }).stopTimer = async () => {
            throw Object.assign(new Error("no running timer"), { statusCode: 404 });
        };
        const client = await connect(ctx);
        const res = await client.callTool({ name: "clockify_timer_stop", arguments: {} });
        expect(res.isError).toBeFalsy();
        const parsed = JSON.parse((res.content as Array<{ text: string }>)[0]?.text ?? "");
        expect(parsed.data.running).toBe(false);
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
        (ctx.client.projects as unknown as { delete: (req: unknown) => Promise<unknown> }).delete = spy.fn;
        return ctx;
    }

    function entriesCtx(spy: { fn: (req: unknown) => Promise<unknown> }): Context {
        const ctx = fakeContext();
        (ctx.client.timeEntries as unknown as { delete: (req: unknown) => Promise<unknown> }).delete = spy.fn;
        return ctx;
    }

    function dataOf(res: unknown): Record<string, unknown> {
        const parsed = JSON.parse((res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}");
        return parsed as Record<string, unknown>;
    }

    it("clockify_projects_delete refuses without dry_run/confirm_token and never calls the SDK", async () => {
        const spy = deleteSpy();
        const client = await connect(projectsCtx(spy));
        const res = await client.callTool({ name: "clockify_projects_delete", arguments: { projectId: "p-1" } });
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
        const data = json.data as { confirm_token?: string; preview?: { action?: string; id?: string } };
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
