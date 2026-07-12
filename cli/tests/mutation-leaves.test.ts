import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import type { Services } from "../src/commands/types.js";
import { main } from "../src/index.js";

const WORKSPACE_ID = "workspace-1";
const SHARED_REPORT_FILTER = JSON.stringify({
    dateRangeStart: "2026-06-01T00:00:00Z",
    dateRangeEnd: "2026-06-30T23:59:59Z",
    exportType: "JSON",
    summaryFilter: { groups: ["PROJECT"], sortColumn: "DURATION" },
});

interface PlannedCall {
    path: string;
    result?: unknown;
    expected?: Record<string, unknown>;
    inspect?: (args: readonly unknown[]) => void;
}

interface MutationCase {
    name: string;
    argv: readonly string[];
    action?: string;
    output?: Record<string, unknown>;
    calls: readonly PlannedCall[];
    failureAt?: number;
}

interface RecordedCall {
    path: string;
    args: readonly unknown[];
}

const cases: readonly MutationCase[] = [
    {
        name: "api",
        argv: ["api", "DELETE", "/workspaces/{workspaceId}/tags/tag-1"],
        output: { deleted: true },
        calls: [
            {
                path: "fetch",
                result: () =>
                    new Response(JSON.stringify({ deleted: true }), {
                        status: 200,
                        headers: { "content-type": "application/json" },
                    }),
                inspect: ([target, init]) => {
                    expect(target).toBe(`/workspaces/${WORKSPACE_ID}/tags/tag-1`);
                    expect(init).toMatchObject({ method: "DELETE" });
                },
            },
        ],
    },
    {
        name: "start",
        argv: ["start", "Focus work"],
        action: "timer.start",
        calls: [
            { path: "users.getCurrentUser", result: { id: "user-1" } },
            {
                path: "timeEntries.create",
                result: { id: "entry-1", description: "Focus work" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: { description: "Focus work" },
                },
            },
        ],
        failureAt: 1,
    },
    {
        name: "stop",
        argv: ["stop"],
        action: "timer.stop",
        calls: [
            { path: "users.getCurrentUser", result: { id: "user-1" } },
            {
                path: "timeEntries.listInProgress",
                result: [{ id: "entry-1", userId: "user-1" }],
                expected: { workspaceId: WORKSPACE_ID },
            },
            {
                path: "timeEntries.updateForUser",
                result: { id: "entry-1", description: "Stopped" },
                expected: { workspaceId: WORKSPACE_ID, userId: "user-1" },
            },
        ],
        failureAt: 2,
    },
    {
        name: "log",
        argv: ["log", "1h", "Finished work", "--end", "2026-07-12T12:00:00Z"],
        action: "entries.log",
        calls: [
            {
                path: "timeEntries.create",
                result: { id: "entry-2", description: "Finished work" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: {
                        description: "Finished work",
                        start: "2026-07-12T11:00:00.000Z",
                        end: "2026-07-12T12:00:00.000Z",
                    },
                },
            },
        ],
    },
    {
        name: "entries delete",
        argv: ["entries", "delete", "entry-1"],
        action: "entries.delete",
        calls: [
            {
                path: "timeEntries.delete",
                expected: { workspaceId: WORKSPACE_ID, timeEntryId: "entry-1" },
            },
        ],
    },
    {
        name: "projects create",
        argv: ["projects", "create", "Project A", "--client", "client-1", "--billable"],
        action: "projects.create",
        calls: [
            {
                path: "projects.create",
                result: { id: "project-1", name: "Project A", clientId: "client-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: { name: "Project A", clientId: "client-1", billable: true },
                },
            },
        ],
    },
    {
        name: "projects update",
        argv: ["projects", "update", "project-1", "--name", "Project B", "--archived"],
        action: "projects.update",
        calls: [
            {
                path: "projects.update",
                result: { id: "project-1", name: "Project B" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    body: { name: "Project B", archived: true },
                },
            },
        ],
    },
    {
        name: "projects delete",
        argv: ["projects", "delete", "project-1"],
        action: "projects.delete",
        calls: [
            {
                path: "projects.get",
                result: { id: "project-1", name: "Project A", archived: false },
                expected: { workspaceId: WORKSPACE_ID, projectId: "project-1" },
            },
            {
                path: "projects.update",
                result: { id: "project-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    name: "Project A",
                    archived: true,
                },
            },
            {
                path: "projects.delete",
                expected: { workspaceId: WORKSPACE_ID, projectId: "project-1" },
            },
        ],
        failureAt: 1,
    },
    {
        name: "clients create",
        argv: ["clients", "create", "Client A", "--note", "note"],
        action: "clients.create",
        calls: [
            {
                path: "clients.create",
                result: { id: "client-1", name: "Client A" },
                expected: { workspaceId: WORKSPACE_ID, body: { name: "Client A", note: "note" } },
            },
        ],
    },
    {
        name: "clients update",
        argv: ["clients", "update", "client-1", "--note", "new note"],
        action: "clients.update",
        calls: [
            {
                path: "clients.get",
                result: {
                    id: "client-1",
                    name: "Client A",
                    archived: false,
                    address: "",
                    currencyCode: "USD",
                    email: "",
                    note: "old note",
                },
                expected: { workspaceId: WORKSPACE_ID, clientId: "client-1" },
            },
            {
                path: "clients.update",
                result: { id: "client-1", name: "Client A" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    clientId: "client-1",
                    body: {
                        name: "Client A",
                        archived: false,
                        address: "",
                        currencyCode: "USD",
                        email: "",
                        note: "new note",
                    },
                },
            },
        ],
        failureAt: 1,
    },
    {
        name: "clients delete",
        argv: ["clients", "delete", "client-1"],
        action: "clients.delete",
        calls: [
            {
                path: "clients.get",
                result: {
                    id: "client-1",
                    name: "Client A",
                    archived: false,
                    address: "",
                    currencyCode: "USD",
                    email: "",
                    note: "",
                },
                expected: { workspaceId: WORKSPACE_ID, clientId: "client-1" },
            },
            {
                path: "clients.update",
                result: { id: "client-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    clientId: "client-1",
                    body: { name: "Client A", archived: true, address: "", note: "" },
                },
            },
            {
                path: "clients.delete",
                expected: { workspaceId: WORKSPACE_ID, clientId: "client-1" },
            },
        ],
        failureAt: 1,
    },
    {
        name: "tasks create",
        argv: ["tasks", "create", "project-1", "Task A", "--billable"],
        action: "tasks.create",
        calls: [
            {
                path: "tasks.create",
                result: { id: "task-1", name: "Task A" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    body: { name: "Task A", billable: true },
                },
            },
        ],
    },
    {
        name: "tasks update",
        argv: ["tasks", "update", "project-1", "task-1", "--name", "Task B"],
        action: "tasks.update",
        calls: [
            {
                path: "tasks.get",
                result: { id: "task-1", name: "Task A", status: "ACTIVE", billable: false },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    taskId: "task-1",
                },
            },
            {
                path: "tasks.update",
                result: { id: "task-1", name: "Task B" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    taskId: "task-1",
                    body: { name: "Task B", status: "ACTIVE", billable: false },
                },
            },
        ],
        failureAt: 1,
    },
    {
        name: "tasks delete",
        argv: ["tasks", "delete", "project-1", "task-1"],
        action: "tasks.delete",
        calls: [
            {
                path: "tasks.get",
                result: { id: "task-1", name: "Task A", status: "ACTIVE", billable: false },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    taskId: "task-1",
                },
            },
            {
                path: "tasks.update",
                result: { id: "task-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    taskId: "task-1",
                    body: { name: "Task A", status: "DONE", billable: false },
                },
            },
            {
                path: "tasks.delete",
                expected: {
                    workspaceId: WORKSPACE_ID,
                    projectId: "project-1",
                    taskId: "task-1",
                },
            },
        ],
        failureAt: 1,
    },
    {
        name: "tags create",
        argv: ["tags", "create", "Tag A"],
        action: "tags.create",
        calls: [
            {
                path: "tags.create",
                result: { id: "tag-1", name: "Tag A" },
                expected: { workspaceId: WORKSPACE_ID, body: { name: "Tag A" } },
            },
        ],
    },
    {
        name: "tags update",
        argv: ["tags", "update", "tag-1", "--name", "Tag B", "--archived"],
        action: "tags.update",
        calls: [
            {
                path: "tags.update",
                result: { id: "tag-1", name: "Tag B" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    tagId: "tag-1",
                    body: { name: "Tag B", archived: true },
                },
            },
        ],
    },
    {
        name: "tags delete",
        argv: ["tags", "delete", "tag-1"],
        action: "tags.delete",
        calls: [
            {
                path: "tags.delete",
                expected: { workspaceId: WORKSPACE_ID, tagId: "tag-1" },
            },
        ],
    },
    {
        name: "webhooks create",
        argv: [
            "webhooks",
            "create",
            "--name",
            "Webhook A",
            "--url",
            "https://example.test/hook",
            "--event",
            "NEW_PROJECT",
        ],
        action: "webhooks.create",
        calls: [
            {
                path: "webhooks.create",
                result: {
                    id: "webhook-1",
                    name: "Webhook A",
                    url: "https://example.test/hook",
                    webhookEvent: "NEW_PROJECT",
                },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: {
                        name: "Webhook A",
                        url: "https://example.test/hook",
                        webhookEvent: "NEW_PROJECT",
                        triggerSourceType: "WORKSPACE_ID",
                        triggerSource: [WORKSPACE_ID],
                    },
                },
            },
        ],
    },
    {
        name: "webhooks delete",
        argv: ["webhooks", "delete", "webhook-1"],
        action: "webhooks.delete",
        calls: [
            {
                path: "webhooks.delete",
                expected: { workspaceId: WORKSPACE_ID, webhookId: "webhook-1" },
            },
        ],
    },
    {
        name: "invoices create",
        argv: [
            "invoices",
            "create",
            "--client",
            "client-1",
            "--number",
            "INV-1",
            "--currency",
            "USD",
            "--issued",
            "2026-07-01",
            "--due",
            "2026-07-31",
        ],
        action: "invoices.create",
        calls: [
            {
                path: "invoices.create",
                result: { id: "invoice-1", number: "INV-1", status: "DRAFT", currency: "USD" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: {
                        clientId: "client-1",
                        number: "INV-1",
                        currency: "USD",
                        issuedDate: "2026-07-01T00:00:00Z",
                        dueDate: "2026-07-31T00:00:00Z",
                    },
                },
            },
        ],
    },
    {
        name: "expenses create",
        argv: [
            "expenses",
            "create",
            "--amount",
            "12.5",
            "--category",
            "category-1",
            "--date",
            "2026-07-12",
            "--user",
            "user-1",
            "--no-billable",
        ],
        action: "expenses.create",
        calls: [
            {
                path: "expenses.create",
                result: { id: "expense-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    userId: "user-1",
                    amount: 12.5,
                    categoryId: "category-1",
                    date: "2026-07-12T00:00:00Z",
                    billable: false,
                },
            },
        ],
    },
    {
        name: "expenses update",
        argv: [
            "expenses",
            "update",
            "expense-1",
            "--amount",
            "20",
            "--category",
            "category-1",
            "--date",
            "2026-07-12",
            "--user",
            "user-1",
            "--notes",
            "updated",
        ],
        action: "expenses.update",
        calls: [
            {
                path: "expenses.update",
                result: { id: "expense-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    expenseId: "expense-1",
                    userId: "user-1",
                    amount: 20,
                    categoryId: "category-1",
                    notes: "updated",
                    changeFields: ["AMOUNT", "DATE", "CATEGORY", "NOTES"],
                },
            },
        ],
    },
    {
        name: "expenses delete",
        argv: ["expenses", "delete", "expense-1"],
        action: "expenses.delete",
        calls: [
            {
                path: "expenses.delete",
                expected: { workspaceId: WORKSPACE_ID, expenseId: "expense-1" },
            },
        ],
    },
    {
        name: "timeoff submit",
        argv: [
            "timeoff",
            "submit",
            "--policy",
            "policy-1",
            "--start",
            "2026-07-12",
            "--days",
            "1",
        ],
        action: "timeoff.submit",
        calls: [
            {
                path: "timeOff.submit",
                result: { id: "request-1", userId: "user-1", status: { statusType: "PENDING" } },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    policyId: "policy-1",
                    body: {
                        note: "",
                        timeOffPeriod: {
                            isHalfDay: false,
                            halfDayPeriod: "NOT_DEFINED",
                            period: { start: "2026-07-12", days: 1 },
                        },
                    },
                },
            },
        ],
    },
    {
        name: "scheduling create",
        argv: [
            "scheduling",
            "create",
            "--user",
            "user-1",
            "--project",
            "project-1",
            "--start",
            "2026-07-12",
            "--end",
            "2026-07-13",
            "--hours-per-day",
            "8",
            "--publish",
        ],
        action: "scheduling.create",
        calls: [
            {
                path: "scheduling.createRecurring",
                result: [{ id: "assignment-1", userId: "user-1", projectId: "project-1" }],
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: {
                        userId: "user-1",
                        projectId: "project-1",
                        start: "2026-07-12",
                        end: "2026-07-13",
                        hoursPerDay: 8,
                    },
                },
            },
            {
                path: "scheduling.publish",
                expected: {
                    workspaceId: WORKSPACE_ID,
                    start: "2026-07-12",
                    end: "2026-07-13",
                    userFilter: { contains: "CONTAINS", ids: ["user-1"] },
                },
            },
        ],
        failureAt: 0,
    },
    {
        name: "shared-reports create",
        argv: [
            "shared-reports",
            "create",
            "--name",
            "Report A",
            "--type",
            "summary",
            "--filter",
            SHARED_REPORT_FILTER,
            "--public",
        ],
        action: "shared-reports.create",
        calls: [
            {
                path: "sharedReports.create",
                result: { id: "report-1", name: "Report A" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    body: { name: "Report A", type: "SUMMARY", isPublic: true },
                },
            },
        ],
    },
    {
        name: "shared-reports update",
        argv: [
            "shared-reports",
            "update",
            "report-1",
            "--name",
            "Report B",
            "--type",
            "summary",
            "--filter",
            SHARED_REPORT_FILTER,
        ],
        action: "shared-reports.update",
        calls: [
            {
                path: "sharedReports.update",
                result: { id: "report-1", name: "Report B" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    sharedReportId: "report-1",
                    body: { name: "Report B", type: "SUMMARY" },
                },
            },
        ],
    },
    {
        name: "shared-reports delete",
        argv: ["shared-reports", "delete", "report-1"],
        action: "shared-reports.delete",
        calls: [
            {
                path: "sharedReports.delete",
                expected: { workspaceId: WORKSPACE_ID, sharedReportId: "report-1" },
            },
        ],
    },
    {
        name: "users invite",
        argv: ["users", "invite", "new@example.test", "--no-send-email"],
        action: "users.invite",
        calls: [
            {
                path: "workspaces.addUser",
                result: { id: WORKSPACE_ID },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    email: "new@example.test",
                    "send-email": "false",
                },
            },
        ],
    },
    {
        name: "users update-profile",
        argv: [
            "users",
            "update-profile",
            "user-1",
            "--name",
            "New Name",
            "--week-start",
            "MONDAY",
        ],
        action: "users.update-profile",
        calls: [
            {
                path: "memberProfiles.update",
                result: { id: "user-1" },
                expected: {
                    workspaceId: WORKSPACE_ID,
                    userId: "user-1",
                    body: { name: "New Name", weekStart: "MONDAY" },
                },
            },
        ],
    },
];

