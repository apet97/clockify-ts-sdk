import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const fakeUser = { id: "0000000000000000000000aa", email: "alice@example.com", name: "Alice" };

function id(n: number): string {
    return n.toString(16).padStart(24, "0");
}

function spy() {
    const calls: Array<Record<string, unknown>> = [];
    const fn = async (req: Record<string, unknown>) => {
        calls.push(req);
        return { id: "0000000000000000000000ff", ...req };
    };
    return { fn, calls };
}

function resource(extra: Record<string, unknown> = {}) {
    return {
        get: async () => ({ id: "x1", name: "Existing" }),
        list: async () => [],
        create: async (req: Record<string, unknown>) => ({ id: "x1", ...req }),
        update: async (req: Record<string, unknown>) => ({ id: "x1", ...req }),
        ...extra,
    };
}

function ctxWith(wire: (client: Record<string, Record<string, unknown>>) => void): Context {
    const client: Record<string, Record<string, unknown>> = {
        users: { getCurrentUser: async () => fakeUser, findWorkspaceUsers: async () => [fakeUser] },
        timeEntries: resource({ listInProgress: async () => [], listForUser: async () => [], delete: async () => ({}) }),
        projects: resource({ delete: async () => ({}) }),
        clients: resource({ delete: async () => ({}) }),
        tasks: resource({ delete: async () => ({}) }),
        tags: resource({ delete: async () => ({}) }),
        webhooks: resource({ delete: async () => ({}), list: async () => ({ webhooks: [] }) }),
        customFields: resource({
            deleteForWorkspace: async () => ({}),
            listForProject: async () => [],
            removeFromProject: async () => ({}),
            updateForProject: async (req: Record<string, unknown>) => ({ id: "x1", ...req }),
            updateForWorkspace: async (req: Record<string, unknown>) => ({ id: "x1", ...req }),
        }),
        holidays: resource({ delete: async () => ({}) }),
        userGroups: resource({ delete: async () => ({}), removeMember: async () => ({}) }),
        expenseCategories: resource({ archive: async () => ({}), delete: async () => ({}) }),
        expenses: resource({ delete: async () => ({}) }),
        invoices: resource({ delete: async () => ({}), list: async () => ({ invoices: [] }) }),
        scheduling: resource({ delete: async () => ({}) }),
        timeOff: resource({ delete: async () => ({}), submit: async (req: Record<string, unknown>) => ({ id: "x1", ...req }) }),
        timeOffPolicies: resource({}),
        sharedReports: resource({ delete: async () => ({}) }),
    };
    wire(client);
    return { workspaceId: id(900), client: client as never };
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
    const client = new Client({ name: "confirm-guard-matrix", version: "0.0.0" });
    await client.connect(clientTransport);
    teardown = async () => {
        await client.close();
        await server.close();
    };
    return client;
}

function dataOf(res: unknown): Record<string, unknown> {
    const text = (res as { content: Array<{ text: string }> }).content[0]?.text ?? "{}";
    return JSON.parse(text) as Record<string, unknown>;
}

interface GuardCase {
    tool: string;
    group: string;
    method: string;
    args: Record<string, unknown>;
    echo: Record<string, unknown>;
}

