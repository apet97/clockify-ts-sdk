import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { Context } from "../src/client.js";
import { buildServer } from "../src/server.js";

const fakeUser = { id: "0000000000000000000000aa", email: "alice@example.com", name: "Alice" };
const targetUser = { id: "0000000000000000000000bb", email: "bob@example.com", name: "Bob" };

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
        users: {
            getCurrentUser: async () => fakeUser,
            findWorkspaceUsers: async () => [fakeUser, targetUser],
            list: async () => [fakeUser, targetUser],
            giveRole: async () => ({}),
            removeRole: async () => ({}),
        },
        workspaces: resource({
            addUser: async () => ({}),
            updateUserStatus: async () => ({}),
            updateUserHourlyRate: async () => ({}),
            updateUserCostRate: async () => ({}),
        }),
        approvals: resource({
            submit: async () => ({}),
            updateStatus: async () => ({}),
            resubmit: async () => ({}),
        }),
        timeEntries: resource({
            listInProgress: async () => [],
            listForUser: async () => [],
            delete: async () => ({}),
            markInvoiced: async () => ({}),
        }),
        projects: resource({
            delete: async () => ({}),
            updateUserHourlyRate: async () => ({}),
            updateUserCostRate: async () => ({}),
        }),
        clients: resource({ delete: async () => ({}) }),
        tasks: resource({
            delete: async () => ({}),
            updateBillableRate: async () => ({}),
            updateCostRate: async () => ({}),
        }),
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
        scheduling: resource({ delete: async () => ({}), deleteRecurring: async () => ({}) }),
        timeOff: resource({
            delete: async () => ({}),
            submit: async (req: Record<string, unknown>) => ({ id: "x1", ...req }),
        }),
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
    {
        tool: "clockify_entries_delete",
        group: "timeEntries",
        method: "delete",
        args: { timeEntryId: id(1) },
        echo: { timeEntryId: id(1) },
    },
    {
        tool: "clockify_projects_delete",
        group: "projects",
        method: "delete",
        args: { projectId: id(2) },
        echo: { projectId: id(2) },
    },
    {
        tool: "clockify_clients_delete",
        group: "clients",
        method: "delete",
        args: { clientId: id(3) },
        echo: { clientId: id(3) },
    },
    {
        tool: "clockify_tags_delete",
        group: "tags",
        method: "delete",
        args: { tagId: id(4) },
        echo: { tagId: id(4) },
    },
    {
        tool: "clockify_tasks_delete",
        group: "tasks",
        method: "delete",
        args: { projectId: id(5), taskId: id(6) },
        echo: { taskId: id(6) },
    },
    {
        tool: "clockify_webhooks_delete",
        group: "webhooks",
        method: "delete",
        args: { webhookId: id(7) },
        echo: { webhookId: id(7) },
    },
    {
        tool: "clockify_custom_fields_delete",
        group: "customFields",
        method: "deleteForWorkspace",
        args: { customFieldId: id(8) },
        echo: { customFieldId: id(8) },
    },
    {
        tool: "clockify_project_custom_fields_remove",
        group: "customFields",
        method: "removeFromProject",
        args: { projectId: id(9), customFieldId: id(10) },
        echo: { customFieldId: id(10) },
    },
    {
        tool: "clockify_holidays_delete",
        group: "holidays",
        method: "delete",
        args: { holidayId: id(11) },
        echo: { holidayId: id(11) },
    },
    {
        tool: "clockify_groups_delete",
        group: "userGroups",
        method: "delete",
        args: { groupId: id(12) },
        echo: { groupId: id(12) },
    },
    {
        tool: "clockify_groups_remove_member",
        group: "userGroups",
        method: "removeMember",
        args: { groupId: id(13), userId: targetUser.id },
        echo: { userId: targetUser.id },
    },
    {
        tool: "clockify_expenses_categories_delete",
        group: "expenseCategories",
        method: "delete",
        args: { categoryId: id(15) },
        echo: { categoryId: id(15) },
    },
    {
        tool: "clockify_expenses_delete",
        group: "expenses",
        method: "delete",
        args: { expenseId: id(16) },
        echo: { expenseId: id(16) },
    },
    {
        tool: "clockify_invoices_delete",
        group: "invoices",
        method: "delete",
        args: { invoiceId: id(17) },
        echo: { invoiceId: id(17) },
    },
    {
        tool: "clockify_scheduling_assignments_delete",
        group: "scheduling",
        method: "deleteRecurring",
        args: { assignmentId: id(18) },
        echo: { assignmentId: id(18) },
    },
    {
        tool: "clockify_time_off_requests_delete",
        group: "timeOff",
        method: "withdraw",
        args: { policyId: id(27), requestId: id(19) },
        echo: { requestId: id(19) },
    },
    {
        tool: "clockify_shared_reports_delete",
        group: "sharedReports",
        method: "delete",
        args: { shared_report_id: id(20) },
        echo: { sharedReportId: id(20) },
    },
];