afterEach(() => {
    vi.restoreAllMocks();
});

describe("all 30 mutating CLI leaves", () => {
    it("keeps the mutation inventory pinned to thirty", () => {
        expect(cases).toHaveLength(30);
        expect(new Set(cases.map(({ name }) => name)).size).toBe(30);
    });

    describe.each(cases)("$name", (testCase) => {
        it("executes the expected SDK calls in order and emits a success result", async () => {
            const recorder = strictRecorder(testCase.calls);
            const output = captureOutput();

            const code = await main(cliArgv(testCase.argv), servicesFor(recorder.client));

            expect(code).toBe(0);
            expect(recorder.calls.map(({ path }) => path)).toEqual(
                testCase.calls.map(({ path }) => path),
            );
            assertPlannedArguments(testCase.calls, recorder.calls);
            const payload = lastJson(output.logged);
            if (testCase.action) {
                expect(payload).toMatchObject({ ok: true, action: testCase.action });
                expect(payload).toHaveProperty("entity");
                expect(payload).toHaveProperty("ids");
                expect(payload).toHaveProperty("changed");
                expect(payload).toHaveProperty("warnings");
                expect(payload).toHaveProperty("next");
            } else {
                expect(payload).toMatchObject(testCase.output ?? {});
            }
            expect(output.errored).toEqual([]);
        });

        it("returns one structured failure with no success receipt or later SDK calls", async () => {
            const failureAt = testCase.failureAt ?? testCase.calls.length - 1;
            const recorder = strictRecorder(testCase.calls, failureAt);
            const output = captureOutput();

            const code = await main(cliArgv(testCase.argv), servicesFor(recorder.client));

            expect(code).toBe(1);
            expect(recorder.calls.map(({ path }) => path)).toEqual(
                testCase.calls.slice(0, failureAt + 1).map(({ path }) => path),
            );
            assertPlannedArguments(
                testCase.calls.slice(0, failureAt + 1),
                recorder.calls,
            );
            expect(output.logged).toEqual([]);
            expect(lastJson(output.errored)).toMatchObject({
                ok: false,
                error: `sentinel:${testCase.name}`,
            });
            expect(lastJson(output.errored)).toHaveProperty("code");
            expect(lastJson(output.errored)).toHaveProperty("recovery");
            expect(lastJson(output.errored)).toHaveProperty("retryable");
            expect(output.errored.join("\n")).toContain(`sentinel:${testCase.name}`);
        });
    });
});

