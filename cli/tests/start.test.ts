import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerStartCommand } from "../src/commands/start.js";
import type { Services } from "../src/commands/types.js";

const ID_A = "a".repeat(24);

interface Stub {
    projects?: unknown[];
    tasks?: unknown[];
    tags?: unknown[];
}

function makeClient(stub: Stub = {}): {
    client: ClockifyClient;
    created: Record<string, unknown>[];
    listed: string[];
} {
    const created: Record<string, unknown>[] = [];
    const listed: string[] = [];
    const client = {
        users: { getCurrentUser: async () => ({ id: "user-1" }) },
        projects: {
            list: async () => {
                listed.push("projects");
                return stub.projects ?? [];
            },
        },
        tasks: {
            list: async () => {
                listed.push("tasks");
                return stub.tasks ?? [];
            },
        },
        tags: {
            list: async () => {
                listed.push("tags");
                return stub.tags ?? [];
            },
        },
        timeEntries: {
            create: async (body: Record<string, unknown>) => {
                created.push(body);
                return { id: "te-1", ...body };
            },
        },
    };
    return { client: client as unknown as ClockifyClient, created, listed };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerStartCommand(program, services);
    return program;
}

function run(client: ClockifyClient, args: string[]): Promise<Command> {
    return makeProgram(client).parseAsync(["node", "clk115", "start", ...args]);
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("start command", () => {
    it("passes a 24-hex project id through without a list lookup", async () => {
        const { client, created, listed } = makeClient();
        await run(client, ["wrote tests", "--project", ID_A]);
        expect(listed).not.toContain("projects");
        expect(created[0]?.projectId).toBe(ID_A);
        expect(created[0]?.description).toBe("wrote tests");
    });

    it("resolves a project name to its id via the list query", async () => {
        const { client, created, listed } = makeClient({ projects: [{ id: "p-1", name: "Website" }] });
        await run(client, ["work", "--project", "Website"]);
        expect(listed).toContain("projects");
        expect(created[0]?.projectId).toBe("p-1");
    });

    it("throws a clear error when the project name does not resolve", async () => {
        const { client } = makeClient({ projects: [{ id: "p-1", name: "Other" }] });
        await expect(run(client, ["work", "--project", "Missing"])).rejects.toThrow(
            /project "Missing" not found/,
        );
    });

    it("resolves multiple tags, mixing ids and names", async () => {
        const { client, created } = makeClient({ tags: [{ id: "t-2", name: "Deep Work" }] });
        await run(client, ["work", "--tag", ID_A, "--tag", "Deep Work"]);
        expect(created[0]?.tagIds).toEqual([ID_A, "t-2"]);
    });
});
