import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";
import { registerSharedReportsCommand } from "../src/commands/sharedReports.js";
import { registerTasksCommand } from "../src/commands/tasks.js";
import type { Registrar } from "../src/commands/types.js";
import { registerWebhooksCommand } from "../src/commands/webhooks.js";

import { makeProgram } from "./read-commands.helpers.js";

function run(register: Registrar, client: unknown, ...args: string[]) {
    return makeProgram(register, client as ClockifyClient).parseAsync([
        "node",
        "clk115",
        "--json",
        ...args,
    ]);
}

describe("typed task replacement requests", () => {
    it("fetches current state and preserves false, zero, empty strings, and empty lists", async () => {
        const gets: Record<string, unknown>[] = [];
        const updates: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                get: async (request: Record<string, unknown>) => {
                    gets.push(request);
                    return {
                        id: "t-1",
                        projectId: "p-1",
                        name: "Existing",
                        status: "ACTIVE",
                        billable: false,
                        budgetEstimate: 0,
                        estimate: "",
                        assigneeId: "",
                        assigneeIds: [],
                        userGroupIds: [],
                    };
                },
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "t-1", name: "Existing" };
                },
            },
        };

        await run(
            registerTasksCommand,
            client,
            "tasks",
            "update",
            "p-1",
            "t-1",
            "--status",
            "done",
        );

        expect(gets).toEqual([{ workspaceId: "ws-1", projectId: "p-1", taskId: "t-1" }]);
        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({
            workspaceId: "ws-1",
            projectId: "p-1",
            taskId: "t-1",
            body: {
                name: "Existing",
                status: "DONE",
                billable: false,
                budgetEstimate: 0,
                estimate: "",
                assigneeId: "",
                assigneeIds: [],
                userGroupIds: [],
            },
        });
    });

    it("rejects a no-op before fetching or mutating", async () => {
        let gets = 0;
        let updates = 0;
        const client = {
            tasks: {
                get: async () => {
                    gets += 1;
                    return { name: "Existing", status: "ACTIVE", billable: false };
                },
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(registerTasksCommand, client, "tasks", "update", "p-1", "t-1"),
        ).rejects.toThrow(/at least one task field/i);
        expect(gets).toBe(0);
        expect(updates).toBe(0);
    });

    it("rejects an explicitly unchanged value after fetching without updating", async () => {
        let gets = 0;
        let updates = 0;
        const client = {
            tasks: {
                get: async () => {
                    gets += 1;
                    return { name: "Existing", status: "ACTIVE", billable: false };
                },
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerTasksCommand,
                client,
                "tasks",
                "update",
                "p-1",
                "t-1",
                "--status",
                "active",
            ),
        ).rejects.toThrow(/unchanged/i);
        expect(gets).toBe(1);
        expect(updates).toBe(0);
    });

    it("rejects missing required current state before mutation", async () => {
        let updates = 0;
        const client = {
            tasks: {
                get: async () => ({ id: "t-1", name: "", status: "ACTIVE", billable: false }),
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(registerTasksCommand, client, "tasks", "update", "p-1", "t-1", "--status", "done"),
        ).rejects.toThrow(/current task.*name/i);
        expect(updates).toBe(0);
    });

    it("uses a supplied task name when the current response omits it", async () => {
        const updates: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                get: async () => ({ id: "t-1", name: "", status: "ACTIVE", billable: false }),
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "t-1", name: "Repaired" };
                },
            },
        };

        await run(
            registerTasksCommand,
            client,
            "tasks",
            "update",
            "p-1",
            "t-1",
            "--name",
            "Repaired",
        );
        expect(updates[0]).toMatchObject({ body: { name: "Repaired" } });
    });

    it("omits a live null assigneeId when marking a task DONE for deletion", async () => {
        const updates: Record<string, unknown>[] = [];
        const deletes: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                get: async () => ({
                    id: "t-1",
                    projectId: "p-1",
                    name: "Known task",
                    status: "ACTIVE",
                    billable: false,
                    assigneeId: null,
                }),
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return request;
                },
                delete: async (request: Record<string, unknown>) => {
                    deletes.push(request);
                },
            },
        };

        await run(registerTasksCommand, client, "tasks", "delete", "p-1", "t-1");

        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({
            body: { name: "Known task", status: "DONE", billable: false },
        });
        expect(updates[0]).not.toHaveProperty("body.assigneeId");
        expect(deletes).toEqual([{ workspaceId: "ws-1", projectId: "p-1", taskId: "t-1" }]);
    });

    it.each([
        ["missing billable", { billable: undefined }, /billable/i],
        ["malformed billable", { billable: "false" }, /billable/i],
        ["missing status", { status: undefined }, /status/i],
        ["malformed status", { status: "ALL" }, /status/i],
        ["malformed assigneeId", { assigneeId: 123 }, /assigneeId/i],
        ["malformed assigneeIds", { assigneeIds: ["u-1", 123] }, /assigneeIds/i],
        ["malformed budgetEstimate", { budgetEstimate: 1.5 }, /budgetEstimate/i],
        ["malformed estimate", { estimate: 123 }, /estimate/i],
        ["malformed userGroupIds", { userGroupIds: [123] }, /userGroupIds/i],
    ])("rejects %s in current replacement state", async (_label, currentPatch, message) => {
        let updates = 0;
        const client = {
            tasks: {
                get: async () => ({
                    id: "t-1",
                    name: "Existing",
                    status: "ACTIVE",
                    billable: false,
                    ...currentPatch,
                }),
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerTasksCommand,
                client,
                "tasks",
                "update",
                "p-1",
                "t-1",
                "--name",
                "Changed",
            ),
        ).rejects.toThrow(message);
        expect(updates).toBe(0);
    });

    it("rolls a failed delete back with the known task name", async () => {
        const updates: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                get: async () => ({
                    id: "t-1",
                    projectId: "p-1",
                    name: "Known task",
                    status: "ACTIVE",
                    billable: false,
                }),
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return request;
                },
                delete: async () => {
                    throw new Error("delete failed");
                },
            },
        };

        await expect(
            run(registerTasksCommand, client, "tasks", "delete", "p-1", "t-1"),
        ).rejects.toThrow(/delete failed/);
        expect(updates).toHaveLength(2);
        expect(updates[0]).toMatchObject({ body: { name: "Known task", status: "DONE" } });
        expect(updates[1]).toMatchObject({ body: { name: "Known task", status: "ACTIVE" } });
    });
});

