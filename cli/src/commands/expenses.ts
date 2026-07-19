/**
 * `clk115 expenses {list,create,get,update,delete}`. `create` posts a scalar
 * body (no receipt upload required): the live create-expense endpoint validates
 * the scalar fields, and the synced SDK's `ExpenseCreateRequestFlattened.file`
 * is OPTIONAL, so this mirrors the MCP `clockify_expenses_create` tool and the
 * raw SDK `expenses.create`. Like that tool, `--user` defaults to the API-key
 * owner. Unlike the MCP tool, `--category` takes a raw category ID (the CLI does
 * not resolve category names — same as `expenses update`).
 */
import { listExpensesFiltered } from "clockify-sdk-ts-115/expense-list";
import { entityId } from "clockify-sdk-ts-115/operation-receipt";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import {
    clampPageSize,
    parseFloatArg,
    parseIntArg,
    promoteDateBoundary,
    resolveContext,
} from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

// Clockify's expense PUT needs an explicit list of which fields to apply;
// derive it from the scalar fields the caller actually supplied (mirrors
// the MCP `clockify_expenses_update` tool).
const EXPENSE_CHANGE_FIELDS = {
    amount: "AMOUNT",
    date: "DATE",
    projectId: "PROJECT",
    taskId: "TASK",
    categoryId: "CATEGORY",
    notes: "NOTES",
    billable: "BILLABLE",
} as const;

type ExpenseChangeField = (typeof EXPENSE_CHANGE_FIELDS)[keyof typeof EXPENSE_CHANGE_FIELDS];

interface ExpenseUpdateFields {
    amount: number;
    categoryId: string;
    date: string;
    projectId?: string;
    taskId?: string;
    notes?: string;
    billable?: boolean;
}

function expenseChangeFields(fields: ExpenseUpdateFields): ExpenseChangeField[] {
    return Object.entries(EXPENSE_CHANGE_FIELDS)
        .filter(([key]) => fields[key as keyof ExpenseUpdateFields] !== undefined)
        .map(([, value]) => value);
}

export const registerExpensesCommand: Registrar = (program, services) => {
    const expenses = program.command("expenses").description("Inspect workspace expenses.");

    leafCommand(expenses, "list", "read")
        .description("List expenses in the workspace.")
        .option("--limit <n>", "Total records to return (default 25, max 10000).", parseIntArg, 25)
        .option(
            "--page-size <n>",
            "Records fetched per page (default 50, max 200).",
            parseIntArg,
            50,
        )
        .option(
            "--max-pages <n>",
            "Maximum pages to scan (default 100, max 1000).",
            parseIntArg,
            100,
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option(
            "--start <date>",
            "Inclusive start bound (YYYY-MM-DD or RFC3339 with explicit Z/offset).",
        )
        .option(
            "--end <date>",
            "Inclusive end bound (YYYY-MM-DD or RFC3339 with explicit Z/offset).",
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const result = await listExpensesFiltered(
                client.expenses.list.bind(client.expenses),
                { workspaceId },
                {
                    page: opts.page as number,
                    pageSize: clampPageSize(opts.pageSize as number, 200),
                    limit: opts.limit as number,
                    maxPages: opts.maxPages as number,
                    ...(opts.start !== undefined ? { start: opts.start as string } : {}),
                    ...(opts.end !== undefined ? { end: opts.end as string } : {}),
                },
            );
            const rows = result.items.map((raw) => {
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
            for (const warning of result.warnings) console.error(`WARN ${warning}`);
            printRecords(rows, output);
        });

    leafCommand(expenses, "create", "write")
        .requiredOption("--amount <n>", "Amount.", parseFloatArg)
        .requiredOption("--category <id>", "Expense category ID.")
        .requiredOption("--date <date>", "Expense date (YYYY-MM-DD or ISO).")
        .option("--user <id>", "Owning user ID (defaults to the API-key owner).")
        .option("--project <id>", "Project ID.")
        .option("--task <id>", "Task ID.")
        .option("--notes <text>", "Notes.")
        .option("--billable", "Mark as billable.")
        .option("--no-billable", "Mark as non-billable.")
        .description(
            "Create an expense from amount, category, and date; defaults the user to the API-key owner.",
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            let userId = opts.user as string | undefined;
            if (!userId) {
                userId = entityId(await client.users.getCurrentUser());
                if (!userId) {
                    throw new Error(
                        "could not determine user ID from getCurrentUser response; pass --user.",
                    );
                }
            }
            // Create is a POST: unlike the expense PUT it needs no changeFields list.
            const fields: ExpenseUpdateFields = {
                amount: opts.amount,
                categoryId: opts.category,
                date: promoteDateBoundary(opts.date, "date", "start"),
            };
            if (opts.project) fields.projectId = opts.project;
            if (opts.task) fields.taskId = opts.task;
            if (opts.notes !== undefined) fields.notes = opts.notes;
            if (opts.billable !== undefined) fields.billable = opts.billable;
            // No cast needed: the create request's multipart `file` is optional, so
            // the scalar body type-checks directly (unlike the expense PUT).
            const created = (await client.expenses.create({
                ...fields,
                userId,
                workspaceId,
            })) as { id?: string };
            const data = { id: created.id ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "expenses.create",
                    entity: "expense",
                    ids: { expenseId: data.id },
                    data,
                    changed: { created: [{ type: "expense", id: data.id }] },
                    next: [
                        {
                            command: `clk115 expenses get ${data.id} --json`,
                            reason: "Verify the new expense.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(expenses, "get", "read")
        .argument("<id>", "Expense ID.")
        .description("Get one expense by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const expense = await client.expenses.get({ workspaceId, expenseId: id });
            printObject(expense, output);
        });

    leafCommand(expenses, "update", "write")
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
                date: promoteDateBoundary(opts.date, "date", "start"),
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
            })) as { id?: string };
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

    leafCommand(expenses, "delete", "destructive")
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