function cliArgv(argv: readonly string[]): string[] {
    return ["node", "clockify115", "--json", ...argv];
}

function servicesFor(client: ClockifyClient): Services {
    return {
        loadConfig: () => ({ apiKey: "test-key", workspaceId: WORKSPACE_ID }),
        buildClient: () => client,
    };
}

function captureOutput(): { logged: string[]; errored: string[] } {
    const logged: string[] = [];
    const errored: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
        logged.push(String(value ?? ""));
    });
    vi.spyOn(console, "error").mockImplementation((value?: unknown) => {
        errored.push(String(value ?? ""));
    });
    return { logged, errored };
}

function lastJson(lines: readonly string[]): Record<string, unknown> {
    expect(lines.length).toBeGreaterThan(0);
    return JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
}

function assertPlannedArguments(
    planned: readonly PlannedCall[],
    recorded: readonly RecordedCall[],
): void {
    planned.forEach((call, index) => {
        const actual = recorded[index];
        expect(actual?.path).toBe(call.path);
        if (call.expected !== undefined) {
            expect(actual?.args[0]).toMatchObject(call.expected);
        }
        call.inspect?.(actual?.args ?? []);
    });
}

function strictRecorder(
    planned: readonly PlannedCall[],
    failureAt?: number,
): { client: ClockifyClient; calls: RecordedCall[] } {
    const calls: RecordedCall[] = [];
    const proxies = new Map<string, unknown>();

    const proxyFor = (prefix: string): unknown => {
        const cached = proxies.get(prefix);
        if (cached !== undefined) return cached;
        const proxy = new Proxy(() => undefined, {
            get: (_target, property) => {
                if (property === "then") return undefined;
                if (typeof property !== "string") {
                    throw new Error(`unexpected SDK property ${String(property)}`);
                }
                const path = prefix ? `${prefix}.${property}` : property;
                const isCall = planned.some((call) => call.path === path);
                const isParent = planned.some((call) => call.path.startsWith(`${path}.`));
                if (isCall) {
                    return async (...args: unknown[]) => {
                        const index = calls.length;
                        const expected = planned[index];
                        if (expected?.path !== path) {
                            throw new Error(
                                `unexpected SDK call ${path}; expected ${expected?.path ?? "none"}`,
                            );
                        }
                        calls.push({ path, args });
                        if (failureAt === index) {
                            throw new Error(`sentinel:${caseNameFromStack(planned)}`);
                        }
                        return typeof expected.result === "function"
                            ? (expected.result as () => unknown)()
                            : expected.result;
                    };
                }
                if (isParent) return proxyFor(path);
                throw new Error(`unexpected SDK property ${path}`);
            },
        });
        proxies.set(prefix, proxy);
        return proxy;
    };

    return { client: proxyFor("") as ClockifyClient, calls };
}

function activeCaseName(planned: readonly PlannedCall[]): string {
    return cases.find((testCase) => testCase.calls === planned)?.name ?? "unknown";
}

function caseNameFromStack(planned: readonly PlannedCall[]): string {
    return activeCaseName(planned);
}