const workflows: GuardCase[] = [
    {
        tool: "clockify_invoice_client_work",
        group: "invoices",
        method: "create",
        args: { client_id: id(21), currency: "USD" },
        echo: { clientId: id(21) },
    },
    {
        tool: "clockify_record_expense",
        group: "expenses",
        method: "create",
        args: {
            category_id: id(22),
            amount: 10,
            date: "2026-07-01T00:00:00.000Z",
            user_id: id(23),
        },
        echo: { categoryId: id(22) },
    },
    {
        tool: "clockify_request_time_off",
        group: "timeOff",
        method: "submit",
        args: {
            policy_id: id(24),
            start: "2026-07-01T00:00:00.000Z",
            end: "2026-07-02T00:00:00.000Z",
        },
        echo: { policyId: id(24) },
    },
    {
        tool: "clockify_schedule_work",
        group: "scheduling",
        method: "createRecurring",
        args: {
            user_id: id(25),
            project_id: id(26),
            start: "2026-07-01T00:00:00.000Z",
            end: "2026-07-02T00:00:00.000Z",
            hours_per_day: 8,
        },
        echo: { projectId: id(26) },
    },
    {
        tool: "clockify_setup_webhook",
        group: "webhooks",
        method: "create",
        args: { name: "Audit", url: "https://example.com/hook", event: "NEW_TIME_ENTRY" },
        echo: {},
    },
];

const businessAndPrivileged: GuardCase[] = [
    {
        tool: "clockify_approvals_submit",
        group: "approvals",
        method: "submit",
        args: { period: "WEEKLY", periodStart: "2026-07-01T00:00:00.000Z" },
        echo: { workspaceId: id(900), body: { period: "WEEKLY" } },
    },
    {
        tool: "clockify_approvals_update_state",
        group: "approvals",
        method: "updateStatus",
        args: { approvalRequestId: id(31), state: "APPROVED", note: "reviewed" },
        echo: { workspaceId: id(900), approvalRequestId: id(31), body: { state: "APPROVED" } },
    },
    {
        tool: "clockify_approvals_resubmit",
        group: "approvals",
        method: "resubmit",
        args: { period: "MONTHLY", periodStart: "2026-07-01T00:00:00.000Z" },
        echo: { workspaceId: id(900), period: "MONTHLY" },
    },
    {
        tool: "clockify_entries_mark_invoiced",
        group: "timeEntries",
        method: "markInvoiced",
        args: { timeEntryIds: [id(32)], invoiced: false },
        echo: { workspaceId: id(900), timeEntryIds: [id(32)], invoiced: false },
    },
    {
        tool: "clockify_projects_set_member_rate",
        group: "projects",
        method: "updateUserHourlyRate",
        args: { projectId: id(33), userId: id(34), rateKind: "HOURLY", amount: 75 },
        echo: { workspaceId: id(900), projectId: id(33), userId: id(34), amount: 7500 },
    },
    {
        tool: "clockify_tasks_set_rate",
        group: "tasks",
        method: "updateBillableRate",
        args: { projectId: id(35), taskId: id(36), rateKind: "HOURLY", amount: 50 },
        echo: { workspaceId: id(900), projectId: id(35), taskId: id(36), amount: 5000 },
    },
    {
        tool: "clockify_users_grant_role",
        group: "users",
        method: "giveRole",
        args: { userId: targetUser.id, role: "WORKSPACE_ADMIN", entityId: id(900) },
        echo: { workspaceId: id(900), userId: targetUser.id, role: "WORKSPACE_ADMIN" },
    },
    {
        tool: "clockify_users_revoke_role",
        group: "users",
        method: "removeRole",
        args: { userId: targetUser.id, role: "TEAM_MANAGER", entityId: id(900) },
        echo: { workspaceId: id(900), userId: targetUser.id, role: "TEAM_MANAGER" },
    },
    {
        tool: "clockify_users_set_status",
        group: "workspaces",
        method: "updateUserStatus",
        args: { userId: targetUser.id, status: "ACTIVE" },
        echo: { workspaceId: id(900), userId: targetUser.id, status: "ACTIVE" },
    },
    {
        tool: "clockify_users_set_member_rate",
        group: "workspaces",
        method: "updateUserHourlyRate",
        args: { userId: targetUser.id, rateKind: "HOURLY", amount: 90 },
        echo: { workspaceId: id(900), userId: targetUser.id, amount: 9000 },
    },
    {
        tool: "clockify_users_invite",
        group: "workspaces",
        method: "addUser",
        args: { email: "invitee@example.com", sendEmail: false },
        echo: { workspaceId: id(900), email: "invitee@example.com", "send-email": "false" },
    },
];

