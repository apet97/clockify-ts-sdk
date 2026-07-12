import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";
import { registerProjectsCommand } from "../src/commands/projects.js";
import { registerSharedReportsCommand } from "../src/commands/sharedReports.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import { registerTasksCommand } from "../src/commands/tasks.js";
import type { Registrar, Services } from "../src/commands/types.js";
import { registerUsersCommand } from "../src/commands/users.js";

interface Calls {
    updates: Record<string, unknown>[];
    deletes: Record<string, unknown>[];
    creates: Record<string, unknown>[];
}

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

function lastPayload(): Record<string, unknown> {
    const line = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
    return JSON.parse(line) as Record<string, unknown>;
}

describe("projects CRUD", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], deletes: [], creates: [] };
        const client = {
            projects: {
                get: async () => ({ id: "p-1", name: "Acme" }),
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "p-1", name: body.name ?? "Acme" };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("update emits an updated receipt", async () => {
        const { client } = makeClient();
        await makeProgram(registerProjectsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "update",
            "p-1",
            "--name",
            "Renamed",
        ]);
        const payload = lastPayload();
        expect(payload.action).toBe("projects.update");
        expect(payload.ids).toMatchObject({ projectId: "p-1" });
    });

    it("delete archives first, then deletes, with deleted:true receipt", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerProjectsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "projects",
            "delete",
            "p-1",
        ]);
        // archive-then-delete: one update with archived:true, then a delete.
        expect(calls.updates[calls.updates.length - 1]).toMatchObject({
            archived: true,
            name: "Acme",
        });
        expect(calls.deletes).toHaveLength(1);
        const payload = lastPayload();
        expect(payload.deleted).toBe(true);
        expect((payload.changed as { deleted: unknown[] }).deleted).toHaveLength(1);
    });
});

describe("clients CRUD", () => {
    function makeClient(name = "Globex"): {
        client: ClockifyClient;
        calls: Calls & { lists: Record<string, unknown>[] };
    } {
        const calls: Calls & { lists: Record<string, unknown>[] } = {
            updates: [],
            deletes: [],
            creates: [],
            lists: [],
        };
        const client = {
            clients: {
                list: async (req: Record<string, unknown>) => {
                    calls.lists.push(req);
                    return [{ id: "c-1", name, note: "vip", archived: false }];
                },
                create: async (body: Record<string, unknown>) => {
                    calls.creates.push(body);
                    return { id: "c-1", name };
                },
                get: async () => ({ id: "c-1", name, archived: false }),
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "c-1", name };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("list prints rows and passes name/archived filters through", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "list",
            "--name",
            "Glob",
            "--archived",
        ]);
        expect(calls.lists[0]).toMatchObject({ name: "Glob", archived: true });
    });

    it("create emits a created receipt", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "create",
            "Globex",
            "--note",
            "vip",
        ]);
        expect(calls.creates[0]).toMatchObject({ body: { name: "Globex", note: "vip" } });
        const payload = lastPayload();
        expect(payload.action).toBe("clients.create");
        expect(payload.ids).toMatchObject({ clientId: "c-1" });
    });

    it("get prints the fetched client object", async () => {
        const { client } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "get",
            "c-1",
        ]);
        expect(lastPayload()).toMatchObject({ id: "c-1", name: "Globex" });
    });

    it("update emits an updated receipt and carries fields in the body envelope", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "update",
            "c-1",
            "--name",
            "Renamed",
            "--note",
            "n",
            "--address",
            "addr",
            "--archived",
        ]);
        expect(calls.updates[0]).toMatchObject({
            body: { name: "Renamed", note: "n", address: "addr", archived: true },
        });
        const payload = lastPayload();
        expect(payload.action).toBe("clients.update");
        expect(payload.ids).toMatchObject({ clientId: "c-1" });
    });

    it("delete archives via the body envelope, then deletes (deleted:true)", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "delete",
            "c-1",
        ]);
        // The archive PUT must carry the name+archived inside a `body` envelope.
        expect(calls.updates[calls.updates.length - 1]).toMatchObject({
            body: { name: "Globex", archived: true },
        });
        expect(calls.deletes).toHaveLength(1);
        expect(lastPayload().deleted).toBe(true);
    });

    it("delete throws when the client has no name to carry through", async () => {
        const { client } = makeClient("");
        await expect(
            makeProgram(registerClientsCommand, client).parseAsync([
                "node",
                "clk115",
                "clients",
                "delete",
                "c-1",
            ]),
        ).rejects.toThrow(/no name to carry through/);
    });
});

