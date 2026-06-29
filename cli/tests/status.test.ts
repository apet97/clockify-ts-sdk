import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerStatusCommand } from "../src/commands/status.js";
import type { Services } from "../src/commands/types.js";
import type { CliConfig } from "../src/config.js";

function makeProgram(client: ClockifyClient, config: CliConfig): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => config,
        buildClient: () => client,
    };
    registerStatusCommand(program, services);
    return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

function lastJson(): Record<string, unknown> {
    return JSON.parse(logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string);
}

describe("status command", () => {
    it("without a workspace, lists reachable workspaces and hints how to choose one", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1", email: "me@x.io" }) },
            workspaces: {
                list: async () => [
                    { id: "ws-A", name: "Acme" },
                    { id: "ws-B", name: "Beta" },
                ],
            },
            timeEntries: {
                listInProgress: async () => {
                    throw new Error("must not be called without workspace");
                },
            },
        };
        await makeProgram(client as unknown as ClockifyClient, { apiKey: "k" }).parseAsync([
            "node",
            "clk115",
            "--json",
            "status",
        ]);
        const out = lastJson();
        expect(out.workspaceId).toBe("(not set)");
        expect(out.availableWorkspaces).toEqual([
            { id: "ws-A", name: "Acme" },
            { id: "ws-B", name: "Beta" },
        ]);
        expect(String(out.hint)).toMatch(/CLOCKIFY_WORKSPACE_ID/);
    });

    it("shows the caller's own running entry from a timeEntries envelope", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1", email: "me@x.io", name: "Me" }) },
            workspaces: { list: async () => [] },
            timeEntries: {
                listInProgress: async () => ({
                    timeEntries: [
                        { userId: "u-other", description: "theirs" },
                        {
                            id: "te-1",
                            userId: "u-1",
                            description: "mine",
                            projectId: "p-1",
                            timeInterval: {
                                start: "2026-06-18T09:00:00Z",
                                duration: "PT1H30M",
                            },
                        },
                    ],
                }),
            },
        };
        await makeProgram(client as unknown as ClockifyClient, {
            apiKey: "k",
            workspaceId: "ws-1",
        }).parseAsync(["node", "clk115", "--json", "status"]);
        const running = lastJson().runningEntry as Record<string, unknown>;
        expect(running.description).toBe("mine");
        expect(running.projectId).toBe("p-1");
        expect(running.elapsed).toBe("1h30m");
    });

    it("reports no timer when none of the in-progress entries belong to the caller", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1", email: "me@x.io", name: "Me" }) },
            workspaces: { list: async () => [] },
            timeEntries: {
                listInProgress: async () => [{ userId: "u-other", description: "theirs" }],
            },
        };
        await makeProgram(client as unknown as ClockifyClient, {
            apiKey: "k",
            workspaceId: "ws-1",
        }).parseAsync(["node", "clk115", "--json", "status"]);
        expect(lastJson().runningEntry).toBe("(no timer running)");
    });

    it("normalizes a data envelope and computes elapsed from start when duration is absent", async () => {
        const startIso = "2026-06-18T10:00:00Z";
        const nowMs = Date.parse(startIso) + 90 * 60 * 1000; // 1h30m after start
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(nowMs);
        try {
            const client = {
                users: { getCurrentUser: async () => ({ id: "u-1" }) },
                workspaces: { list: async () => [] },
                timeEntries: {
                    listInProgress: async () => ({
                        data: [
                            {
                                id: "te-2",
                                userId: "u-1",
                                description: "open",
                                timeInterval: { start: startIso },
                            },
                        ],
                    }),
                },
            };
            await makeProgram(client as unknown as ClockifyClient, {
                apiKey: "k",
                workspaceId: "ws-1",
            }).parseAsync(["node", "clk115", "--json", "status"]);
            const running = lastJson().runningEntry as Record<string, unknown>;
            expect(running.id).toBe("te-2");
            expect(running.elapsed).toBe("1h30m");
            expect(lastJson().email).toBe("");
        } finally {
            nowSpy.mockRestore();
        }
    });

    it("falls back to 0s for a running entry with no duration and no parseable start", async () => {
        const client = {
            users: { getCurrentUser: async () => ({ id: "u-1" }) },
            workspaces: { list: async () => [] },
            timeEntries: {
                listInProgress: async () => ({
                    data: [
                        {
                            id: "te-3",
                            userId: "u-1",
                            description: "open",
                            timeInterval: {},
                        },
                    ],
                }),
            },
        };
        await makeProgram(client as unknown as ClockifyClient, {
            apiKey: "k",
            workspaceId: "ws-1",
        }).parseAsync(["node", "clk115", "--json", "status"]);
        const running = lastJson().runningEntry as Record<string, unknown>;
        expect(running.id).toBe("te-3");
        expect(running.elapsed).toBe("0s");
    });
});
