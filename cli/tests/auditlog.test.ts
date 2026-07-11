import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerAuditLogCommand } from "../src/commands/auditlog.js";
import type { Services } from "../src/commands/types.js";

function makeClient(response: unknown = [{ id: "a-1" }]): {
    client: ClockifyClient;
    calls: unknown[];
} {
    const calls: unknown[] = [];
    const client = {
        auditLogReport: {
            search: async (req: unknown) => {
                calls.push(req);
                return response;
            },
        },
    };
    return { client: client as unknown as ClockifyClient, calls };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerAuditLogCommand(program, services);
    return program;
}

function run(client: ClockifyClient, args: string[]): Promise<Command> {
    return makeProgram(client).parseAsync(["node", "clk115", "audit-log", "search", ...args]);
}

const WINDOW = ["--start", "2026-05-01T00:00:00Z", "--end", "2026-05-07T00:00:00Z"];

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("audit-log search command", () => {
    it("rejects a missing required --actions flag", async () => {
        const { client } = makeClient();
        await expect(run(client, [...WINDOW])).rejects.toThrow(/required option.*actions/i);
    });

    it("rejects an actions list that is empty after trimming", async () => {
        const { client } = makeClient();
        await expect(run(client, [...WINDOW, "--actions", " , , "])).rejects.toThrow(
            /at least one action/,
        );
    });

    it("splits the actions list on commas and trims whitespace", async () => {
        const { client, calls } = makeClient();
        await run(client, [...WINDOW, "--actions", "CREATE_PROJECT, UPDATE_PROJECT ,DELETE_PROJECT"]);
        expect((calls[0] as { actions: string[] }).actions).toEqual([
            "CREATE_PROJECT",
            "UPDATE_PROJECT",
            "DELETE_PROJECT",
        ]);
    });

    it("defaults authors mode to CONTAINS and toggles to DOES_NOT_CONTAIN", async () => {
        const includeClient = makeClient();
        await run(includeClient.client, [...WINDOW, "--actions", "CREATE_PROJECT", "--authors", "u-1,SYSTEM"]);
        expect((includeClient.calls[0] as { authors: Record<string, unknown> }).authors).toEqual({
            authorIds: ["u-1", "SYSTEM"],
            contains: "CONTAINS",
        });

        const excludeClient = makeClient();
        await run(excludeClient.client, [
            ...WINDOW,
            "--actions",
            "CREATE_PROJECT",
            "--authors",
            "u-1",
            "--authors-mode",
            "DOES_NOT_CONTAIN",
        ]);
        expect((excludeClient.calls[0] as { authors: Record<string, unknown> }).authors.contains).toBe(
            "DOES_NOT_CONTAIN",
        );
    });

    it("clamps an above-range page size down to 50", async () => {
        const high = makeClient();
        await run(high.client, [...WINDOW, "--actions", "CREATE_PROJECT", "--limit", "500"]);
        expect((high.calls[0] as Record<string, unknown>)["page-size"]).toBe(50);
    });

    it("rejects an unknown action before any wire call", async () => {
        const invalid = makeClient();
        await expect(run(invalid.client, [...WINDOW, "--actions", "NOT_A_REAL_ACTION"])).rejects.toThrow(
            /unknown audit action/i,
        );
        expect(invalid.calls).toHaveLength(0);
    });

    it("rejects a zero/negative --limit before any wire call", async () => {
        const low = makeClient();
        await expect(
            run(low.client, [...WINDOW, "--actions", "CREATE_PROJECT", "--limit", "0"]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(low.calls).toHaveLength(0);
    });

    it("accepts both a bare array and an { entries } response shape", async () => {
        const array = makeClient([{ id: "a-1", action: "CREATE_PROJECT" }]);
        await expect(run(array.client, [...WINDOW, "--actions", "CREATE_PROJECT"])).resolves.toBeDefined();

        const enveloped = makeClient({ entries: [{ id: "a-2", action: "UPDATE_PROJECT" }] });
        await expect(run(enveloped.client, [...WINDOW, "--actions", "UPDATE_PROJECT"])).resolves.toBeDefined();
    });
});
