import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerReportsCommand } from "../src/commands/reports.js";
import type { Services } from "../src/commands/types.js";

const ID = "a".repeat(24);

interface Captured {
    summary: Record<string, unknown>[];
    detailed: Record<string, unknown>[];
    weekly: Record<string, unknown>[];
    attendance: Record<string, unknown>[];
    projectLists: Record<string, unknown>[];
    clientLists: Record<string, unknown>[];
}

function makeClient(overrides: { projects?: unknown[]; clients?: unknown[] } = {}): {
    client: ClockifyClient;
    captured: Captured;
} {
    const captured: Captured = {
        summary: [],
        detailed: [],
        weekly: [],
        attendance: [],
        projectLists: [],
        clientLists: [],
    };
    const client = {
        projects: {
            list: async (req: Record<string, unknown>) => {
                captured.projectLists.push(req);
                return overrides.projects ?? [];
            },
        },
        clients: {
            list: async (req: Record<string, unknown>) => {
                captured.clientLists.push(req);
                return overrides.clients ?? [];
            },
        },
        reports: {
            summary: async (req: Record<string, unknown>) => {
                captured.summary.push(req);
                return { totals: { duration: 1 } };
            },
            detailed: async (req: Record<string, unknown>) => {
                captured.detailed.push(req);
                return { timeentries: [] };
            },
            weekly: async (req: Record<string, unknown>) => {
                captured.weekly.push(req);
                return { weekly: [] };
            },
            attendance: async (req: Record<string, unknown>) => {
                captured.attendance.push(req);
                return { rows: [] };
            },
        },
    };
    return { client: client as unknown as ClockifyClient, captured };
}

function makeProgram(client: ClockifyClient): Command {
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => client,
    };
    registerReportsCommand(program, services);
    return program;
}

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
    logSpy.mockRestore();
});

describe("reports command", () => {
    it("summary uses the default range, splits groups, and POSTs a summary filter", async () => {
        const { client, captured } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "reports",
            "summary",
            "--groups",
            "project,task",
        ]);
        expect(captured.summary).toHaveLength(1);
        const req = captured.summary[0]!;
        expect(req.workspaceId).toBe("ws-1");
        expect(typeof req.dateRangeStart).toBe("string");
        expect(typeof req.dateRangeEnd).toBe("string");
        expect(JSON.stringify(req.summaryFilter)).toContain("PROJECT");
        expect(JSON.stringify(req.summaryFilter)).toContain("TASK");
    });

    it("summary resolves a project name to an id filter", async () => {
        const { client, captured } = makeClient({ projects: [{ id: "p-9", name: "Website" }] });
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "reports",
            "summary",
            "--project",
            "Website",
        ]);
        expect(captured.projectLists).toHaveLength(1);
        expect(captured.summary[0]!.projects).toMatchObject({
            ids: ["p-9"],
            contains: "CONTAINS",
        });
    });

    it("summary passes a 24-hex project id through without a list lookup", async () => {
        const { client, captured } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "reports",
            "summary",
            "--project",
            ID,
        ]);
        expect(captured.projectLists).toHaveLength(0);
        expect(captured.summary[0]!.projects).toMatchObject({
            ids: [ID],
            contains: "CONTAINS",
        });
    });

    it("rejects an unknown summary group before the SDK call", async () => {
        const { client, captured } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "reports",
                "summary",
                "--groups",
                "PROJECT,NOT_REAL",
            ]),
        ).rejects.toThrow(/unknown summary group/i);
        expect(captured.summary).toHaveLength(0);
    });

    it("rejects an unknown period before any SDK call", async () => {
        const { client, captured } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "reports",
                "summary",
                "--period",
                "fortnight",
            ]),
        ).rejects.toThrow(/Unknown --period/);
        expect(captured.summary).toHaveLength(0);
    });

    it("rejects an invalid --from date", async () => {
        const { client } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "reports",
                "summary",
                "--from",
                "not-a-date",
            ]),
        ).rejects.toThrow(/--from .* is not a valid date/);
    });

    it("detailed clamps page size into the detailed filter", async () => {
        const { client, captured } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "reports",
            "detailed",
            "--page-size",
            "99999",
        ]);
        expect(captured.detailed).toHaveLength(1);
        expect(JSON.stringify(captured.detailed[0]!.detailedFilter)).toContain("1000");
    });

    it("weekly upper-cases report group options", async () => {
        const { client, captured } = makeClient();
        await makeProgram(client).parseAsync([
            "node",
            "clk115",
            "reports",
            "weekly",
            "--group",
            "project",
            "--subgroup",
            "time",
        ]);
        expect(captured.weekly).toHaveLength(1);
        expect(JSON.stringify(captured.weekly[0]!.weeklyFilter)).toContain("PROJECT");
    });

    it("rejects unknown weekly grouping before the SDK call", async () => {
        const { client, captured } = makeClient();
        await expect(
            makeProgram(client).parseAsync([
                "node",
                "clk115",
                "reports",
                "weekly",
                "--group",
                "CLIENT",
            ]),
        ).rejects.toThrow(/weekly group/i);
        expect(captured.weekly).toHaveLength(0);
    });

    it("attendance sends workspaceId, range, and the required (empty) attendanceFilter", async () => {
        const { client, captured } = makeClient();
        await makeProgram(client).parseAsync(["node", "clk115", "reports", "attendance"]);
        expect(captured.attendance).toHaveLength(1);
        expect(captured.attendance[0]).toMatchObject({ workspaceId: "ws-1" });
        expect(captured.attendance[0]!.dateRangeStart).toBeTypeOf("string");
        expect(captured.attendance[0]!.dateRangeEnd).toBeTypeOf("string");
        // attendanceFilter is REQUIRED on the wire (the report 400s "Please provide
        // filters." without it, live-verified); an empty filter is accepted.
        expect(captured.attendance[0]!.attendanceFilter).toEqual({});
    });
});
