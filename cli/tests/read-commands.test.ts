import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";
import { registerProjectsCommand } from "../src/commands/projects.js";
import { registerReportsCommand } from "../src/commands/reports.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";
import { registerSharedReportsCommand } from "../src/commands/sharedReports.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import { registerTasksCommand } from "../src/commands/tasks.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";
import type { Registrar, Services } from "../src/commands/types.js";
import { registerUsersCommand } from "../src/commands/users.js";
import { registerWebhooksCommand } from "../src/commands/webhooks.js";

function makeProgram(register: Registrar, client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    register(program, services);
    return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

function lastJson(): unknown {
    return JSON.parse(logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string);
}

describe("webhooks read and create commands", () => {
    it("normalizes the webhooks envelope and maps webhookEvent to event", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        workspaceWebhookCount: 1,
                        webhooks: [
                            {
                                id: "wh-1",
                                name: "ci",
                                url: "https://x",
                                webhookEvent: "NEW_PROJECT",
                                enabled: true,
                            },
                        ],
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        expect(calls[0]).toMatchObject({ workspaceId: "ws-1" });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            id: "wh-1",
            event: "NEW_PROJECT",
            url: "https://x",
            enabled: true,
        });
    });

    it("handles a bare-array webhook list response", async () => {
        const client = {
            webhooks: {
                list: async () => [
                    {
                        id: "wh-2",
                        name: "n",
                        url: "https://y",
                        webhookEvent: "NEW_TIME_ENTRY",
                    },
                ],
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({
            id: "wh-2",
            event: "NEW_TIME_ENTRY",
            enabled: true,
        });
    });

    it("webhook list falls back to an empty array when the envelope is missing", async () => {
        const client = {
            webhooks: { list: async () => ({ workspaceWebhookCount: 0 }) },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
        ]);
        expect(lastJson()).toEqual([]);
    });

    it("create splits trigger sources into the body envelope", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        id: "wh-3",
                        name: "ci",
                        webhookEvent: "NEW_PROJECT",
                        url: "https://x",
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "create",
            "--name",
            "ci",
            "--url",
            "https://x",
            "--event",
            "NEW_PROJECT",
            "--trigger-source-type",
            "PROJECT_ID",
            "--trigger-source",
            "p1, p2 ,p3",
        ]);
        const body = calls[0].body as Record<string, unknown>;
        expect(body.webhookEvent).toBe("NEW_PROJECT");
        expect(body.triggerSource).toEqual(["p1", "p2", "p3"]);
        expect((lastJson() as Record<string, unknown>).action).toBe("webhooks.create");
    });

    it("list accepts a type filter and create works without trigger-source options", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            webhooks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { webhooks: [] };
                },
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return {
                        id: "wh-4",
                        name: body.name,
                        webhookEvent: body.webhookEvent,
                        url: body.url,
                        enabled: false,
                    };
                },
            },
        };
        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "list",
            "--type",
            "WEBHOOK",
        ]);
        expect(calls[0]).toMatchObject({ type: "WEBHOOK" });

        await makeProgram(registerWebhooksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "webhooks",
            "create",
            "--name",
            "plain",
            "--url",
            "https://plain",
            "--event",
            "NEW_TIME_ENTRY",
        ]);
        expect(calls[1].body).toMatchObject({
            name: "plain",
            url: "https://plain",
            webhookEvent: "NEW_TIME_ENTRY",
        });
        expect(lastJson()).toMatchObject({ enabled: false });
    });
});

