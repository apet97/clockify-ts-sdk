import { describe, expect, it, vi } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

const CREATE_START = "2026-06-01T09:00:00.123456+02:30";
const CREATE_END = "2026-06-07T17:00:00.5+02:30";

describe("scheduling read and create commands", () => {
    it("list maps period.start/end into flat start/end columns", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [
                        {
                            id: "a-1",
                            userId: "u-1",
                            projectId: "p-1",
                            hoursPerDay: 6,
                            period: { start: "2026-06-01", end: "2026-06-07" },
                            billable: true,
                        },
                        {},
                    ];
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "scheduling",
            "list",
            "--from",
            "2026-06-01",
            "--to",
            "2026-06-07",
            "--limit",
            "999",
            "--name",
            "Design",
        ]);
        expect(calls[0]).toMatchObject({ workspaceId: "ws-1", "page-size": 200, name: "Design" });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({
            id: "a-1",
            user: "u-1",
            start: "2026-06-01",
            end: "2026-06-07",
            billable: true,
        });
        expect(rows[1]).toMatchObject({
            id: "",
            user: "",
            project: "",
            task: "",
            hoursPerDay: 0,
            start: "",
            end: "",
            billable: false,
            note: "",
        });
    });

    it("list omits optional scheduling filters when they are not supplied", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [];
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "scheduling",
            "list",
            "--from",
            "2026-06-01",
            "--to",
            "2026-06-30",
        ]);
        expect(calls[0]).toMatchObject({ "page-size": 25 });
        expect(calls[0]).not.toHaveProperty("name");
    });

    it("create defaults to draft and only publishes with --publish", async () => {
        const calls: Record<string, unknown>[] = [];
        const publishes: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                // Live Clockify has no single-assignment create; the command uses the
                // recurring endpoint (one-off when recurringAssignment is omitted) and
                // --publish maps to the separate range-based publish op.
                createRecurring: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    const body = req.body as Record<string, unknown>;
                    // createRecurring returns an ARRAY (one entry per occurrence).
                    return [
                        {
                            id: "a-9",
                            userId: "u-1",
                            projectId: "p-1",
                            hoursPerDay: 6,
                            start: body.start,
                            end: body.end,
                        },
                    ];
                },
                publish: async (req: Record<string, unknown>) => {
                    publishes.push(req);
                },
            },
        };
        const args = [
            "node",
            "clk115",
            "scheduling",
            "create",
            "--user",
            "u-1",
            "--project",
            "p-1",
            "--start",
            CREATE_START,
            "--end",
            CREATE_END,
            "--hours-per-day",
            "6",
        ];
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync(args);
        expect(calls[0]!.body as Record<string, unknown>).toMatchObject({
            start: CREATE_START,
            end: CREATE_END,
        });
        expect((calls[0]!.body as Record<string, unknown>).period).toBeUndefined();
        expect(publishes).toHaveLength(0);

        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            ...args,
            "--publish",
        ]);
        expect(publishes).toEqual([
            {
                workspaceId: "ws-1",
                body: {
                    start: CREATE_START,
                    end: CREATE_END,
                    userFilter: { contains: "CONTAINS", ids: ["u-1"] },
                },
            },
        ]);
    });

    it("reports the created draft and recovery when publishing fails", async () => {
        const creates: Record<string, unknown>[] = [];
        const publishes: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                createRecurring: async (req: Record<string, unknown>) => {
                    creates.push(req);
                    return [{ id: "a-partial", userId: "u-1", projectId: "p-1" }];
                },
                publish: async (req: Record<string, unknown>) => {
                    publishes.push(req);
                    throw new Error("permission denied");
                },
            },
        };

        await expect(
            makeProgram(
                registerSchedulingCommand,
                client as unknown as ClockifyClient,
            ).parseAsync([
                "node",
                "clk115",
                "--json",
                "scheduling",
                "create",
                "--user",
                "u-1",
                "--project",
                "p-1",
                "--start",
                CREATE_START,
                "--end",
                CREATE_END,
                "--hours-per-day",
                "6",
                "--publish",
            ]),
        ).rejects.toThrow(/after reporting the error response/);

        expect(creates).toHaveLength(1);
        expect(publishes).toHaveLength(1);
        expect(lastJson()).toMatchObject({
            id: "a-partial",
            published: false,
            warningCode: "publish_failed",
            publishRequest: {
                start: CREATE_START,
                end: CREATE_END,
                userFilter: { contains: "CONTAINS", ids: ["u-1"] },
            },
            changed: { created: [{ type: "scheduling_assignment", id: "a-partial" }] },
            warnings: [expect.stringMatching(/created.*publishing.*failed.*permission denied/i)],
            next: [
                {
                    command:
                        "clk115 api PUT /workspaces/{workspaceId}/scheduling/assignments/publish --body -",
                    reason: expect.stringMatching(/pipe.*stored.*request/i),
                },
            ],
        });
    });

    it("prints partial-publish recovery in the default table output", async () => {
        const output: string[] = [];
        const log = vi.spyOn(console, "log").mockImplementation((value?: unknown) => {
            output.push(String(value ?? ""));
        });
        const client = {
            scheduling: {
                createRecurring: async () => [{ id: "a-partial" }],
                publish: async () => {
                    throw new Error("permission denied");
                },
            },
        };
        try {
            await expect(
                makeProgram(
                    registerSchedulingCommand,
                    client as unknown as ClockifyClient,
                ).parseAsync([
                    "node",
                    "clk115",
                    "scheduling",
                    "create",
                    "--user",
                    "u-1",
                    "--project",
                    "p-1",
                    "--start",
                    CREATE_START,
                    "--end",
                    CREATE_END,
                    "--hours-per-day",
                    "6",
                    "--publish",
                ]),
            ).rejects.toThrow(/after reporting the error response/);
        } finally {
            log.mockRestore();
        }

        const text = output.join("\n");
        expect(text).toContain(
            "clk115 api PUT /workspaces/{workspaceId}/scheduling/assignments/publish --body -",
        );
        expect(text).toMatch(/pipe.*stored.*publishRequest/i);
    });

    it("create includes every optional scheduling field when supplied", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                createRecurring: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    // createRecurring returns an ARRAY (one entry per occurrence).
                    return [{ id: "a-10", ...(req.body as Record<string, unknown>) }];
                },
                publish: async () => {
                    /* --publish maps to the separate range-based publish op */
                },
            },
        };
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "scheduling",
            "create",
            "--user",
            "u-1",
            "--project",
            "p-1",
            "--start",
            CREATE_START,
            "--end",
            CREATE_END,
            "--hours-per-day",
            "8",
            "--task",
            "tk-1",
            "--note",
            "Plan",
            "--billable",
            "--include-non-working-days",
            "--publish",
        ]);
        expect(calls[0]!.body).toMatchObject({
            taskId: "tk-1",
            note: "Plan",
            billable: true,
            includeNonWorkingDays: true,
            start: CREATE_START,
            end: CREATE_END,
        });
    });

    it.each([
        ["start", "2026-06-01", CREATE_END],
        ["end", CREATE_START, "2026-02-30T17:00:00Z"],
    ])("rejects an invalid RFC3339 --%s before create", async (_flag, start, end) => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            scheduling: {
                createRecurring: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "scheduling",
                "create",
                "--user",
                "u-1",
                "--project",
                "p-1",
                "--start",
                start,
                "--end",
                end,
                "--hours-per-day",
                "8",
            ]),
        ).rejects.toThrow(/RFC3339/);
        expect(calls).toHaveLength(0);
    });
});
