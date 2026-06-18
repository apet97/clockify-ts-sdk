import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerLogCommand } from "../src/commands/log.js";
import type { Services } from "../src/commands/types.js";

function makeClient(): { client: ClockifyClient; created: Record<string, unknown>[] } {
    const created: Record<string, unknown>[] = [];
    const client = {
        timeEntries: {
            create: async (body: Record<string, unknown>) => {
                created.push(body);
                return { id: "te-1", ...body };
            },
        },
        // Name→id resolution mirrors `start`: a non-hex --project/--task/--tag
        // does one list lookup, so the mock returns a row matching by name.
        projects: { list: async () => [{ id: "p-1", name: "p-1" }] },
        tasks: { list: async () => [{ id: "tk-1", name: "tk-1" }] },
        tags: { list: async () => [{ id: "t-1", name: "t-1" }] },
    };
    return { client: client as unknown as ClockifyClient, created };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerLogCommand(program, services);
    return program;
}

function run(client: ClockifyClient, args: string[]): Promise<Command> {
    return makeProgram(client).parseAsync(["node", "clk115", "log", ...args]);
}

function runJson(client: ClockifyClient, args: string[]): Promise<Command> {
    return makeProgram(client).parseAsync(["node", "clk115", "--json", "log", ...args]);
}

const END = "2026-06-01T10:00:00.000Z";

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("log command", () => {
    it.each([["1h30m"], ["90"], ["PT1H30M"]])(
        "derives start = end - duration for %s (90 minutes)",
        async (duration) => {
            const { client, created } = makeClient();
            await run(client, [duration, "wrote tests", "--end", END]);
            const body = (created[0] as { body?: { end?: string; start?: string } })?.body;
            expect(body?.end).toBe(END);
            expect(body?.start).toBe("2026-06-01T08:30:00.000Z");
        },
    );

    it("rejects an unparseable duration", async () => {
        const { client } = makeClient();
        await expect(run(client, ["banana", "work", "--end", END])).rejects.toThrow(
            /cannot parse duration/,
        );
    });

    it("rejects an invalid --end timestamp", async () => {
        const { client } = makeClient();
        await expect(run(client, ["30m", "work", "--end", "not-a-date"])).rejects.toThrow(
            /not a valid ISO 8601/,
        );
    });

    it("errors when --task is given without --project", async () => {
        const { client } = makeClient();
        await expect(run(client, ["30m", "work", "--end", END, "--task", "tk-1"])).rejects.toThrow(
            /--task requires --project/,
        );
    });

    it("passes project, tag, and billable through to the entry body", async () => {
        const { client, created } = makeClient();
        await run(client, [
            "30m",
            "work",
            "--end",
            END,
            "--project",
            "p-1",
            "--tag",
            "t-1",
            "--billable",
        ]);
        expect((created[0] as { body?: unknown }).body).toMatchObject({
            projectId: "p-1",
            tagIds: ["t-1"],
            billable: true,
        });
    });

    it("prints additive receipt fields while keeping top-level id", async () => {
        const { client } = makeClient();
        await runJson(client, ["30m", "work", "--end", END]);
        const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
        expect(payload.id).toBe("te-1");
        expect(payload.ok).toBe(true);
        expect(payload.action).toBe("entries.log");
        expect(payload.ids.entryId).toBe(payload.id);
        expect(payload.changed.created[0].id).toBe(payload.id);
    });
});