describe("tags CRUD", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], deletes: [], creates: [] };
        const client = {
            tags: {
                get: async () => ({ id: "t-1", name: "urgent" }),
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "t-1", name: body.name ?? "urgent" };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("delete is direct (no archive) and emits deleted:true", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTagsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "delete",
            "t-1",
        ]);
        expect(calls.updates).toHaveLength(0);
        expect(calls.deletes).toHaveLength(1);
        expect(lastPayload().deleted).toBe(true);
    });
});

describe("tasks CRUD", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], deletes: [], creates: [] };
        const client = {
            tasks: {
                get: async () => ({
                    id: "tk-1",
                    name: "QA",
                    status: "ACTIVE",
                    billable: false,
                }),
                create: async (body: Record<string, unknown>) => {
                    calls.creates.push(body);
                    return { id: "tk-1", name: body.name };
                },
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "tk-1", name: body.name ?? "QA" };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("create is project-scoped and emits a created receipt", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTasksCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "create",
            "p-1",
            "Build",
        ]);
        expect(calls.creates[0]).toMatchObject({ projectId: "p-1", body: { name: "Build" } });
        expect(lastPayload().action).toBe("tasks.create");
    });

    it("delete marks DONE first, then deletes (deleted:true)", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTasksCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "delete",
            "p-1",
            "tk-1",
        ]);
        expect(calls.updates[calls.updates.length - 1]).toMatchObject({
            projectId: "p-1",
            body: { status: "DONE", name: "QA", billable: false },
        });
        expect(calls.deletes).toHaveLength(1);
        expect(lastPayload().deleted).toBe(true);
    });
});

describe("expenses CRUD", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], deletes: [], creates: [] };
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-owner" }) },
            expenses: {
                get: async () => ({ id: "ex-1" }),
                create: async (body: Record<string, unknown>) => {
                    calls.creates.push(body);
                    return { id: "ex-new" };
                },
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "ex-1" };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("create posts a scalar body with an explicit --user", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerExpensesCommand, client).parseAsync([
            "node", "clk115", "--json", "expenses", "create",
            "--amount", "12.5", "--category", "cat-1", "--date", "2026-06-18", "--user", "u-1",
        ]);
        expect(calls.creates).toHaveLength(1);
        expect(calls.creates[0]).toMatchObject({
            amount: 12.5,
            categoryId: "cat-1",
            date: "2026-06-18T00:00:00Z",
            userId: "u-1",
            workspaceId: "ws-1",
        });
        // create is a POST — no changeFields whitelist (that is PUT-only).
        expect(calls.creates[0]).not.toHaveProperty("changeFields");
        expect(lastPayload().changed).toMatchObject({ created: [{ type: "expense", id: "ex-new" }] });
    });

    it("create defaults --user to the API-key owner (getCurrentUser)", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerExpensesCommand, client).parseAsync([
            "node", "clk115", "--json", "expenses", "create",
            "--amount", "5", "--category", "cat-1", "--date", "2026-06-18",
        ]);
        expect(calls.creates[0]).toMatchObject({ userId: "u-owner" });
    });

    it("update derives changeFields from the supplied scalars", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerExpensesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "update",
            "ex-1",
            "--amount",
            "12.5",
            "--category",
            "cat-1",
            "--date",
            "2026-06-18",
            "--user",
            "u-1",
        ]);
        expect(calls.updates[0]).toMatchObject({
            amount: 12.5,
            categoryId: "cat-1",
            date: "2026-06-18T00:00:00Z",
            userId: "u-1",
            changeFields: expect.arrayContaining(["AMOUNT", "DATE", "CATEGORY"]),
        });
    });

    it("delete is direct and emits deleted:true", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerExpensesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "delete",
            "ex-1",
        ]);
        expect(calls.deletes).toHaveLength(1);
        expect(lastPayload().deleted).toBe(true);
    });
});

