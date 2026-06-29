import { describe, expect, it } from "vitest";

import type { ClockifyClient } from "../src/client.js";
import { registerExpensesCommand } from "../src/commands/expenses.js";

import { lastJson, makeProgram } from "./read-commands.helpers.js";

describe("expenses list branch coverage", () => {
    it("list handles the doubly nested expense envelope and scalar category fallback", async () => {
        const calls: Record<string, unknown>[] = [];
        const client = {
            expenses: {
                list: async (req: Record<string, unknown>) => {
                    calls.push(req);
                    return {
                        expenses: {
                            expenses: [
                                {
                                    id: "e-1",
                                    date: "2026-06-01",
                                    category: { name: "Travel" },
                                    quantity: 12,
                                    currency: "USD",
                                    billable: true,
                                },
                                { id: "e-2", category: "Meals", amount: 34 },
                                {},
                                // Both a computed total and a per-unit quantity:
                                // the row must show the total (3 * 50 = 150), not 3.
                                {
                                    id: "e-4",
                                    category: "Supplies",
                                    quantity: 3,
                                    total: 150,
                                },
                            ],
                        },
                    };
                },
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
            "--limit",
            "999",
        ]);
        expect(calls[0]).toMatchObject({
            "page-size": 200,
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ category: "Travel", amount: 12, billable: true });
        expect(rows[1]).toMatchObject({ category: "Meals", amount: 34 });
        expect(rows[2]).toMatchObject({ id: "", category: "", amount: 0, billable: false });
        // total (150) wins over the per-unit quantity (3).
        expect(rows[3]).toMatchObject({ id: "e-4", category: "Supplies", amount: 150 });
    });

    it("list applies --start/--end as a client-side date-range filter on the fetched page", async () => {
        const client = {
            expenses: {
                list: async () => ({
                    expenses: {
                        expenses: [
                            { id: "in-1", date: "2026-06-15T00:00:00Z", category: "A" },
                            { id: "lo-1", date: "2026-05-31T00:00:00Z", category: "B" },
                            { id: "hi-1", date: "2026-07-01T00:00:00Z", category: "C" },
                            { id: "no-date", category: "D" },
                        ],
                    },
                }),
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
            "--start",
            "2026-06-01",
            "--end",
            "2026-06-30",
        ]);
        const rows = lastJson() as Array<Record<string, unknown>>;
        // Only the in-range dated row survives; out-of-range and undated rows drop.
        expect(rows.map((r) => r.id)).toEqual(["in-1"]);
    });

    it("list handles a direct expenses array envelope", async () => {
        const client = {
            expenses: {
                list: async () => ({ expenses: [{ id: "e-3", category: null }] }),
            },
        };
        await makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
            "node",
            "clk115",
            "--json",
            "expenses",
            "list",
        ]);
        expect((lastJson() as Array<Record<string, unknown>>)[0]).toMatchObject({
            id: "e-3",
            category: "",
        });
    });

    it("rejects a non-numeric --limit before any wire call", async () => {
        // Number.parseInt("abc", 10) is NaN, which used to flow to the wire as
        // `page-size: Math.max(1, NaN) === NaN`. The shared parseIntArg parser
        // now raises a commander usage error so the bad value never lists.
        let listed = false;
        const client = {
            expenses: {
                list: async () => {
                    listed = true;
                    return { expenses: [] };
                },
            },
        };
        await expect(
            makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "expenses",
                "list",
                "--limit",
                "abc",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });

    it("rejects a zero/negative --page before any wire call", async () => {
        let listed = false;
        const client = {
            expenses: {
                list: async () => {
                    listed = true;
                    return { expenses: [] };
                },
            },
        };
        await expect(
            makeProgram(registerExpensesCommand, client as unknown as ClockifyClient).parseAsync([
                "node",
                "clk115",
                "expenses",
                "list",
                "--page",
                "0",
            ]),
        ).rejects.toMatchObject({ code: "commander.invalidArgument" });
        expect(listed).toBe(false);
    });
});