describe("typed client replacement requests", () => {
    it("fetches editable state, preserves empty values, and overlays explicit false", async () => {
        const gets: Record<string, unknown>[] = [];
        const updates: Record<string, unknown>[] = [];
        const client = {
            clients: {
                get: async (request: Record<string, unknown>) => {
                    gets.push(request);
                    return {
                        id: "c-1",
                        workspaceId: "ws-1",
                        name: "Existing",
                        address: "",
                        email: "",
                        note: "",
                        currencyCode: "",
                        archived: true,
                    };
                },
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "c-1", name: "Existing" };
                },
            },
        };

        await run(registerClientsCommand, client, "clients", "update", "c-1", "--no-archived");

        expect(gets).toEqual([{ workspaceId: "ws-1", clientId: "c-1" }]);
        expect(updates).toHaveLength(1);
        expect(updates[0]).toMatchObject({
            workspaceId: "ws-1",
            clientId: "c-1",
            body: {
                name: "Existing",
                address: "",
                email: "",
                note: "",
                currencyCode: "",
                archived: false,
            },
        });
    });

    it("rejects no-op and missing-name updates without mutation", async () => {
        let gets = 0;
        let updates = 0;
        const client = {
            clients: {
                get: async () => {
                    gets += 1;
                    return { id: "c-1", name: "", archived: false };
                },
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(registerClientsCommand, client, "clients", "update", "c-1"),
        ).rejects.toThrow(/at least one client field/i);
        expect(gets).toBe(0);

        await expect(
            run(registerClientsCommand, client, "clients", "update", "c-1", "--archived"),
        ).rejects.toThrow(/current client.*name/i);
        expect(updates).toBe(0);
    });

    it("uses a supplied client name when the current response omits it", async () => {
        const updates: Record<string, unknown>[] = [];
        const client = {
            clients: {
                get: async () => ({ id: "c-1", name: "", archived: false }),
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "c-1", name: "Repaired" };
                },
            },
        };

        await run(
            registerClientsCommand,
            client,
            "clients",
            "update",
            "c-1",
            "--name",
            "Repaired",
        );
        expect(updates[0]).toMatchObject({ body: { name: "Repaired" } });
    });

    it("rejects an explicitly unchanged value after fetching without updating", async () => {
        let gets = 0;
        let updates = 0;
        const client = {
            clients: {
                get: async () => {
                    gets += 1;
                    return { id: "c-1", name: "Existing", archived: false };
                },
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerClientsCommand,
                client,
                "clients",
                "update",
                "c-1",
                "--no-archived",
            ),
        ).rejects.toThrow(/unchanged/i);
        expect(gets).toBe(1);
        expect(updates).toBe(0);
    });

    it.each([
        ["missing archived", { archived: undefined }, /archived/i],
        ["malformed archived", { archived: "false" }, /archived/i],
        ["malformed address", { address: 123 }, /address/i],
        ["malformed currencyCode", { currencyCode: 123 }, /currencyCode/i],
        ["null currencyCode", { currencyCode: null }, /currencyCode/i],
        ["malformed email", { email: false }, /email/i],
        ["malformed note", { note: { text: "invalid" } }, /note/i],
    ])("rejects %s in current replacement state", async (_label, currentPatch, message) => {
        let updates = 0;
        const client = {
            clients: {
                get: async () => ({
                    id: "c-1",
                    name: "Existing",
                    archived: false,
                    ...currentPatch,
                }),
                update: async () => {
                    updates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerClientsCommand,
                client,
                "clients",
                "update",
                "c-1",
                "--name",
                "Changed",
            ),
        ).rejects.toThrow(message);
        expect(updates).toBe(0);
    });

    it("omits nullable address, email, and note from the replacement body", async () => {
        const updates: Record<string, unknown>[] = [];
        const client = {
            clients: {
                get: async () => ({
                    id: "c-1",
                    name: "Existing",
                    archived: false,
                    address: null,
                    email: null,
                    note: null,
                }),
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "c-1", name: "Changed" };
                },
            },
        };

        await run(
            registerClientsCommand,
            client,
            "clients",
            "update",
            "c-1",
            "--name",
            "Changed",
        );

        expect(updates[0]).toMatchObject({ body: { name: "Changed", archived: false } });
        expect(updates[0]?.body).not.toHaveProperty("address");
        expect(updates[0]?.body).not.toHaveProperty("email");
        expect(updates[0]?.body).not.toHaveProperty("note");
    });
});