describe("scheduling read and create commands", () => {
    it("list maps period.start/end into flat start/end columns", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        {
                            id: "a-1",
                            userId: "u-1",
                            projectId: "p-1",
                            hoursPerDay: 6,
                            period: { start: "2026-06-01", end: "2026-06-07" },
                            billable: true,
                        },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "scheduling",
            "list",
            "--from",
            "2026-06-01",
            "--to",
            "2026-06-07",
            "--limit",
            "999",
            "--name",
            "Design",
        ]);
        expect(calls[0]).toMatchObject({ workspaceId: "ws-1", "page-size": 200, name: "Design" });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({
            id: "a-1",
            user: "u-1",
            start: "2026-06-01",
            end: "2026-06-07",
            billable: true,
        });
        expect(rows[1]).toMatchObject({
            id: "",
            user: "",
            project: "",
            task: "",
            hoursPerDay: 0,
            start: "",
            end: "",
            billable: false,
            note: "",
        });
    });

    it("list omits optional scheduling filters when they are not supplied", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [];
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "scheduling",
            "list",
            "--from",
            "2026-06-01",
            "--to",
            "2026-06-30",
        ]);
        expect(calls[0]).toMatchObject({ "page-size": 25 });
        expect(calls[0]).not.toHaveProperty("name");
    });

    it("create defaults to draft and only publishes with --publish", async () => {
        const calls: Record<string, unknown>[] = [];
        const publishes: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                // Live Clockify has no single-assignment create; the command uses the
                // recurring endpoint (one-off when recurringAssignment is omitted) and
                // --publish maps to the separate range-based publish op.
                createRecurring: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    // createRecurring returns an ARRAY (one entry per occurrence).
                    return [
                        {
                            id: "a-9",
                            userId: "u-1",
                            projectId: "p-1",
                            hoursPerDay: 6,
                            start: body.start,
                            end: body.end,
                        },
                    ];
                },
                publish: async (req: Record<string, unknown>) => {
                    publishes.push(req);
                },
            },
        };
        const args = [
            "node",
            "clk115",
            "scheduling",
            "create",
            "--user",
            "u-1",
            "--project",
            "p-1",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-07",
            "--hours-per-day",
            "6",
        ];
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync(args);
        expect(calls[0].body as Record<string, unknown>).toMatchObject({
            start: "2026-06-01",
            end: "2026-06-07",
        });
        expect((calls[0].body as Record<string, unknown>).period).toBeUndefined();
        expect(publishes).toHaveLength(0);

        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            ...args,
            "--publish",
        ]);
        expect(publishes).toHaveLength(1);
        expect(publishes[0]).toMatchObject({ start: "2026-06-01", end: "2026-06-07" });
    });

    it("create includes every optional scheduling field when supplied", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                createRecurring: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    // createRecurring returns an ARRAY (one entry per occurrence).
                    return [{ id: "a-10", ...(req.body as Record<string, unknown>) }];
                },
                publish: async () => {
                    /* --publish maps to the separate range-based publish op */
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "scheduling",
            "create",
            "--user",
            "u-1",
            "--project",
            "p-1",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-07",
            "--hours-per-day",
            "8",
            "--task",
            "tk-1",
            "--note",
            "Plan",
            "--billable",
            "--include-non-working-days",
            "--publish",
        ]);
        expect(calls[0].body).toMatchObject({
            taskId: "tk-1",
            note: "Plan",
            billable: true,
            includeNonWorkingDays: true,
            start: "2026-06-01",
            end: "2026-06-07",
        });
    });
});

describe("project and task read command branches", () => {
    it("projects list applies filters, clamps the page size, and maps empty fallbacks", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        {
                            id: "p-1",
                            name: "Website",
                            clientId: "c-1",
                            archived: true,
                            billable: true,
                        },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "list",
            "--limit",
            "999",
            "--name",
            "Web",
            "--archived",
            "--client",
            "c-1",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            "page-size": 200,
            name: "Web",
            archived: true,
            clients: ["c-1"],
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "p-1", archived: true, billable: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", archived: false, billable: false });
    });

    it("projects create carries optional client/color/billable fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "p-2", name: body.name, clientId: body.clientId, color: body.color };
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "create",
            "Website",
            "--client",
            "c-1",
            "--color",
            "#123456",
            "--billable",
        ]);
        expect(calls[0].body).toMatchObject({
            name: "Website",
            clientId: "c-1",
            color: "#123456",
            billable: true,
        });
        expect((lastJson() as Record<string, unknown>).action).toBe("projects.create");
    });

    it("projects create and update cover omitted option branches", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            projects: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "p-3", name: body.name };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.projectId, name: (req.body as { name?: string }).name ?? "" };
                },
            },
        };
        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "create",
            "Minimal",
        ]);
        expect(calls[0].body).toEqual({ name: "Minimal" });

        await makeProgram(registerProjectsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "update",
            "p-3",
            "--client",
            "c-1",
            "--color",
            "#abcdef",
            "--note",
            "",
            "--no-billable",
            "--no-archived",
        ]);
        expect(calls[1].body).toMatchObject({
            clientId: "c-1",
            color: "#abcdef",
            note: "",
            billable: false,
            archived: false,
        });
    });

    it("tasks list applies filters and maps billable/status fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        { id: "tk-1", name: "QA", status: "ACTIVE", billable: true },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "list",
            "p-1",
            "--limit",
            "10",
            "--name",
            "QA",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            projectId: "p-1",
            "page-size": 10,
            name: "QA",
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "tk-1", status: "ACTIVE", billable: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", status: "", billable: false });
    });

    it("tasks create carries estimate, billable, and assignee ids", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tasks: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    return { id: "tk-2", name: body.name };
                },
            },
        };
        await makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "create",
            "p-1",
            "QA",
            "--estimate",
            "PT8H",
            "--billable",
            "--assignee",
            "u-1",
            "u-2",
        ]);
        expect(calls[0].body).toMatchObject({
            name: "QA",
            estimate: "PT8H",
            billable: true,
            assigneeIds: ["u-1", "u-2"],
        });
    });
});

