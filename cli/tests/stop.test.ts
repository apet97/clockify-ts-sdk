import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerStopCommand } from "../src/commands/stop.js";
import type { Services } from "../src/commands/types.js";

/**
 * `clk115 stop` detects a running timer via listInProgress, then stops it through
 * the bound bare route timeEntries.updateForUser ({ end }). The dead /stop suffix
 * route (stopTimer) is gone; "no timer was running" comes from an empty
 * in-progress list, so a real running timer is never silently left ticking.
 */
function makeClient(stub: { inProgress?: unknown[] } = {}): {
    client: ClockifyClient;
    calls: { listInProgress: number; updateForUser: Record<string, unknown>[] };
} {
    const calls = { listInProgress: 0, updateForUser: [] as Record<string, unknown>[] };
    const client = {
        users: { getCurrentUser: async () => ({ id: "user-1" }) },
        timeEntries: {
            listInProgress: async () => {
                calls.listInProgress += 1;
                return stub.inProgress ?? [];
            },
            updateForUser: async (req: Record<string, unknown>) => {
                calls.updateForUser.push(req);
                return { id: "te-1", description: "writing", timeInterval: { duration: "PT1H" }, ...req };
            },
        },
    };
    return { client: client as unknown as ClockifyClient, calls };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerStopCommand(program, services);
    return program;
}

const run = (client: ClockifyClient): Promise<Command> => makeProgram(client).parseAsync(["node", "clk115", "stop"]);
const runJson = (client: ClockifyClient): Promise<Command> =>
    makeProgram(client).parseAsync(["node", "clk115", "--json", "stop"]);

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("stop command", () => {
    it("reports 'no timer was running' without calling updateForUser when nothing is in progress", async () => {
        const { client, calls } = makeClient({ inProgress: [] });
        await run(client);
        expect(calls.listInProgress).toBe(1);
        expect(calls.updateForUser).toHaveLength(0); // no write when no timer is running
    });

    it("stops the user's own running timer via updateForUser (never stopTimer)", async () => {
        const { client, calls } = makeClient({ inProgress: [{ id: "te-1", userId: "user-1" }] });
        await run(client);
        expect(calls.updateForUser).toHaveLength(1);
        expect(calls.updateForUser[0]).toMatchObject({ workspaceId: "ws-1", userId: "user-1" });
        expect(typeof calls.updateForUser[0].end).toBe("string");
    });

    it("ignores an in-progress timer that belongs to another user", async () => {
        const { client, calls } = makeClient({ inProgress: [{ id: "other", userId: "user-2" }] });
        await run(client);
        expect(calls.updateForUser).toHaveLength(0);
    });

    it("emits a timer.stop JSON receipt with changed.updated[0].id", async () => {
        const { client } = makeClient({ inProgress: [{ id: "te-1", userId: "user-1" }] });
        await runJson(client);
        const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
        expect(payload.ok).toBe(true);
        expect(payload.action).toBe("timer.stop");
        expect(payload.ids.entryId).toBe("te-1");
        expect(payload.changed.updated[0].id).toBe("te-1");
    });
});
