import { describe, expect, it, vi } from "vitest";

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
            "page-size": 50,
        });
        const rows = lastJson() as Array<Record<string, unknown>>;
        expect(rows[0]).toMatchObject({ category: "Travel", amount: 12, billable: true });
        expect(rows[1]).toMatchObject({ category: "Meals", amount: 34 });
        expect(rows[2]).toMatchObject({ id: "", category: "", amount: 0, billable: false });
        // total (150) wins over the per-unit quantity (3).
        expect(rows[3]).toMatchObject({ id: "e-4", category: "Supplies", amount: 150 });
    });

    it("list applies date bounds across pages, honors total --limit, and propagates the warning", async () => {
        const calls: Record<string, unknown>[] = [];
        const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const client = {
            expenses: {
                list: async (request: Record<string, unknown>) => {
                    calls.push(request);
                    const page = request.page as number;
                    const pages: Record<number, Array<Record<string, unknown>>> = {
                        1: [
                            { id: "lo-1", date: "2026-05-31T00:00:00Z", category: "B" },
                            { id: "in-1", date: "2026-06-01T00:00:00Z", category: "A" },
                        ],
                        2: [
                            { id: "lo-2", date: "2026-05-30T00:00:00Z", category: "B" },
                            { id: "hi-2", date: "2026-07-02T00:00:00Z", category: "D" },
                        ],
                        3: [
                            { id: "in-2", date: "2026-06-30T23:59:59Z", category: "C" },
                            { id: "hi-1", date: "2026-07-01T00:00:00Z", category: "D" },
                        ],
                    };
                    return { expenses: { expenses: pages[page] ?? [] } };
                },
            },
        };
        try {
            await makeProgram(
                registerExpensesCommand,
                client as unknown as ClockifyClient,
            ).parseAsync([
                "node",
                "clk115",
                "--json",
                "expenses",
                "list",
                "--start",
                "2026-06-01",
                "--end",
                "2026-06-30",
                "--limit",
                "2",
                "--page-size",
                "2",
                "--max-pages",
                "3",
            ]);
            const rows = lastJson() as Array<Record<string, unknown>>;
            expect(rows.map((r) => r.id)).toEqual(["in-1", "in-2"]);
            expect(calls.map((call) => call.page)).toEqual([1, 2, 3]);
            expect(calls.every((call) => call["page-size"] === 2)).toBe(true);
            expect(warn.mock.calls.flat().join(" ")).toMatch(/applied client-side/i);
        } finally {
            warn.mockRestore();
        }
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
