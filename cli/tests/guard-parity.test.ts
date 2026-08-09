import { spawnSync } from "node:child_process";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerClientsCommand } from "../src/commands/clients.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";
import type { Registrar, Services } from "../src/commands/types.js";
import { registerUsersCommand } from "../src/commands/users.js";
import { parseDuration } from "../src/duration.js";

/**
 * E1 guard-parity behavior tests (2026-08-09 audit): every row asserts the
 * command errors locally (or emits an actionable receipt) and that no client
 * call was made when a guard fires. Mirrors the mock-client idiom in
 * `crud.test.ts` / `timeoff.test.ts`.
 */

function makeProgram(register: Registrar, client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => Promise.resolve(client),
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

function lastJson(): Record<string, unknown> {
    return JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string,
    ) as Record<string, unknown>;
}

describe("CLI-3 — users update-profile needs a change", () => {
    it("rejects a zero-flag invocation instead of sending an empty PATCH", async () => {
        const update = vi.fn();
        const client = { memberProfiles: { update } } as unknown as ClockifyClient;
        await expect(
            makeProgram(registerUsersCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "users",
                "update-profile",
                "u-1",
            ]),
        ).rejects.toThrow(/needs a change/i);
        expect(update).not.toHaveBeenCalled();
    });
});

describe("CLI-4 — timeoff list date boundaries", () => {
    function makeClient() {
        const lists: Record<string, unknown>[] = [];
        const client = {
            timeOff: {
                list: async (req: Record<string, unknown>) => {
                    lists.push(req);
                    return { count: 0, requests: [] };
                },
            },
        } as unknown as ClockifyClient;
        return { client, lists };
    }

    it("promotes bare dates through promoteDateBoundary like entries does", async () => {
        const { client, lists } = makeClient();
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        expect(lists).toHaveLength(1);
        expect(lists[0]).toMatchObject({
            start: "2026-06-01T00:00:00Z",
            end: "2026-06-30T23:59:59Z",
        });
    });

    it("rejects an unparseable --start locally, before any client call", async () => {
        const { client, lists } = makeClient();
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "timeoff",
                "list",
                "--start",
                "not-a-date",
            ]),
        ).rejects.toThrow(/start/i);
        expect(lists).toHaveLength(0);
    });
});

describe("CLI-5 — timeoff submit --end and --days are mutually exclusive", () => {
    it("rejects a submit that provides both, before any client call", async () => {
        const submit = vi.fn();
        const client = { timeOff: { submit } } as unknown as ClockifyClient;
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "timeoff",
                "submit",
                "--policy",
                "pol-1",
                "--start",
                "2026-06-01",
                "--end",
                "2026-06-05T00:00:00Z",
                "--days",
                "3",
            ]),
        ).rejects.toThrow(/--end.*--days|--days.*--end/i);
        expect(submit).not.toHaveBeenCalled();
    });
});

describe("CLI-6 — balance-assignment delete rejects the empty note it documents", () => {
    it("rejects --note '' locally, before any client call", async () => {
        const deleteBalanceAssignment = vi.fn();
        const client = {
            balanceAssignment: { deleteBalanceAssignment },
        } as unknown as ClockifyClient;
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "--json",
                "timeoff",
                "balance-assignment",
                "delete",
                "--id",
                "ba-1",
                "--user",
                "u-1",
                "--policy",
                "pol-1",
                "--note",
                "   ",
            ]),
        ).rejects.toThrow(/note/i);
        expect(deleteBalanceAssignment).not.toHaveBeenCalled();
    });
});

describe("CLI-7 — parseDuration rejects a zero duration", () => {
    it.each(["0s", "0", "PT0S", "0h0m"])("rejects %s", (input) => {
        expect(() => parseDuration(input)).toThrow(/positive|zero/i);
    });

    it("still accepts ordinary positive durations", () => {
        expect(parseDuration("30s")).toBe(30);
        expect(parseDuration("1h30m")).toBe(5400);
    });
});

describe("CLI-8 — receipt next commands must run as pasted", () => {
    it("scheduling create's next list command carries the required --from/--to", async () => {
        const client = {
            scheduling: {
                createRecurring: async () => [
                    {
                        id: "sa-1",
                        userId: "u-1",
                        projectId: "p-1",
                        hoursPerDay: 8,
                        period: { start: "2026-06-01T00:00:00Z", end: "2026-06-05T00:00:00Z" },
                    },
                ],
            },
        } as unknown as ClockifyClient;
        await makeProgram(registerSchedulingCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "scheduling",
            "create",
            "--user",
            "u-1",
            "--project",
            "p-1",
            "--hours-per-day",
            "8",
            "--start",
            "2026-06-01T00:00:00Z",
            "--end",
            "2026-06-05T00:00:00Z",
        ]);
        const receipt = lastJson();
        const next = receipt.next as Array<{ command: string }>;
        const listNext = next.find((entry) => entry.command.includes("scheduling list"));
        expect(listNext).toBeDefined();
        // `scheduling list` exits 2 without --from/--to, so the suggested
        // command must include both.
        expect(listNext!.command).toMatch(/--from \S+/);
        expect(listNext!.command).toMatch(/--to \S+/);
    });

    it("clients create's next command preserves API values when pasted into a shell", async () => {
        const name = "Acme $(printf SHELL_EXPANDED) `printf BACKTICK` '$HOME'";
        const id = "c-1; printf ID_EXPANDED";
        const client = {
            clients: {
                create: async () => ({ id, name }),
            },
        } as unknown as ClockifyClient;
        await makeProgram(registerClientsCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "clients",
            "create",
            name,
        ]);
        const receipt = lastJson();
        const next = receipt.next as Array<{ command: string }>;
        const command = next[0]?.command ?? "";
        expect(command).not.toContain("<name>");

        const result = spawnSync(
            "/bin/sh",
            [
                "-c",
                `clk115() {\n  printf '%s\\n' "$@"\n}\n${command}`,
            ],
            {
                encoding: "utf8",
                env: { ...process.env, HOME: "SHOULD_NOT_EXPAND" },
            },
        );
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout.trimEnd().split("\n")).toEqual([
            "projects",
            "create",
            `Project for ${name}`,
            "--client",
            id,
        ]);
    });
});