describe("typed read compatibility", () => {
    it("keeps expense dates client-side and excludes them from the typed list request", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            expenses: {
                list: async (request: Record<string, unknown>) => {
                    calls.push(request);
                    return {
                        expenses: {
                            expenses: [
                                { id: "in", date: "2026-06-15", category: "Travel" },
                                { id: "out", date: "2026-07-01", category: "Travel" },
                            ],
                        },
                    };
                },
            },
        };

        await run(
            registerExpensesCommand,
            client,
            "expenses",
            "list",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        );

        expect(calls[0]).toEqual({ workspaceId: "ws-1", page: 1, "page-size": 50 });
        expect(calls[0]).not.toHaveProperty("start");
        expect(calls[0]).not.toHaveProperty("end");
    });

    it.each(["WEBHOOK", "ADDON_WEBHOOK"])(
        "passes webhook type %s through request-option query params",
        async (type) => {
            const calls: unknown[][] = [];
            const client = {
                webhooks: {
                    list: async (...args: unknown[]) => {
                        calls.push(args);
                        return { webhooks: [] };
                    },
                },
            };

            await run(registerWebhooksCommand, client, "webhooks", "list", "--type", type);

            expect(calls[0]?.[0]).toEqual({ workspaceId: "ws-1" });
            expect(calls[0]?.[1]).toEqual({ queryParams: { type } });
        },
    );
});

