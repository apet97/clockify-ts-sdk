import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerReportsCommand } from "../src/commands/reports.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";
import { registerTasksCommand } from "../src/commands/tasks.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";

import { makeProgram } from "./read-commands.helpers.js";

describe("list paging flags reject non-positive integers before any wire call", () => {
    // The shared parseIntArg parser now guards --page/--limit on these list
    // commands; a non-numeric or zero/negative value used to flow to the wire
    // as `page: NaN` / `page-size: NaN` (JSON.stringify serializes NaN to null).
    it("scheduling list rejects a non-numeric --limit", async () => {
        let listed = false;
        const client = {
            scheduling: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "scheduling",
                "list",
                "--from",
                "2026-06-01",
                "--to",
                "2026-06-30",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("scheduling list requires --from/--to and promotes bare dates to RFC3339 edges", async () => {
        let captured: Record<string, unknown> | undefined;
        const client = {
            scheduling: {
                list: async (req: Record<string, unknown>) => {
                    captured = req;
                    return [];
                },
            },
        };
        // Missing --from/--to is rejected locally (the endpoint 400s without them).
        await expect(
            makeProgram(registerSchedulingCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "scheduling",
                "list",
            ]),
        ).rejects.toMatchObject({ code: "commander.missingMandatoryOptionValue" });
        expect(captured).toBeUndefined();
        // A bare YYYY-MM-DD is promoted to the day's start/end edge.
        await makeProgram(
            registerSchedulingCommand,
            client as unknown as ClockifyClient,
        ).parseAsync(["node", "clk115", "scheduling", "list", "--from", "2026-06-01", "--to", "2026-06-30"]);
        expect(captured?.start).toBe("2026-06-01T00:00:00Z");
        expect(captured?.end).toBe("2026-06-30T23:59:59Z");
    });

    it("tasks list rejects a zero/negative --page", async () => {
        let listed = false;
        const client = {
            tasks: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerTasksCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "tasks",
                "list",
                "p-1",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("timeoff list rejects a non-numeric --limit", async () => {
        let listed = false;
        const client = {
            timeOff: {
                list: async () => {
                    listed = true;
                    return [];
                },
            },
        };
        await expect(
            makeProgram(registerTimeOffCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "timeoff",
                "list",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("reports detailed rejects a zero/negative --page", async () => {
        let listed = false;
        const client = {
            reports: {
                detailed: async () => {
                    listed = true;
                    return { timeentries: [] };
                },
            },
        };
        await expect(
            makeProgram(registerReportsCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "reports",
                "detailed",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });
});
