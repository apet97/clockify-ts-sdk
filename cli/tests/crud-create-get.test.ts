// Fills the thin coverage on the tags/tasks/clients create/get/update
// subcommands that crud.test.ts does not reach (crud.test.ts focuses on the
// delete sequences and a couple of update/create receipts). In particular this
// pins the tags `--no-archived` boolean branch (archived:false) and the parallel
// clients `--no-archived` branch, plus the plain `get` print path for each.
// Self-contained harness so it shares no file or fixture with crud.test.ts.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerTagsCommand } from "../src/commands/tags.js";
import { registerTasksCommand } from "../src/commands/tasks.js";
import type { Registrar, Services } from "../src/commands/types.js";

interface Calls {
    updates: Record<string, unknown>[];
    creates: Record<string, unknown>[];
    gets: Record<string, unknown>[];
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

describe("tags create/get/update coverage", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], creates: [], gets: [] };
        const client = {
            tags: {
                create: async (req: Record<string, unknown>) => {
                    calls.creates.push(req);
                    return { id: "t-1", name: (req.body as { name?: string }).name };
                },
                get: async (req: Record<string, unknown>) => {
                    calls.gets.push(req);
                    return { id: "t-1", name: "urgent", archived: false };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.updates.push(req);
                    return { id: "t-1", name: "urgent" };
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("create wraps the name in a body envelope and emits a created receipt", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTagsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "create",
            "urgent",
        ]);
        expect(calls.creates[0]).toMatchObject({ workspaceId: "ws-1", body: { name: "urgent" } });
        const payload = lastPayload();
        expect(payload.action).toBe("tags.create");
        expect(payload.ids).toMatchObject({ tagId: "t-1" });
    });

    it("get prints the fetched tag object", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTagsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "get",
            "t-1",
        ]);
        expect(calls.gets[0]).toMatchObject({ workspaceId: "ws-1", tagId: "t-1" });
        expect(lastPayload()).toMatchObject({ id: "t-1", name: "urgent" });
    });

    it("update --archived sets archived:true in the body", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTagsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "update",
            "t-1",
            "--name",
            "Renamed",
            "--archived",
        ]);
        expect(calls.updates[0]).toMatchObject({
            workspaceId: "ws-1",
            tagId: "t-1",
            body: { name: "Renamed", archived: true },
        });
        expect(lastPayload().action).toBe("tags.update");
    });

    it("update --no-archived sets archived:false in the body", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTagsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tags",
            "update",
            "t-1",
            "--no-archived",
        ]);
        // The boolean negation branch: opts.archived === false -> body.archived = false.
        expect(calls.updates[0]).toMatchObject({ tagId: "t-1", body: { archived: false } });
        expect((calls.updates[0]!.body as { name?: string }).name).toBeUndefined();
    });
});

describe("tasks get/update coverage", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], creates: [], gets: [] };
        const client = {
            tasks: {
                get: async (req: Record<string, unknown>) => {
                    calls.gets.push(req);
                    return { id: "tk-1", name: "QA", status: "ACTIVE" };
                },
                update: async (req: Record<string, unknown>) => {
                    calls.updates.push(req);
                    return { id: "tk-1", name: "QA" };
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("get is project-scoped and prints the fetched task", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTasksCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "get",
            "p-1",
            "tk-1",
        ]);
        expect(calls.gets[0]).toMatchObject({ workspaceId: "ws-1", projectId: "p-1", taskId: "tk-1" });
        expect(lastPayload()).toMatchObject({ id: "tk-1", name: "QA" });
    });

    it("update upper-cases status, carries assignees, and honours --no-billable", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTasksCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "tasks",
            "update",
            "p-1",
            "tk-1",
            "--name",
            "QA-2",
            "--status",
            "done",
            "--estimate",
            "PT8H",
            "--no-billable",
            "--assignee",
            "u-1",
            "--assignee",
            "u-2",
        ]);
        expect(calls.updates[0]).toMatchObject({
            workspaceId: "ws-1",
            projectId: "p-1",
            taskId: "tk-1",
            body: {
                name: "QA-2",
                status: "DONE",
                estimate: "PT8H",
                billable: false,
                assigneeIds: ["u-1", "u-2"],
            },
        });
        expect(lastPayload().action).toBe("tasks.update");
    });
});

describe("clients update --no-archived coverage", () => {
    function makeClient(): { client: ClockifyClient; calls: Calls } {
        const calls: Calls = { updates: [], creates: [], gets: [] };
        const client = {
            clients: {
                update: async (req: Record<string, unknown>) => {
                    calls.updates.push(req);
                    return { id: "c-1", name: "Globex" };
                },
            },
        };
        return { client: client as unknown as ClockifyClient, calls };
    }

    it("update --no-archived carries archived:false through the body envelope", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "update",
            "c-1",
            "--name",
            "Client",
            "--no-archived",
        ]);
        expect(calls.updates[0]).toMatchObject({
            workspaceId: "ws-1",
            clientId: "c-1",
            body: { name: "Client", archived: false },
        });
        const payload = lastPayload();
        expect(payload.action).toBe("clients.update");
        expect(payload.ids).toMatchObject({ clientId: "c-1" });
    });
});
