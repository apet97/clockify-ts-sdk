import { Command } from "commander";
import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";
import { registerSchedulingCommand } from "../src/commands/scheduling.js";
import { registerTimeOffCommand } from "../src/commands/timeoff.js";
import type { Registrar, Services } from "../src/commands/types.js";

/**
 * The numeric write flags `--amount` (expenses), `--hours-per-day` (scheduling)
 * and `--days` (timeoff) are parsed with the shared parseFloatArg / parseIntArg
 * guards (cli/src/commands/helpers.ts). A non-numeric or non-positive value must
 * raise a clean commander usage error (exit code 2) at PARSE time — BEFORE
 * buildClient is ever called — instead of serializing `null`/`NaN` onto the wire
 * for an opaque 400 (and, for `--days`, before the misleading
 * "provide --end or --days" guard could fire on a value the user did pass).
 */
function makeProgram(register: Registrar): { program: Command; built: boolean[] } {
    const built: boolean[] = [];
    const program = new Command();
    program.exitOverride();
    program.option("--json", "Emit JSON.", false);
    const services: Services = {
        loadConfig: () => ({ apiKey: "k", workspaceId: "ws-1" }),
        buildClient: () => {
            built.push(true);
            return Promise.resolve({} as ClockifyClient);
        },
    };
    register(program, services);
    return { program, built };
}

const EXPENSES_BASE = [
    "expenses", "update", "exp-1",
    "--category", "c", "--date", "2026-01-01", "--user", "u",
];
const SCHEDULING_BASE = [
    "scheduling", "create",
    "--user", "u", "--project", "p", "--start", "2026-01-01", "--end", "2026-01-02",
];
const TIMEOFF_BASE = ["timeoff", "submit", "--policy", "p", "--start", "2026-01-01"];

describe("numeric write flags reject bad input at parse time, before any wire call", () => {
    it.each([
        ["expenses --amount abc", registerExpensesCommand, [...EXPENSES_BASE, "--amount", "abc"], /positive number/],
        ["expenses --amount 0", registerExpensesCommand, [...EXPENSES_BASE, "--amount", "0"], /positive number/],
        ["scheduling --hours-per-day abc", registerSchedulingCommand, [...SCHEDULING_BASE, "--hours-per-day", "abc"], /positive number/],
        ["scheduling --hours-per-day -3", registerSchedulingCommand, [...SCHEDULING_BASE, "--hours-per-day", "-3"], /positive number/],
        ["timeoff --days abc", registerTimeOffCommand, [...TIMEOFF_BASE, "--days", "abc"], /positive integer/],
        ["timeoff --days 0", registerTimeOffCommand, [...TIMEOFF_BASE, "--days", "0"], /positive integer/],
    ])("rejects %s with a clean usage error and never builds a client", async (_label, register, argv, messageRe) => {
        const { program, built } = makeProgram(register);
        await expect(program.parseAsync(["node", "clk115", ...argv])).rejects.toMatchObject({
            code: "commander.invalidArgument",
            message: expect.stringMatching(messageRe),
        });
        expect(built).toHaveLength(0);
    });
});
