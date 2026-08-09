import { Command, InvalidArgumentError } from "commander";
import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";
import { parseFloatArg, parseIntArg, parseSignedFloatArg } from "../src/commands/helpers.js";
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
    "--user", "u", "--project", "p", "--start", "2026-01-01T00:00:00Z", "--end", "2026-01-02T00:00:00Z",
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

/**
 * Direct unit coverage of the shared strict-parse helpers. `Number.parseInt`/
 * `Number.parseFloat` only consume a *leading* numeric run, so a pasted value
 * with trailing garbage ("1abc") silently truncated to 1 instead of being
 * rejected. `Number(value)` requires the whole trimmed string to be numeric,
 * but widens two other cases that the old parsers rejected (empty string is
 * `0`; "0x10"/"0o17"/"0b101" are numeric-literal syntax) — those must still
 * be rejected, while ordinary decimals (".5", "1e3", " 1 ") must still pass.
 */
describe("parseIntArg/parseFloatArg/parseSignedFloatArg reject trailing garbage", () => {
    it.each([
        ["parseIntArg", parseIntArg, "1abc"],
        ["parseIntArg", parseIntArg, "10abc"],
        ["parseFloatArg", parseFloatArg, "1.5abc"],
        ["parseSignedFloatArg", parseSignedFloatArg, "-4abc"],
    ] as const)("%s(%j) throws instead of truncating to the leading numeric run", (_label, fn, value) => {
        expect(() => fn(value)).toThrow(InvalidArgumentError);
    });

    it.each([
        ["parseIntArg", parseIntArg, "", ""],
        ["parseIntArg", parseIntArg, "  ", "whitespace-only"],
        ["parseFloatArg", parseFloatArg, "", ""],
        ["parseSignedFloatArg", parseSignedFloatArg, "", "empty string must not silently parse as 0"],
        ["parseSignedFloatArg", parseSignedFloatArg, "0x10", "hex literal"],
        ["parseIntArg", parseIntArg, "0o17", "octal literal"],
        ["parseFloatArg", parseFloatArg, "0b101", "binary literal"],
    ] as const)("%s(%j) rejects %s", (_label, fn, value, _reason) => {
        expect(() => fn(value)).toThrow(InvalidArgumentError);
    });

    it("still accepts the decimal forms Number.parseFloat accepted before the fix", () => {
        expect(parseFloatArg(".5")).toBe(0.5);
        expect(parseFloatArg("1e3")).toBe(1000);
        expect(parseIntArg(" 1 ")).toBe(1);
        expect(parseSignedFloatArg("-4")).toBe(-4);
        expect(parseSignedFloatArg("0")).toBe(0);
    });
});
