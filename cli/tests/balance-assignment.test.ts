import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";
import type { Services } from "../src/commands/types.js";

/**
 * Behavior tests for `clk115 timeoff balance-assignment …`
 * (`cli/src/commands/balanceAssignment.ts`). Mirrors the mock-client idiom
 * in `timeoff.test.ts`: a fake `ClockifyClient` that records each request
 * envelope, plus `--json`-mode assertions on the emitted rows / receipt.
 */

interface BalanceCalls {
    lists: Record<string, unknown>[];
    creates: Record<string, unknown>[];
    updates: Record<string, unknown>[];
    deletes: Record<string, unknown>[];
}

function makeClient(assignments: unknown[] = []): {
    client: ClockifyClient;
    calls: BalanceCalls;
} {
    const calls: BalanceCalls = { lists: [], creates: [], updates: [], deletes: [] };
    const client = {
        balanceAssignment: {
            getBalanceAssignmentsForUserAndPolicy: async (req: Record<string, unknown>) => {
                calls.lists.push(req);
                return assignments;
            },
            createBalanceAssignment: async (req: Record<string, unknown>) => {
                calls.creates.push(req);
            },
            updateBalanceAssignment: async (req: Record<string, unknown>) => {
                calls.updates.push(req);
            },
            deleteBalanceAssignment: async (req: Record<string, unknown>) => {
                calls.deletes.push(req);
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
        buildClient: () => Promise.resolve(client),
    };
    registerTimeOffCommand(program, services);
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

function lastRows(): Record<string, unknown>[] {
    const line = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
    return JSON.parse(line) as Record<string, unknown>[];
}

const base = ["node", "clk115", "--json", "timeoff", "balance-assignment"];

describe("timeoff balance-assignment list", () => {
    it("projects the assignment rows", async () => {
        const { client, calls } = makeClient([
            { id: "ba-1", userId: "u-1", policyId: "p-1", balance: 0, accrued: 3 },
        ]);
        await makeProgram(client).parseAsync([
            ...base,
            "list",
            "--user",
            "u-1",
            "--policy",
            "p-1",
        ]);
        expect(calls.lists[0]).toEqual({ workspaceId: "ws-1", userId: "u-1", policyId: "p-1" });
        expect(lastRows()).toEqual([
            { id: "ba-1", user: "u-1", policy: "p-1", balance: 0, accrued: 3 },
        ]);
    });
});

describe("timeoff balance-assignment create", () => {
    it("splits --user into userIds and omits an unset date range", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "create",
            "--policy",
            "p-1",
            "--user",
            "u-1, u-2",
            "--balance",
            "2.5",
        ]);
        expect(calls.creates[0]).toEqual({
            workspaceId: "ws-1",
            body: { balance: 2.5, policyId: "p-1", userIds: ["u-1", "u-2"] },
        });
        const receipt = lastPayload();
        expect(receipt.action).toBe("timeoff.balance-assignment.create");
        // The API returns no ID, so the receipt must warn instead of inventing one.
        expect(receipt.changed).toEqual({});
        expect(receipt.warnings).toHaveLength(1);
    });

    it("sends the date range when either window flag is set", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "create",
            "--policy",
            "p-1",
            "--user",
            "u-1",
            "--balance",
            "1",
            "--start",
            "2026-01-01",
            "--note",
            "onboarding",
        ]);
        expect(calls.creates[0]?.body).toEqual({
            balance: 1,
            policyId: "p-1",
            userIds: ["u-1"],
            note: "onboarding",
            dateRange: { start: "2026-01-01" },
        });
    });

    it("rejects an impossible balance-window date before creating", async () => {
        const { client, calls } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                ...base,
                "create",
                "--policy",
                "p-1",
                "--user",
                "u-1",
                "--balance",
                "1",
                "--start",
                "2026-02-30",
            ]),
        ).rejects.toThrow(/--start .*calendar date/u);
        expect(calls.creates).toEqual([]);
    });

    it("rejects a non-numeric --balance at parse time", async () => {
        const { client } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                ...base,
                "create",
                "--policy",
                "p-1",
                "--user",
                "u-1",
                "--balance",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
    });
});

describe("timeoff balance-assignment update", () => {
    it("accepts a negative --change as a delta", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "update",
            "--id",
            "ba-1",
            "--user",
            "u-1",
            "--policy",
            "p-1",
            "--change",
            "-4",
        ]);
        expect(calls.updates[0]).toEqual({
            workspaceId: "ws-1",
            userId: "u-1",
            policyId: "p-1",
            balanceAssignmentId: "ba-1",
            body: { balanceChange: -4 },
        });
        expect(lastPayload().changed).toEqual({
            updated: [{ type: "balance_assignment", id: "ba-1" }],
        });
    });
});

describe("timeoff balance-assignment delete", () => {
    it("sends the required note in the request body", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "delete",
            "--id",
            "ba-1",
            "--user",
            "u-1",
            "--policy",
            "p-1",
            "--note",
            "revoked",
        ]);
        expect(calls.deletes[0]).toEqual({
            workspaceId: "ws-1",
            userId: "u-1",
            policyId: "p-1",
            balanceAssignmentId: "ba-1",
            body: { note: "revoked" },
        });
        expect(lastPayload().changed).toEqual({
            deleted: [{ type: "balance_assignment", id: "ba-1" }],
        });
    });

    it("requires --note", async () => {
        const { client } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                ...base,
                "delete",
                "--id",
                "ba-1",
                "--user",
                "u-1",
                "--policy",
                "p-1",
            ]),
        ).rejects.toMatchObject({ code: "commander.missingMandatoryOptionValue" });
    });
});