describe("users, tags, and shared report read branches", () => {
    it("users list applies name and limit filters", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            users: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [{ id: "u-1", name: "Ana", email: "a@example.test", status: "ACTIVE" }];
                },
            },
        };
        await makeProgram(registerUsersCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "list",
            "--limit",
            "999",
            "--name",
            "Ana",
        ]);
        expect(calls[0]).toMatchObject({
            workspaceId: "ws-1",
            "page-size": 200,
            name: "Ana",
            "include-roles": false,
        });
        expect((lastJson() as Array<Record<string, unknown>>)[0]).toMatchObject({
            id: "u-1",
            email: "a@example.test",
        });
    });

    it("users update-profile sends only supplied optional profile fields", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            memberProfiles: {
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.userId };
                },
            },
        };
        await makeProgram(registerUsersCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "update-profile",
            "u-1",
            "--name",
            "Ana",
            "--image-url",
            "https://img",
            "--remove-image",
            "--week-start",
            "MONDAY",
            "--work-capacity",
            "PT8H",
            "--working-days",
            "MONDAY",
            "TUESDAY",
        ]);
        expect(calls[0].body).toMatchObject({
            name: "Ana",
            imageUrl: "https://img",
            removeProfileImage: true,
            weekStart: "MONDAY",
            workCapacity: "PT8H",
            workingDays: ["MONDAY", "TUESDAY"],
        });
    });

    it("users me works before a workspace is configured", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-me", email: "me@example.test" }) },
        };
        const program = new Command();
        program.exitOverride();
        program.option("--json", "Emit JSON.", false);
        registerUsersCommand(program, {
            loadConfig: () => ({ apiKey: "k" }),
            buildClient: () => client as unknown as ClockifyClient,
        });
        await program.parseAsync(["node", "clk115", "--json", "users", "me"]);
        expect(lastJson()).toMatchObject({ id: "u-me", email: "me@example.test" });
    });

    it("tags list applies filters and archived flag", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            tags: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [{ id: "t-1", name: "Deep", archived: true }, {}];
                },
            },
        };
        await makeProgram(registerTagsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "list",
            "--limit",
            "10",
            "--name",
            "Deep",
            "--archived",
        ]);
        expect(calls[0]).toMatchObject({ "page-size": 10, name: "Deep", archived: true });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "t-1", archived: true });
        expect(rows[1]).toMatchObject({ id: "", name: "", archived: false });
    });

    it("shared-reports view parses JSON bodies and update validates JSON filters", async () => {
        const calls: Record<string, unknown>[] = [];
        const encoder = new TextEncoder();
        const client = {
            sharedReports: {
                view: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        arrayBuffer: async () =>
                            encoder.encode(JSON.stringify({ ok: true, rows: [1] })).buffer,
                    };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: req.sharedReportId, name: (req.body as { name?: string }).name };
                },
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-1",
            "--export-type",
            "json",
        ]);
        expect(calls[0]).toMatchObject({ sharedReportId: "sr-1", exportType: "JSON" });
        expect(lastJson()).toMatchObject({ ok: true });

        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "update",
            "sr-1",
            "--name",
            "Public",
            "--type",
            "summary",
            "--filter",
            "{\"dateRangeStart\":\"2026-06-01\"}",
            "--public",
        ]);
        expect(calls[1].body).toMatchObject({
            name: "Public",
            type: "SUMMARY",
            public: true,
        });
        expect((lastJson() as Record<string, unknown>).action).toBe("shared-reports.update");
    });

    it("shared-reports view falls back for text bodies and create rejects invalid filters", async () => {
        const encoder = new TextEncoder();
        const client = {
            sharedReports: {
                view: async () => ({
                    arrayBuffer: async () => encoder.encode("not-json").buffer,
                }),
                create: async () => ({ id: "unused" }),
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-2",
        ]);
        expect(lastJson()).toEqual({ body: "not-json" });

        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "summary",
                "--filter",
                "[]",
            ]),
        ).rejects.toThrow(/--filter must be a JSON object/);
    });

    it("shared-reports view handles an empty response body", async () => {
        const client = {
            sharedReports: {
                view: async () => ({
                    arrayBuffer: async () => new ArrayBuffer(0),
                }),
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-empty",
        ]);
        expect(lastJson()).toEqual({ body: "" });
    });

    it("shared-reports create accepts valid filters and rejects unknown types", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            sharedReports: {
                create: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return { id: "sr-3", name: (req.body as { name?: string }).name };
                },
            },
        };
        await makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "create",
            "--name",
            "Visible",
            "--type",
            "weekly",
            "--filter",
            "{\"dateRangeStart\":\"2026-06-01\"}",
        ]);
        expect(calls[0].body).toMatchObject({ name: "Visible", type: "WEEKLY" });
        expect(calls[0].body).not.toHaveProperty("public");

        await expect(
            makeProgram(registerSharedReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "shared-reports",
                "create",
                "--name",
                "Bad",
                "--type",
                "not-real",
                "--filter",
                "{}",
            ]),
        ).rejects.toThrow(/Unknown --type/);
    });
});

