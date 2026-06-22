/**
 * `clk115 expenses {list,get,update,delete}`. There is no `expenses create`
 * yet — but NOT because a receipt upload is required: the live create-expense
 * endpoint accepts a scalar body (the synced SDK's
 * `ExpenseCreateRequestFlattened.file` is OPTIONAL), and both the MCP
 * `clockify_expenses_create` tool and the raw SDK `expenses.create` already
 * create expenses without a file. Adding a CLI `expenses create` is therefore a
 * deliberate surface expansion (it bumps the headline command count and the
 * generated command tables), tracked as a follow-up rather than bundled here.
 */
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { parseFloatArg, parseIntArg, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

// Clockify's expense PUT needs an explicit list of which fields to apply;
// derive it from the scalar fields the caller actually supplied (mirrors
// the MCP `clockify_expenses_update` tool).
const EXPENSE_CHANGE_FIELDS: Record<string, string> = {
    amount: "AMOUNT",
    date: "DATE",
    projectId: "PROJECT",
    taskId: "TASK",
    categoryId: "CATEGORY",
    notes: "NOTES",
    billable: "BILLABLE",
};

interface ExpenseUpdateFields {
    amount: number;
    categoryId: string;
    date: string;
    projectId?: string;
    taskId?: string;
    notes?: string;
    billable?: boolean;
}

function expenseChangeFields(fields: ExpenseUpdateFields): string[] {
    return Object.entries(EXPENSE_CHANGE_FIELDS)
        .filter(([key]) => fields[key as keyof ExpenseUpdateFields] !== undefined)
        .map(([, value]) => value);
}

export const registerExpensesCommand: Registrar = (program, services) => {
    const expenses = program.command("expenses").description("Inspect workspace expenses.");

    expenses
        .command("list")
        .description("List expenses in the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", parseIntArg, 25)
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--start <date>", "Start of the date range (YYYY-MM-DD).")
        .option("--end <date>", "End of the date range (YYYY-MM-DD).")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Generated `ListExpensesRequest` carries only page/page-size; the CLI
            // still surfaces --start/--end as date filters, so wireBody bridges the
            // narrower request type with a sanctioned typed escape.
            const req: ClockifyApi.ListExpensesRequest & { start?: string; end?: string } = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.start) req.start = opts.start;
            if (opts.end) req.end = opts.end;
            const response = (await client.expenses.list(
                wireBody<ClockifyApi.ListExpensesRequest>(req),
            )) as {
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
                    total?: number;
                    amount?: number;
                    currency?: string;
                    date?: string;
                    billable?: boolean;
                };
                const category =
                    typeof e.category === "object" && e.category !== null
                        ? (e.category.name ?? "")
                        : typeof e.category === "string"
                          ? e.category
                          : "";
                return {
                    id: e.id ?? "",
                    date: e.date ?? "",
                    category,
                    projectId: e.projectId ?? "",
                    // Prefer the computed `total` (quantity * unit amount) over the
                    // per-unit `amount`/`quantity`, so the column shows what the
                    // expense actually costs rather than a per-unit figure.
                    amount: e.total ?? e.amount ?? e.quantity ?? 0,
                    currency: e.currency ?? "",
                    billable: e.billable === true,
                };
            });
            printRecords(rows, output);
        });

    expenses
        .command("get")
        .argument("<id>", "Expense ID.")
        .description("Get one expense by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const expense = await client.expenses.get({ workspaceId, expenseId: id });
            printObject(expense, output);
        });

    expenses
        .command("update")
        .argument("<id>", "Expense ID.")
        .requiredOption("--amount <n>", "Amount.", parseFloatArg)
        .requiredOption("--category <id>", "Expense category ID.")
        .requiredOption("--date <date>", "Expense date (YYYY-MM-DD or ISO).")
        .requiredOption("--user <id>", "Owning user ID.")
        .option("--project <id>", "Project ID.")
        .option("--task <id>", "Task ID.")
        .option("--notes <text>", "Notes.")
        .option("--billable", "Mark as billable.")
        .option("--no-billable", "Mark as non-billable.")
        .description(
            "Update an expense by ID (full replace of amount, category, date, plus any optional fields supplied).",
        )
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const fields: ExpenseUpdateFields = {
                amount: opts.amount,
                categoryId: opts.category,
                date: opts.date,
            };
            if (opts.project) fields.projectId = opts.project;
            if (opts.task) fields.taskId = opts.task;
            if (opts.notes !== undefined) fields.notes = opts.notes;
            if (opts.billable !== undefined) fields.billable = opts.billable;
            const updated = (await client.expenses.update({
                ...fields,
                changeFields: expenseChangeFields(fields),
                userId: opts.user,
                expenseId: id,
                workspaceId,
                // KEEP as never: expense update scalar shape omits the generated multipart file.
            } as never)) as { id?: string };
            const data = { id: updated.id ?? id };
            printReceipt(
                {
                    ok: true,
                    action: "expenses.update",
                    entity: "expense",
                    ids: { expenseId: data.id },
                    data,
                    changed: { updated: [{ type: "expense", id: data.id }] },
                    next: [
                        {
                            command: `clk115 expenses get ${data.id} --json`,
                            reason: "Verify the update.",
                        },
                    ],
                },
                output,
            );
        });

    expenses
        .command("delete")
        .argument("<id>", "Expense ID.")
        .description("Delete an expense by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.expenses.delete({ workspaceId, expenseId: id });
            printReceipt(
                {
                    ok: true,
                    action: "expenses.delete",
                    entity: "expense",
                    ids: { expenseId: id },
                    data: { id, deleted: true, message: `deleted expense ${id}` },
                    changed: { deleted: [{ type: "expense", id }] },
                    next: [
                        {
                            command: "clk115 expenses list --json",
                            reason: "Verify the expense no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