describe("typed webhook create requests", () => {
    it("pins the default WORKSPACE_ID trigger source to the configured workspace", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                create: async (request: Record<string, unknown>) => {
                    calls.push(request);
                    return { id: "w-1", name: "Hook" };
                },
            },
        };

        await run(
            registerWebhooksCommand,
            client,
            "webhooks",
            "create",
            "--name",
            "Hook",
            "--url",
            "https://example.com/hook",
            "--event",
            "NEW_PROJECT",
            "--trigger-source",
            "other-workspace",
        );

        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            body: {
                name: "Hook",
                url: "https://example.com/hook",
                webhookEvent: "NEW_PROJECT",
                triggerSourceType: "WORKSPACE_ID",
                triggerSource: ["ws-1"],
            },
        });
    });

    it.each([
        ["unknown event", ["--event", "NOT_REAL"], /unknown webhook event/i],
        [
            "unknown trigger type",
            ["--event", "NEW_PROJECT", "--trigger-source-type", "NOT_REAL"],
            /unknown trigger source type/i,
        ],
        [
            "missing non-workspace source",
            ["--event", "NEW_PROJECT", "--trigger-source-type", "PROJECT_ID"],
            /trigger source.*required/i,
        ],
    ])("rejects %s before create", async (_label, extra, message) => {
        let creates = 0;
        const client = {
            webhooks: {
                create: async () => {
                    creates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerWebhooksCommand,
                client,
                "webhooks",
                "create",
                "--name",
                "Hook",
                "--url",
                "https://example.com/hook",
                ...extra,
            ),
        ).rejects.toThrow(message);
        expect(creates).toBe(0);
    });

    it.each(["USER_EMAIL_CHANGED", "USER_UPDATED"])(
        "requires USER_ID trigger sources for %s before create",
        async (event) => {
            let creates = 0;
            const client = {
                webhooks: {
                    create: async () => {
                        creates += 1;
                        return {};
                    },
                },
            };

            await expect(
                run(
                    registerWebhooksCommand,
                    client,
                    "webhooks",
                    "create",
                    "--name",
                    "Hook",
                    "--url",
                    "https://example.com/hook",
                    "--event",
                    event,
                ),
            ).rejects.toThrow(/requires USER_ID/i);
            expect(creates).toBe(0);
        },
    );

    it("creates a user update webhook when USER_ID and a user source are supplied", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                create: async (request: Record<string, unknown>) => {
                    calls.push(request);
                    return { id: "w-1", name: "Hook" };
                },
            },
        };

        await run(
            registerWebhooksCommand,
            client,
            "webhooks",
            "create",
            "--name",
            "Hook",
            "--url",
            "https://example.com/hook",
            "--event",
            "USER_UPDATED",
            "--trigger-source-type",
            "USER_ID",
            "--trigger-source",
            "u-1",
        );

        expect(calls[0]).toMatchObject({
            body: {
                webhookEvent: "USER_UPDATED",
                triggerSourceType: "USER_ID",
                triggerSource: ["u-1"],
            },
        });
    });
});