function makeCtx(
    c: GuardCase,
    mutation: { fn: (req: Record<string, unknown>) => Promise<unknown> },
): Context {
    return ctxWith((client) => {
        const group = client[c.group];
        if (!group) throw new Error(`missing fake client group ${c.group}`);
        group[c.method] = mutation.fn;
    });
}

describe.each([...guarded, ...workflows, ...businessAndPrivileged])("confirm guard: $tool", (c) => {
    it("refuses bare args, previews on dry_run, executes once on a valid token, rejects a bogus token", async () => {
        const mutation = spy();
        const client = await connect(makeCtx(c, mutation));

        const bare = await client.callTool({ name: c.tool, arguments: { ...c.args } });
        const bareJson = dataOf(bare);
        expect(bareJson.ok).toBe(false);
        expect(JSON.stringify(bareJson)).toMatch(/dry_run/i);
        expect(mutation.calls).toHaveLength(0);

        const preview = await client.callTool({
            name: c.tool,
            arguments: { ...c.args, dry_run: true },
        });
        const previewJson = dataOf(preview);
        expect(previewJson.ok).toBe(true);
        const token = (previewJson.data as { confirm_token?: string }).confirm_token;
        expect(token).toBeTruthy();
        expect(mutation.calls).toHaveLength(0);

        // The preview must ground its workspace and hand back an executable
        // `next` step: same tool, the issued confirm_token, and a reason.
        const workspaceId = id(900);
        const meta = previewJson.meta as { workspaceId?: string } | undefined;
        const ids = previewJson.ids as { workspaceId?: string } | undefined;
        expect(meta?.workspaceId ?? ids?.workspaceId).toBe(workspaceId);
        const next = previewJson.next as Array<{
            tool?: string;
            args?: { confirm_token?: string };
            reason?: string;
        }>;
        expect(Array.isArray(next)).toBe(true);
        expect(next[0]?.tool).toBe(c.tool);
        expect(next[0]?.args?.confirm_token).toBe(token);
        expect(next[0]?.reason).toBeTruthy();

        const executed = await client.callTool({
            name: c.tool,
            arguments: { ...c.args, confirm_token: token },
        });
        expect(dataOf(executed).ok).toBe(true);
        expect(mutation.calls).toHaveLength(1);
        expect(mutation.calls[0]).toMatchObject(c.echo);

        const bogus = await client.callTool({
            name: c.tool,
            arguments: { ...c.args, confirm_token: "not-a-real-token" },
        });
        expect(dataOf(bogus).ok).toBe(false);
        expect(mutation.calls).toHaveLength(1);
    });
});