describe("expenses list branch coverage", () => {
    it("list handles the doubly nested expense envelope and scalar category fallback", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            expenses: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        expenses: {
                            expenses: [
                                {
                                    id: "e-1",
                                    date: "2026-06-01",
                                    category: { name: "Travel" },
                                    quantity: 12,
                                    currency: "USD",
                                    billable: true,
                                },
                                { id: "e-2", category: "Meals", amount: 34 },
                                {},
                                // Both a computed total and a per-unit quantity:
                                // the row must show the total (3 * 50 = 150), not 3.
                                {
                                    id: "e-4",
                                    category: "Supplies",
                                    quantity: 3,
                                    total: 150,
                                },
                            ],
                        },
                    };
                },
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
            "--limit",
            "999",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        expect(calls[0]).toMatchObject({
            "page-size": 200,
            start: "2026-06-01",
            end: "2026-06-30",
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ category: "Travel", amount: 12, billable: true });
        expect(rows[1]).toMatchObject({ category: "Meals", amount: 34 });
        expect(rows[2]).toMatchObject({ id: "", category: "", amount: 0, billable: false });
        // total (150) wins over the per-unit quantity (3).
        expect(rows[3]).toMatchObject({ id: "e-4", category: "Supplies", amount: 150 });
    });

    it("list handles a direct expenses array envelope", async () => {
        const client = {
            expenses: {
                list: async () => ({ expenses: [{ id: "e-3", category: null }] }),
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
        ]);
        expect((lastJson() as Array<Record<string, unknown>>)[0]).toMatchObject({
            id: "e-3",
            category: "",
        });
    });

    it("rejects a non-numeric --limit before any wire call", async () => {
        // Number.parseInt("abc", 10) is NaN, which used to flow to the wire as
        // `page-size: Math.max(1, NaN) === NaN`. The shared parseIntArg parser
        // now raises a commander usage error so the bad value never lists.
        let listed = false;
        const client = {
            expenses: {
                list: async () => {
                    listed = true;
                    return { expenses: [] };
                },
            },
        };
        await expect(
            makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "expenses",
                "list",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("rejects a zero/negative --page before any wire call", async () => {
        let listed = false;
        const client = {
            expenses: {
                list: async () => {
                    listed = true;
                    return { expenses: [] };
                },
            },
        };
        await expect(
            makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "expenses",
                "list",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });
});

describe("list paging flags reject non-positive integers before any wire call", () => {
    // The shared parseIntArg parser now guards --page/--limit on these list
    // commands; a non-numeric or zero/negative value used to flow to the wire
    // as `page: NaN` / `page-size: NaN` (JSON.stringify serializes NaN to null).
    it("scheduling list rejects a non-numeric --limit", async () => {
        let listed = false;
        const client = {
            scheduling: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "scheduling",
                "list",
                "--from",
                "2026-06-01",
                "--to",
                "2026-06-30",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("scheduling list requires --from/--to and promotes bare dates to RFC3339 edges", async () => {
        let captured: Record<string, unknown> | undefined;
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    captured = req;
                    return [];
                },
            },
        };
        // Missing --from/--to is rejected locally (the endpoint 400s without them).
        await expect(
            makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "scheduling",
                "list",
            ]),
        ).rejects.toMatchObject({ code: "commander.missingMandatoryOptionValue" });
        expect(captured).toBeUndefined();
        // A bare YYYY-MM-DD is promoted to the day's start/end edge.
        await makeProgram(
            registerSchedulingCommand,
            client as unknown as ClockifyClient,
        ).parseAsync(["node", "clk115", "scheduling", "list", "--from", "2026-06-01", "--to", "2026-06-30"]);
        expect(captured?.start).toBe("2026-06-01T00:00:00Z");
        expect(captured?.end).toBe("2026-06-30T23:59:59Z");
    });

    it("tasks list rejects a zero/negative --page", async () => {
        let listed = false;
        const client = {
            tasks: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "tasks",
                "list",
                "p-1",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("timeoff list rejects a non-numeric --limit", async () => {
        let listed = false;
        const client = {
            timeOff: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerTimeOffCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "timeoff",
                "list",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("reports detailed rejects a zero/negative --page", async () => {
        let listed = false;
        const client = {
            reports: {
                detailed: async () => {
                    listed = true;
                    return { timeentries: [] };
                },
            },
        };
        await expect(
            makeProgram(registerReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "reports",
                "detailed",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });
});