describe("strict shared-report requests", () => {
    const validFilter = JSON.stringify({
        dateRangeStart: "2026-06-01T00:00:00Z",
        dateRangeEnd: "2026-06-30T23:59:59Z",
        exportType: "JSON",
        summaryFilter: { groups: ["PROJECT"], sortColumn: "DURATION" },
    });

    it("builds create and update from explicit validated fields", async () => {
        const creates: Record<string, unknown>[] = [];
        const updates: Record<string, unknown>[] = [];
        const client = {
            sharedReports: {
                create: async (request: Record<string, unknown>) => {
                    creates.push(request);
                    return { id: "sr-1", name: "Report" };
                },
                update: async (request: Record<string, unknown>) => {
                    updates.push(request);
                    return { id: "sr-1", name: "Report 2" };
                },
            },
        };

        await run(
            registerSharedReportsCommand,
            client,
            "shared-reports",
            "create",
            "--name",
            "Report",
            "--type",
            "summary",
            "--filter",
            validFilter,
            "--public",
        );
        await run(
            registerSharedReportsCommand,
            client,
            "shared-reports",
            "update",
            "sr-1",
            "--name",
            "Report 2",
            "--type",
            "summary",
            "--filter",
            validFilter,
        );

        expect(creates[0]).toMatchObject({
            workspaceId: "ws-1",
            body: {
                name: "Report",
                type: "SUMMARY",
                isPublic: true,
                filter: {
                    dateRangeStart: "2026-06-01T00:00:00Z",
                    dateRangeEnd: "2026-06-30T23:59:59Z",
                    exportType: "JSON",
                },
            },
        });
        expect(updates[0]).toMatchObject({
            workspaceId: "ws-1",
            sharedReportId: "sr-1",
            body: { name: "Report 2", type: "SUMMARY" },
        });
    });

    it.each([
        [
            "missing dates",
            JSON.stringify({ dateRangeStart: "2026-06-01", exportType: "JSON" }),
            /dateRangeEnd/,
        ],
        [
            "invalid dates",
            JSON.stringify({
                dateRangeStart: "not-a-date",
                dateRangeEnd: "2026-06-30",
                exportType: "JSON",
            }),
            /dateRangeStart.*date/i,
        ],
        [
            "unknown protected-scope key",
            JSON.stringify({
                dateRangeStart: "2026-06-01",
                dateRangeEnd: "2026-06-30",
                exportType: "JSON",
                workspaceId: "other",
            }),
            /unknown filter field.*workspaceId/i,
        ],
    ])("rejects %s before mutation", async (_label, filter, message) => {
        let creates = 0;
        const client = {
            sharedReports: {
                create: async () => {
                    creates += 1;
                    return {};
                },
            },
        };

        await expect(
            run(
                registerSharedReportsCommand,
                client,
                "shared-reports",
                "create",
                "--name",
                "Report",
                "--type",
                "summary",
                "--filter",
                filter,
            ),
        ).rejects.toThrow(message);
        expect(creates).toBe(0);
    });

    it.each([
        ["attendance page", { attendanceFilter: { page: 1.5 } }],
        ["attendance page size", { attendanceFilter: { pageSize: 25.5 } }],
        ["detailed page", { detailedFilter: { page: 1.5 } }],
        ["detailed page size", { detailedFilter: { pageSize: 25.5 } }],
    ])("rejects non-integer %s before mutation", async (_label, nestedFilter) => {
        let creates = 0;
        const client = {
            sharedReports: {
                create: async () => {
                    creates += 1;
                    return {};
                },
            },
        };
        const filter = JSON.stringify({
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            exportType: "JSON",
            ...nestedFilter,
        });

        await expect(
            run(
                registerSharedReportsCommand,
                client,
                "shared-reports",
                "create",
                "--name",
                "Report",
                "--type",
                "summary",
                "--filter",
                filter,
            ),
        ).rejects.toThrow(/integer/i);
        expect(creates).toBe(0);
    });

    it("rejects more than three summary groups before mutation", async () => {
        let creates = 0;
        const client = {
            sharedReports: {
                create: async () => {
                    creates += 1;
                    return {};
                },
            },
        };
        const filter = JSON.stringify({
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            exportType: "JSON",
            summaryFilter: { groups: ["CLIENT", "PROJECT", "TASK", "USER"] },
        });

        await expect(
            run(
                registerSharedReportsCommand,
                client,
                "shared-reports",
                "create",
                "--name",
                "Report",
                "--type",
                "summary",
                "--filter",
                filter,
            ),
        ).rejects.toThrow(/at most 3/i);
        expect(creates).toBe(0);
    });

    it("preserves canonical attendance users and open detailed filter objects", async () => {
        const creates: Record<string, unknown>[] = [];
        const client = {
            sharedReports: {
                create: async (request: Record<string, unknown>) => {
                    creates.push(request);
                    return { id: "sr-1", name: "Report" };
                },
            },
        };
        const filter = JSON.stringify({
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            exportType: "JSON",
            attendanceFilter: {
                users: { contains: "CONTAINS", ids: ["u-1"], status: "ACTIVE" },
            },
            detailedFilter: {
                auditFilter: { futureAuditFlag: true },
                options: { futureOption: "value" },
            },
        });

        await run(
            registerSharedReportsCommand,
            client,
            "shared-reports",
            "create",
            "--name",
            "Report",
            "--type",
            "summary",
            "--filter",
            filter,
        );

        expect(creates[0]).toMatchObject({
            body: {
                filter: {
                    attendanceFilter: {
                        users: { contains: "CONTAINS", ids: ["u-1"], status: "ACTIVE" },
                    },
                    detailedFilter: {
                        auditFilter: { futureAuditFlag: true },
                        options: { futureOption: "value" },
                    },
                },
            },
        });
    });

    it.each([
        ["attendance", { attendanceFilter: { page: 1, injected: true } }],
        ["attendance users", { attendanceFilter: { users: { injected: true } } }],
        ["detailed", { detailedFilter: { injected: true } }],
        ["summary", { summaryFilter: { groups: ["PROJECT"], injected: true } }],
        ["weekly", { weeklyFilter: { group: "PROJECT", subgroup: "TIME", injected: true } }],
    ])("rejects unknown %s filter fields", async (_label, nestedFilter) => {
        let creates = 0;
        const client = {
            sharedReports: {
                create: async () => {
                    creates += 1;
                    return {};
                },
            },
        };
        const filter = JSON.stringify({
            dateRangeStart: "2026-06-01T00:00:00Z",
            dateRangeEnd: "2026-06-30T23:59:59Z",
            exportType: "JSON",
            ...nestedFilter,
        });

        await expect(
            run(
                registerSharedReportsCommand,
                client,
                "shared-reports",
                "create",
                "--name",
                "Report",
                "--type",
                "summary",
                "--filter",
                filter,
            ),
        ).rejects.toThrow(/unknown.*filter field/i);
        expect(creates).toBe(0);
    });
});
