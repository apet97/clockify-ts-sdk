import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerEntriesCommand } from "../src/commands/entries.js";
import type { Registrar, Services } from "../src/commands/types.js";

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

function lastPayload(): Record<string, unknown> {
    return lastJson() as Record<string, unknown>;
}

/** An Error carrying the SDK's `statusCode` so the CLI status classifier wins. */
function statusError(status: number, message: string): Error {
    const err = new Error(message) as Error & { statusCode: number };
    err.statusCode = status;
    return err;
}

interface ListClient {
    client: ClockifyClient;
    listCalls: Record<string, unknown>[];
}

/**
 * Build a client whose `users.getCurrentUser` returns a fixed `user`
 * object and whose `timeEntries.listForUser` records its request and
 * returns `rows`. `user` defaults to a normal `{ id: "u-1" }`; pass a
 * shape with no string `id` to drive the "could not determine user ID"
 * branch.
 */
function makeListClient(rows: unknown[], user: Record<string, unknown> = { id: "u-1" }): ListClient {
    const listCalls: Record<string, unknown>[] = [];
    const client = {
        users: {
            getCurrentUser: async () => user,
        },
        timeEntries: {
            listForUser: async (req: Record<string, unknown>) => {
                listCalls.push(req);
                return rows;
            },
        },
    };
    return { client: client as unknown as ClockifyClient, listCalls };
}

describe("entries list", () => {
    it("maps a fully populated entry and clamps --limit above 200", async () => {
        const { client, listCalls } = makeListClient([
            {
                id: "te-1",
                description: "Design review",
                projectId: "p-1",
                taskId: "tk-1",
                billable: true,
                timeInterval: { start: "2026-06-01T09:00:00Z", end: "2026-06-01T10:00:00Z", duration: "PT1H" },
            },
        ]);
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "list",
            "--limit",
            "999",
        ]);
        // Upper clamp: Math.min(Math.max(1, 999), 200) === 200, default page 1.
        expect(listCalls[0]).toMatchObject({
            workspaceId: "ws-1",
            userId: "u-1",
            page: 1,
            "page-size": 200,
        });
        // No filters supplied -> the optional slots stay off the request.
        expect(listCalls[0]).not.toHaveProperty("start");
        expect(listCalls[0]).not.toHaveProperty("end");
        expect(listCalls[0]).not.toHaveProperty("description");
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({
            id: "te-1",
            description: "Design review",
            project: "p-1",
            task: "tk-1",
            billable: true,
            start: "2026-06-01T09:00:00Z",
            end: "2026-06-01T10:00:00Z",
            duration: "PT1H",
        });
    });

    it("fills empty defaults for a bare entry and treats a missing billable as false", async () => {
        const { client } = makeListClient([{}]);
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "list",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toEqual({
            id: "",
            description: "",
            project: "",
            task: "",
            billable: false,
            start: "",
            end: "",
            duration: "",
        });
    });

    it("treats a non-true billable value as false", async () => {
        const { client } = makeListClient([{ id: "te-2", billable: "yes" }]);
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "list",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ id: "te-2", billable: false });
    });

    it("forwards --from/--to/--description and --page to the request", async () => {
        const { client, listCalls } = makeListClient([]);
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "list",
            "--page",
            "3",
            "--from",
            "2026-06-01T00:00:00Z",
            "--to",
            "2026-06-30T23:59:59Z",
            "--description",
            "standup",
        ]);
        expect(listCalls[0]).toMatchObject({
            page: 3,
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-30T23:59:59Z",
            description: "standup",
        });
    });

    it("clamps a zero --limit up to the minimum page size of 1", async () => {
        const { client, listCalls } = makeListClient([]);
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "list",
            "--limit",
            "0",
        ]);
        // Math.min(Math.max(1, 0), 200) === 1.
        expect(listCalls[0]).toMatchObject({ "page-size": 1 });
    });

    it("throws when the current user has no usable id", async () => {
        // A non-string id is rejected by entityId -> the handler must bail
        // before listing rather than send a request with a bad userId.
        const { client, listCalls } = makeListClient([], { id: 12345 });
        await expect(
            makeProgram(registerEntriesCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "entries",
                "list",
            ]),
        ).rejects.toThrow(/could not determine user ID/);
        // The list call must not fire once the user id is unresolved.
        expect(listCalls).toHaveLength(0);
    });

    it("propagates a 404 from listForUser with its status code attached", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1" }) },
            timeEntries: {
                listForUser: async () => {
                    throw statusError(404, "HTTP 404: workspace not accessible");
                },
            },
        };
        await expect(
            makeProgram(registerEntriesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "--json",
                "entries",
                "list",
            ]),
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe("entries delete", () => {
    interface DeleteClient {
        client: ClockifyClient;
        deleteCalls: Record<string, unknown>[];
    }

    function makeDeleteClient(): DeleteClient {
        const deleteCalls: Record<string, unknown>[] = [];
        const client = {
            timeEntries: {
                delete: async (req: Record<string, unknown>) => {
                    deleteCalls.push(req);
                    return undefined;
                },
            },
        };
        return { client: client as unknown as ClockifyClient, deleteCalls };
    }

    it("deletes by id and emits a deleted receipt with recovery next-step", async () => {
        const { client, deleteCalls } = makeDeleteClient();
        await makeProgram(registerEntriesCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "entries",
            "delete",
            "te-9",
        ]);
        expect(deleteCalls[0]).toMatchObject({ workspaceId: "ws-1", timeEntryId: "te-9" });
        const payload = lastPayload();
        expect(payload).toMatchObject({
            ok: true,
            action: "entries.delete",
            entity: "time_entry",
            deleted: true,
            id: "te-9",
            message: "deleted time entry te-9",
        });
        expect(payload.ids).toMatchObject({ entryId: "te-9" });
        expect((payload.changed as { deleted: Array<Record<string, unknown>> }).deleted).toEqual([
            { type: "time_entry", id: "te-9" },
        ]);
        const next = payload.next as Array<Record<string, unknown>>;
        expect(next[0]?.command).toContain("entries list");
    });

    it("rejects when no id argument is supplied", async () => {
        const { client, deleteCalls } = makeDeleteClient();
        await expect(
            makeProgram(registerEntriesCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "entries",
                "delete",
            ]),
        ).rejects.toMatchObject({ code: "commander.missingArgument" });
        expect(deleteCalls).toHaveLength(0);
    });

    it("propagates a 403 from the delete call so the process can exit non-zero", async () => {
        const client = {
            timeEntries: {
                delete: async () => {
                    throw statusError(403, "HTTP 403: forbidden");
                },
            },
        };
        await expect(
            makeProgram(registerEntriesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "--json",
                "entries",
                "delete",
                "te-locked",
            ]),
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("requires a configured workspace before deleting", async () => {
        const { client } = makeDeleteClient();
        const program = new Command();
        program.exitOverride();
        program.option("--json", "Emit JSON.", false);
        registerEntriesCommand(program, {
            loadConfig: () => ({ apiKey: "k" }),
            buildClient: () => client,
        });
        await expect(
            program.parseAsync(["node", "clk115", "--json", "entries", "delete", "te-1"]),
        ).rejects.toThrow(/workspace ID not set/);
    });
});
