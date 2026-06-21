import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";
import type { Registrar, Services } from "../src/commands/types.js";

/**
 * Behavior tests for `clk115 timeoff list` / `clk115 timeoff submit`
 * (`cli/src/commands/timeoff.ts`). Mirrors the mock-client idiom in
 * `crud.test.ts` / `webhooks.test.ts`: a fake `ClockifyClient` whose
 * `timeOff.list` / `timeOff.submit` record the request envelope, a
 * commander program with the global `--json` flag, and `--json`-mode
 * assertions on the emitted rows / receipt.
 */

interface TimeOffCalls {
    lists: Record<string, unknown>[];
    submits: Record<string, unknown>[];
}

/**
 * Build a fake client. `listItems` is what `timeOff.list` returns (the
 * raw wire rows the handler maps); `created` is what `timeOff.submit`
 * returns. `submitError`, when set, makes `submit` reject so the error
 * path can be exercised.
 */
function makeClient(options?: {
    listItems?: unknown[];
    created?: Record<string, unknown>;
    submitError?: Error;
}): { client: ClockifyClient; calls: TimeOffCalls } {
    const calls: TimeOffCalls = { lists: [], submits: [] };
    const listItems = options?.listItems ?? [];
    const created = options?.created ?? {
        id: "to-1",
        userId: "u-9",
        status: { statusType: "PENDING" },
    };
    const submitError = options?.submitError;
    const client = {
        timeOff: {
            list: async (req: Record<string, unknown>) => {
                calls.lists.push(req);
                return listItems;
            },
            submit: async (req: Record<string, unknown>) => {
                calls.submits.push(req);
                if (submitError) {
                    throw submitError;
                }
                return created;
            },
        },
    };
    return { client: client as unknown as ClockifyClient, calls };
}

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

/** The last `console.log` line, parsed as JSON (object receipts). */
function lastPayload(): Record<string, unknown> {
    const line = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
    return JSON.parse(line) as Record<string, unknown>;
}

/** The last `console.log` line, parsed as a JSON array (list rows). */
function lastRows(): Record<string, unknown>[] {
    const line = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
    return JSON.parse(line) as Record<string, unknown>[];
}

describe("timeoff list", () => {
    it("defaults page=1 and clamps the request envelope without optional filters", async () => {
        const { client, calls } = makeClient({ listItems: [] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
        ]);
        // Defaults: page 1, pageSize 50, workspace from config; no filter keys.
        expect(calls.lists[0]).toMatchObject({ workspaceId: "ws-1", page: 1, pageSize: 50 });
        const req = calls.lists[0] ?? {};
        expect(req).not.toHaveProperty("start");
        expect(req).not.toHaveProperty("end");
        expect(req).not.toHaveProperty("statuses");
        expect(req).not.toHaveProperty("users");
        // Empty list still prints a JSON array (not "(no rows)" in --json mode).
        expect(lastRows()).toEqual([]);
    });

    it("clamps --limit above 200 down to 200", async () => {
        const { client, calls } = makeClient({ listItems: [] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
            "--limit",
            "999",
        ]);
        expect(calls.lists[0]?.pageSize).toBe(200);
    });

    it("clamps a zero/negative --limit up to 1", async () => {
        const { client, calls } = makeClient({ listItems: [] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
            "--limit",
            "0",
        ]);
        expect(calls.lists[0]?.pageSize).toBe(1);
    });

    it("threads --page and a within-range --limit through unchanged", async () => {
        const { client, calls } = makeClient({ listItems: [] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
            "--page",
            "3",
            "--limit",
            "25",
        ]);
        expect(calls.lists[0]).toMatchObject({ page: 3, pageSize: 25 });
    });

    it("splits --status / --user into arrays, trimming blanks and empties", async () => {
        const { client, calls } = makeClient({ listItems: [] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
            "--status",
            " APPROVED , PENDING ,, ",
            "--user",
            "u-1, u-2",
        ]);
        expect(calls.lists[0]?.statuses).toEqual(["APPROVED", "PENDING"]);
        expect(calls.lists[0]?.users).toEqual(["u-1", "u-2"]);
    });

    it("passes --start / --end window bounds onto the request", async () => {
        const { client, calls } = makeClient({ listItems: [] });
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
        expect(calls.lists[0]).toMatchObject({ start: "2026-06-01", end: "2026-06-30" });
    });

    it("maps an object-shaped status and a nested period into flat row fields", async () => {
        const { client } = makeClient({
            listItems: [
                {
                    id: "to-7",
                    userId: "u-3",
                    policyId: "pol-2",
                    status: { statusType: "APPROVED" },
                    timeOffPeriod: { period: { start: "2026-07-01", end: "2026-07-03" } },
                    note: "vacation",
                },
            ],
        });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
        ]);
        const rows = lastRows();
        expect(rows[0]).toEqual({
            id: "to-7",
            user: "u-3",
            policy: "pol-2",
            status: "APPROVED",
            start: "2026-07-01",
            end: "2026-07-03",
            note: "vacation",
        });
    });

    it("maps a string-shaped status verbatim", async () => {
        const { client } = makeClient({
            listItems: [{ id: "to-8", userId: "u-4", status: "WITHDRAWN" }],
        });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
        ]);
        expect(lastRows()[0]).toMatchObject({ status: "WITHDRAWN" });
    });

    it("defaults every missing row field (absent status / period / ids) to empty strings", async () => {
        const { client } = makeClient({ listItems: [{}] });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "list",
        ]);
        expect(lastRows()[0]).toEqual({
            id: "",
            user: "",
            policy: "",
            status: "",
            start: "",
            end: "",
            note: "",
        });
    });
});

