import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerApprovalsCommand } from "../src/commands/approvals.js";
import type { Services } from "../src/commands/types.js";

/**
 * Behavior tests for `clk115 approvals submit-with-type` /
 * `submit-for-user-with-type` (`cli/src/commands/approvals.ts`). Mirrors the
 * mock-client idiom in `timeoff.test.ts`.
 */

interface ApprovalCalls {
    self: Record<string, unknown>[];
    forUser: Record<string, unknown>[];
}

const created = {
    id: "ar-1",
    owner: { userId: "u-9" },
    type: "TIMESHEET",
    status: { state: "PENDING" },
};

function makeClient(): { client: ClockifyClient; calls: ApprovalCalls } {
    const calls: ApprovalCalls = { self: [], forUser: [] };
    const client = {
        approvals: {
            submitWithType: async (req: Record<string, unknown>) => {
                calls.self.push(req);
                return created;
            },
            submitForUserWithType: async (req: Record<string, unknown>) => {
                calls.forUser.push(req);
                return created;
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
    registerApprovalsCommand(program, services);
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

const base = ["node", "clk115", "--json", "approvals"];

describe("approvals submit-with-type", () => {
    it("sends the type as the approvalRequestId path position", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "submit-with-type",
            "--type",
            "timesheet",
            "--period-start",
            "2026-08-03T00:00:00Z",
        ]);
        expect(calls.self[0]).toEqual({
            workspaceId: "ws-1",
            approvalRequestId: "TIMESHEET",
            body: { periodStart: "2026-08-03T00:00:00Z" },
        });
        expect(lastPayload()).toMatchObject({ action: "approvals.submit-with-type", id: "ar-1" });
    });

    it("adds --period when given and rejects an unknown period", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "submit-with-type",
            "--type",
            "EXPENSE",
            "--period-start",
            "2026-08-03T00:00:00Z",
            "--period",
            "weekly",
        ]);
        expect(calls.self[0]?.body).toEqual({
            periodStart: "2026-08-03T00:00:00Z",
            period: "WEEKLY",
        });

        await expect(
            makeProgram(makeClient().client).parseAsync([
                ...base,
                "submit-with-type",
                "--type",
                "EXPENSE",
                "--period-start",
                "2026-08-03T00:00:00Z",
                "--period",
                "DAILY",
            ]),
        ).rejects.toThrow(/--period must be one of/u);
    });

    it("rejects a type the self variant does not accept", async () => {
        const { client } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                ...base,
                "submit-with-type",
                "--type",
                "TIMESHEET_AND_EXPENSE",
                "--period-start",
                "2026-08-03T00:00:00Z",
            ]),
        ).rejects.toThrow(/--type must be one of: TIMESHEET, EXPENSE/u);
    });
});

describe("approvals submit-for-user-with-type", () => {
    it("accepts the combined type and sends userId as a path parameter", async () => {
        const { client, calls } = makeClient();
        await makeProgram(client).parseAsync([
            ...base,
            "submit-for-user-with-type",
            "--user",
            "u-9",
            "--type",
            "TIMESHEET_AND_EXPENSE",
            "--period-start",
            "2026-08-03T00:00:00Z",
        ]);
        expect(calls.forUser[0]).toEqual({
            workspaceId: "ws-1",
            userId: "u-9",
            type: "TIMESHEET_AND_EXPENSE",
            body: { periodStart: "2026-08-03T00:00:00Z" },
        });
        expect(lastPayload()).toMatchObject({
            action: "approvals.submit-for-user-with-type",
            user: "u-9",
        });
    });
});
