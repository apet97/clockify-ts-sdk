import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

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
            "2026-06-01",
            "--end",
            "2026-06-07",
            "--hours-per-day",
            "6",
        ];
        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync(args);
        expect(calls[0]!.body as Record<string, unknown>).toMatchObject({
            start: "2026-06-01",
            end: "2026-06-07",
        });
        expect((calls[0]!.body as Record<string, unknown>).period).toBeUndefined();
        expect(publishes).toHaveLength(0);

        await makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
            ...args,
            "--publish",
        ]);
        expect(publishes).toHaveLength(1);
        expect(publishes[0]).toMatchObject({ start: "2026-06-01", end: "2026-06-07" });
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
            "2026-06-01",
            "--end",
            "2026-06-07",
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
            start: "2026-06-01",
            end: "2026-06-07",
        });
    });
});