const guarded: GuardCase[] = [
    { tool: "clockify_entries_delete", group: "timeEntries", method: "delete", args: { timeEntryId: id(1) }, echo: { timeEntryId: id(1) } },
    { tool: "clockify_projects_delete", group: "projects", method: "delete", args: { projectId: id(2) }, echo: { projectId: id(2) } },
    { tool: "clockify_clients_delete", group: "clients", method: "delete", args: { clientId: id(3) }, echo: { clientId: id(3) } },
    { tool: "clockify_tags_delete", group: "tags", method: "delete", args: { tagId: id(4) }, echo: { tagId: id(4) } },
    { tool: "clockify_tasks_delete", group: "tasks", method: "delete", args: { projectId: id(5), taskId: id(6) }, echo: { taskId: id(6) } },
    { tool: "clockify_webhooks_delete", group: "webhooks", method: "delete", args: { webhookId: id(7) }, echo: { webhookId: id(7) } },
    { tool: "clockify_custom_fields_delete", group: "customFields", method: "deleteForWorkspace", args: { customFieldId: id(8) }, echo: { customFieldId: id(8) } },
    { tool: "clockify_project_custom_fields_remove", group: "customFields", method: "removeFromProject", args: { projectId: id(9), customFieldId: id(10) }, echo: { customFieldId: id(10) } },
    { tool: "clockify_holidays_delete", group: "holidays", method: "delete", args: { holidayId: id(11) }, echo: { holidayId: id(11) } },
    { tool: "clockify_groups_delete", group: "userGroups", method: "delete", args: { groupId: id(12) }, echo: { groupId: id(12) } },
    { tool: "clockify_groups_remove_member", group: "userGroups", method: "removeMember", args: { groupId: id(13), userId: id(14) }, echo: { userId: id(14) } },
    { tool: "clockify_expenses_categories_delete", group: "expenseCategories", method: "delete", args: { categoryId: id(15) }, echo: { categoryId: id(15) } },
    { tool: "clockify_expenses_delete", group: "expenses", method: "delete", args: { expenseId: id(16) }, echo: { expenseId: id(16) } },
    { tool: "clockify_invoices_delete", group: "invoices", method: "delete", args: { invoiceId: id(17) }, echo: { invoiceId: id(17) } },
    { tool: "clockify_scheduling_assignments_delete", group: "scheduling", method: "delete", args: { assignmentId: id(18) }, echo: { assignmentId: id(18) } },
    { tool: "clockify_time_off_requests_delete", group: "timeOff", method: "delete", args: { requestId: id(19) }, echo: { requestId: id(19) } },
    { tool: "clockify_shared_reports_delete", group: "sharedReports", method: "delete", args: { shared_report_id: id(20) }, echo: { sharedReportId: id(20) } },
];

const workflows: GuardCase[] = [
    { tool: "clockify_invoice_client_work", group: "invoices", method: "create", args: { client_id: id(21), currency: "USD" }, echo: { clientId: id(21) } },
    { tool: "clockify_record_expense", group: "expenses", method: "create", args: { category_id: id(22), amount: 10, date: "2026-07-01T00:00:00.000Z", user_id: id(23) }, echo: { categoryId: id(22) } },
    { tool: "clockify_request_time_off", group: "timeOff", method: "submit", args: { policy_id: id(24), start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z" }, echo: { policyId: id(24) } },
    { tool: "clockify_schedule_work", group: "scheduling", method: "create", args: { user_id: id(25), project_id: id(26), start: "2026-07-01T00:00:00.000Z", end: "2026-07-02T00:00:00.000Z", hours_per_day: 8 }, echo: { projectId: id(26) } },
    { tool: "clockify_setup_webhook", group: "webhooks", method: "create", args: { name: "Audit", url: "https://example.com/hook", event: "NEW_TIME_ENTRY" }, echo: {} },
];

function makeCtx(c: GuardCase, mutation: { fn: (req: Record<string, unknown>) => Promise<unknown> }): Context {
    return ctxWith((client) => {
        const group = client[c.group];
        if (!group) throw new Error(`missing fake client group ${c.group}`);
        group[c.method] = mutation.fn;
    });
}

describe.each([...guarded, ...workflows])("confirm guard: $tool", (c) => {
    it("refuses bare args, previews on dry_run, executes once on a valid token, rejects a bogus token", async () => {
        const mutation = spy();
        const client = await connect(makeCtx(c, mutation));

        const bare = await client.callTool({ name: c.tool, arguments: { ...c.args } });
        const bareJson = dataOf(bare);
        expect(bareJson.ok).toBe(false);
        expect(JSON.stringify(bareJson)).toMatch(/dry_run/i);
        expect(mutation.calls).toHaveLength(0);

        const preview = await client.callTool({ name: c.tool, arguments: { ...c.args, dry_run: true } });
        const previewJson = dataOf(preview);
        expect(previewJson.ok).toBe(true);
        const token = (previewJson.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        expect(mutation.calls).toHaveLength(0);

        const executed = await client.callTool({ name: c.tool, arguments: { ...c.args, confirm_token: token } });
        expect(dataOf(executed).ok).toBe(true);
        expect(mutation.calls).toHaveLength(1);
        expect(mutation.calls[0]).toMatchObject(c.echo);

        const bogus = await client.callTool({ name: c.tool, arguments: { ...c.args, confirm_token: "not-a-real-token" } });
        expect(dataOf(bogus).ok).toBe(false);
        expect(mutation.calls).toHaveLength(1);
    });
});