describe("timeoff submit", () => {
    it("builds the minimal body (note defaults empty, NOT_DEFINED half-day, no days)", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--end",
            "2026-08-05",
        ]);
        const req = calls.submits[0] ?? {};
        expect(req).toMatchObject({ workspaceId: "ws-1", policyId: "pol-1" });
        const body = req.body as {
            note: string;
            timeOffPeriod: {
                isHalfDay: boolean;
                halfDayPeriod: string;
                period: Record<string, unknown>;
            };
        };
        expect(body.note).toBe("");
        expect(body.timeOffPeriod.isHalfDay).toBe(false);
        expect(body.timeOffPeriod.halfDayPeriod).toBe("NOT_DEFINED");
        expect(body.timeOffPeriod.period).toEqual({ start: "2026-08-01", end: "2026-08-05" });
        // --days absent → Number.isFinite(NaN) is false → no `days` key emitted.
        expect(body.timeOffPeriod.period).not.toHaveProperty("days");
    });

    it("includes a finite --days in the period", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--end",
            "2026-08-05",
            "--days",
            "3",
        ]);
        const body = calls.submits[0]?.body as { timeOffPeriod: { period: { days?: number } } };
        expect(body.timeOffPeriod.period.days).toBe(3);
    });

    it("carries --note and a --half-day request with an explicit period", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--end",
            "2026-08-01",
            "--note",
            "doctor",
            "--half-day",
            "--half-day-period",
            "FIRST_HALF",
        ]);
        const body = calls.submits[0]?.body as {
            note: string;
            timeOffPeriod: { isHalfDay: boolean; halfDayPeriod: string };
        };
        expect(body.note).toBe("doctor");
        expect(body.timeOffPeriod.isHalfDay).toBe(true);
        expect(body.timeOffPeriod.halfDayPeriod).toBe("FIRST_HALF");
    });

    it("emits a created receipt with ids, entity, action and changed set", async () => {
        const { client } = makeClient({
            created: { id: "to-99", userId: "u-42", status: { statusType: "APPROVED" } },
        });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--end",
            "2026-08-05",
        ]);
        const payload = lastPayload();
        expect(payload).toMatchObject({
            ok: true,
            action: "timeoff.submit",
            entity: "time_off_request",
            id: "to-99",
            user: "u-42",
            status: "APPROVED",
            ids: { timeOffRequestId: "to-99" },
        });
        expect((payload.changed as { created: unknown[] }).created).toEqual([
            { type: "time_off_request", id: "to-99" },
        ]);
        expect(payload.next).toEqual([
            { command: "clk115 timeoff list --json", reason: "Review request status." },
        ]);
    });

    it("defaults receipt fields to empty strings when the API returns a bare object", async () => {
        const { client } = makeClient({ created: {} });
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "--json",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--end",
            "2026-08-05",
        ]);
        const payload = lastPayload();
        expect(payload).toMatchObject({ id: "", user: "", status: "" });
        expect(payload.ids).toEqual({ timeOffRequestId: "" });
    });

    it("rejects when --policy is missing and never calls the API", async () => {
        const { client, calls } = makeClient();
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "timeoff",
                "submit",
                "--start",
                "2026-08-01",
                "--end",
                "2026-08-05",
            ]),
        ).rejects.toThrow(/--policy/);
        expect(calls.submits).toHaveLength(0);
    });

    it("rejects when --start is missing", async () => {
        const { client, calls } = makeClient();
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "timeoff",
                "submit",
                "--policy",
                "pol-1",
                "--end",
                "2026-08-05",
            ]),
        ).rejects.toThrow(/--start/);
        expect(calls.submits).toHaveLength(0);
    });

    it("rejects when neither --end nor --days is given", async () => {
        const { client, calls } = makeClient();
        await expect(
            makeProgram(registerTimeOffCommand, client).parseAsync([
                "node",
                "clk115",
                "timeoff",
                "submit",
                "--policy",
                "pol-1",
                "--start",
                "2026-08-01",
            ]),
        ).rejects.toThrow(/--end.*--days/);
        expect(calls.submits).toHaveLength(0);
    });

    it("accepts --start + --days without --end (DAYS-unit policies)", async () => {
        const { client, calls } = makeClient();
        await makeProgram(registerTimeOffCommand, client).parseAsync([
            "node",
            "clk115",
            "timeoff",
            "submit",
            "--policy",
            "pol-1",
            "--start",
            "2026-08-01",
            "--days",
            "2",
        ]);
        const body = calls.submits[0]?.body as {
            timeOffPeriod: { period: Record<string, unknown> };
        };
        expect(body.timeOffPeriod.period).toEqual({ start: "2026-08-01", days: 2 });
        expect(body.timeOffPeriod.period).not.toHaveProperty("end");
    });

    it("propagates an SDK error from submit (so the top-level wrapper exits non-zero)", async () => {
        const apiError = Object.assign(new Error("HTTP 403: policy not accessible"), {
            statusCode: 403,
        });
        const { client, calls } = makeClient({ submitError: apiError });
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
                "2026-08-01",
                "--end",
                "2026-08-05",
            ]),
        ).rejects.toThrow(/policy not accessible/);
        // The request was attempted (error came from the SDK, not validation).
        expect(calls.submits).toHaveLength(1);
    });
});
