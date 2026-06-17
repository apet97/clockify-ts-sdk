/**
 * `clk115 expenses list`. Create is intentionally omitted because
 * the live Clockify create-expense endpoint expects a multipart upload
 * (a receipt file) per the synced SDK's `ExpenseCreateRequest`. A
 * future iteration can add `expenses create` with a `--file` flag once
 * the wrapper exposes the right uploadable helper to the CLI surface.
 */
import type { Command } from "commander";

import { printRecords } from "../output.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerExpensesCommand: Registrar = (program, services) => {
    const expenses = program.command("expenses").description("Inspect workspace expenses.");

    expenses
        .command("list")
        .description("List expenses in the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--start <date>", "Start of the date range (YYYY-MM-DD).")
        .option("--end <date>", "End of the date range (YYYY-MM-DD).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.start) req.start = opts.start;
            if (opts.end) req.end = opts.end;
            const response = (await client.expenses.list(req as never)) as {
                expenses?: { expenses?: unknown[] } | unknown[];
            };
            // Upstream returns a doubly-nested envelope
            // ({expenses: {expenses: [...]}}) per the SDK probe evidence.
            const items = (() => {
                const inner = response.expenses;
                if (Array.isArray(inner)) return inner;
                if (inner && Array.isArray(inner.expenses)) return inner.expenses;
                return [] as unknown[];
            })();
            const rows = items.map((raw) => {
                const e = raw as {
                    id?: string;
                    category?: { name?: string } | string;
                    projectId?: string;
                    quantity?: number;
                    amount?: number;
                    currency?: string;
                    date?: string;
                    billable?: boolean;
                };
                const category =
                    typeof e.category === "object" && e.category !== null
                        ? (e.category).name ?? ""
                        : typeof e.category === "string"
                          ? e.category
                          : "";
                return {
                    id: e.id ?? "",
                    date: e.date ?? "",
                    category,
                    projectId: e.projectId ?? "",
                    amount: e.amount ?? e.quantity ?? 0,
                    currency: e.currency ?? "",
                    billable: e.billable === true,
                };
            });
            printRecords(rows, output);
        });
};