describe("shared-reports CRUD", () => {
    function makeClient(): {
        client: ClockifyClient;
        calls: Calls & { views: Record<string, unknown>[] };
    } {
        const calls = { updates: [], deletes: [], creates: [], views: [] } as Calls & {
            views: Record<string, unknown>[];
        };
        const client = {
            sharedReports: {
                list: async () => ({ sharedReports: [] }),
                view: async (req: Record<string, unknown>) => {
                    calls.views.push(req);
                    return {
                        arrayBuffer: async () =>
                            new TextEncoder().encode(JSON.stringify({ totals: { duration: 10 } }))
                                .buffer,
                    };
                },
                create: async (body: Record<string, unknown>) => {
                    calls.creates.push(body);
                    return { id: "sr-1", name: "Weekly" };
                },
                update: async (body: Record<string, unknown>) => {
                    calls.updates.push(body);
                    return { id: "sr-1", name: "Weekly" };
                },
                delete: async (body: Record<string, unknown>) => {
                    calls.deletes.push(body);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("view passes only the shared-report id (no workspaceId) and parses JSON", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerSharedReportsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "view",
            "sr-1",
        ]);
        expect(calls.views[0]).not.toHaveProperty("workspaceId");
        expect(calls.views[0]).toMatchObject({ sharedReportId: "sr-1" });
        expect(lastPayload()).toMatchObject({ totals: { duration: 10 } });
    });

    it("create parses --filter JSON and emits a created receipt", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerSharedReportsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "create",
            "--name",
            "Weekly",
            "--type",
            "summary",
            "--filter",
            '{"dateRangeStart":"2026-06-01","dateRangeEnd":"2026-06-30","exportType":"JSON"}',
        ]);
        expect(calls.creates[0]).toMatchObject({
            body: {
                name: "Weekly",
                type: "SUMMARY",
                filter: {
                    dateRangeStart: "2026-06-01",
                    dateRangeEnd: "2026-06-30",
                    exportType: "JSON",
                },
            },
        });
        expect(lastPayload().action).toBe("shared-reports.create");
    });

    it("delete is direct and emits deleted:true", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerSharedReportsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "shared-reports",
            "delete",
            "sr-1",
        ]);
        expect(calls.deletes).toHaveLength(1);
        expect(lastPayload().deleted).toBe(true);
    });
});

describe("users P1-7 writes", () => {
    function makeClient(): {
        client: ClockifyClient;
        added: Record<string, unknown>[];
        profiles: Record<string, unknown>[];
    } {
        const added: Record<string, unknown>[] = [];
        const profiles: Record<string, unknown>[] = [];
        const client = {
            workspaces: {
                addUser: async (req: Record<string, unknown>) => {
                    added.push(req);
                    return { id: "ws-1" };
                },
            },
            memberProfiles: {
                update: async (req: Record<string, unknown>) => {
                    profiles.push(req);
                    return { id: "u-1" };
                },
            },
        };
        return { client: client as unknown as ClockifyClient, added, profiles };
    }

    it("invite sends the send-email query and emits a created receipt", async () => {
        const { client, added } = makeClient();
        await makeProgram(registerUsersCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "invite",
            "new@example.com",
        ]);
        expect(added[0]).toMatchObject({ email: "new@example.com", "send-email": "true" });
        expect(lastPayload().action).toBe("users.invite");
    });

    it("invite honours --no-send-email", async () => {
        const { client, added } = makeClient();
        await makeProgram(registerUsersCommand, client).parseAsync([
            "node",
            "clk115",
            "users",
            "invite",
            "x@example.com",
            "--no-send-email",
        ]);
        expect(added[0]).toMatchObject({ "send-email": "false" });
    });

    it("update-profile patches the member profile body", async () => {
        const { client, profiles } = makeClient();
        await makeProgram(registerUsersCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "users",
            "update-profile",
            "u-1",
            "--week-start",
            "MONDAY",
        ]);
        expect(profiles[0]).toMatchObject({ userId: "u-1", body: { weekStart: "MONDAY" } });
        expect(lastPayload().action).toBe("users.update-profile");
    });
});
