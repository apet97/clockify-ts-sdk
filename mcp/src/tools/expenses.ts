/**
 * Expense + expense-category tools. Create/update POST multipart
 * form-data upstream; the receipt file is optional in practice (the
 * live API validates the scalar fields, not `file`), so the tools
 * expose the scalar surface and default the user to the API-key owner.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { errorResult, successResult } from "../result.js";

// Clockify's expense PUT needs an explicit list of which fields to apply;
// derive it from the scalar fields the caller actually supplied.
const EXPENSE_CHANGE_FIELDS: Record<string, string> = {
    amount: "AMOUNT",
    date: "DATE",
    projectId: "PROJECT",
    taskId: "TASK",
    categoryId: "CATEGORY",
    notes: "NOTES",
    billable: "BILLABLE",
};

function expenseChangeFields(fields: Record<string, unknown>): string[] {
    return Object.entries(EXPENSE_CHANGE_FIELDS)
        .filter(([key]) => fields[key] !== undefined)
        .map(([, value]) => value);
}

async function currentUserId(ctx: Context): Promise<string> {
    const id = (await ctx.client.users.getCurrentUser() as { id?: string }).id;
    if (!id) throw new Error("Could not determine the current user ID; pass userId explicitly.");
    return id;
}

export function registerExpensesTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_expenses_list",
        {
            title: "List expenses",
            description: "List workspace expenses with optional date range and pagination.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                start: z.string().optional(),
                end: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.start) req.start = args.start;
                if (args.end) req.end = args.end;
                const response = (await ctx.client.expenses.list(req as never)) as
                    | { expenses?: { expenses?: unknown[]; count?: number } | unknown[] }
                    | unknown[];
                // Upstream returns {expenses: {expenses: [...], count}} per
                // probe evidence; tolerate the bare-array fallback too.
                const items = (() => {
                    if (Array.isArray(response)) return response;
                    const inner = response.expenses;
                    if (Array.isArray(inner)) return inner;
                    if (inner && Array.isArray(inner.expenses)) return inner.expenses;
                    return [] as unknown[];
                })();
                return successResult("clockify_expenses_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                });
            } catch (err) {
                return errorResult("clockify_expenses_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_get",
        {
            title: "Get an expense",
            description: "Fetch one expense by ID from the pinned Clockify workspace.",
            inputSchema: { expenseId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const expense = await ctx.client.expenses.get({
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                });
                return successResult("clockify_expenses_get", expense, {
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                });
            } catch (err) {
                return errorResult("clockify_expenses_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_delete",
        {
            title: "Delete an expense",
            description:
                "Permanently delete one expense by ID from the pinned workspace. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                expenseId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                const preview = { action: "delete", entity: "expense", id: args.expenseId };
                const confirmation = requireConfirmation(ctx, "clockify_expenses_delete", "expense_delete", args, preview);
                if (confirmation) return confirmation;
                await ctx.client.expenses.delete({
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                });
                return successResult(
                    "clockify_expenses_delete",
                    { deleted: true, expenseId: args.expenseId },
                    { workspaceId: ctx.workspaceId, expenseId: args.expenseId },
                );
            } catch (err) {
                return errorResult("clockify_expenses_delete", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_create",
        {
            title: "Create an expense",
            description: "Create a workspace expense from amount, category, project, and date; defaults the user to the API-key owner.",
            inputSchema: {
                amount: zNumberLike(z.number()),
                categoryId: z.string().min(1),
                projectId: z.string().min(1),
                date: z.string().min(1),
                taskId: z.string().optional(),
                notes: z.string().optional(),
                billable: z.boolean().optional(),
                userId: z.string().optional(),
                extra: z.record(z.unknown()).optional().describe("Additional expense fields, e.g. a receipt file reference"),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const { extra, userId, ...fields } = args;
                const owner = userId ?? (await currentUserId(ctx));
                const created = await ctx.client.expenses.create({
                    ...fields,
                    ...(extra ?? {}),
                    userId: owner,
                    workspaceId: ctx.workspaceId,
                } as never);
                return successResult("clockify_expenses_create", created, { workspaceId: ctx.workspaceId });
            } catch (err) {
                return errorResult("clockify_expenses_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_update",
        {
            title: "Update an expense",
            description: "Update an expense by ID (full replace of amount, category, date, plus any optional fields supplied).",
            inputSchema: {
                expenseId: z.string().min(1),
                amount: zNumberLike(z.number()),
                categoryId: z.string().min(1),
                date: z.string().min(1),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                notes: z.string().optional(),
                billable: z.boolean().optional(),
                userId: z.string().optional(),
                extra: z.record(z.unknown()).optional().describe("Additional expense fields to replace"),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const { expenseId, extra, userId, ...fields } = args;
                const owner = userId ?? (await currentUserId(ctx));
                const updated = await ctx.client.expenses.update({
                    ...fields,
                    ...(extra ?? {}),
                    changeFields: expenseChangeFields(fields),
                    userId: owner,
                    expenseId,
                    workspaceId: ctx.workspaceId,
                } as never);
                return successResult("clockify_expenses_update", updated, {
                    workspaceId: ctx.workspaceId,
                    expenseId,
                });
            } catch (err) {
                return errorResult("clockify_expenses_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_categories_list",
        {
            title: "List expense categories",
            description: "List workspace expense categories with bounded pagination controls.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.expenseCategories.list({
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                } as never)) as unknown[];
                return successResult("clockify_expenses_categories_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_expenses_categories_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_categories_create",
        {
            title: "Create an expense category",
            description: "Create a new expense category. Use unit/priceInCents when you want fixed-price categories.",
            inputSchema: {
                name: z.string().min(1),
                unit: z.string().optional(),
                priceInCents: zNumberLike(z.number().int()).optional(),
                hasUnitPrice: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { workspaceId: ctx.workspaceId, name: args.name };
                if (args.unit) body.unit = args.unit;
                if (args.priceInCents !== undefined) body.priceInCents = args.priceInCents;
                if (args.hasUnitPrice !== undefined) body.hasUnitPrice = args.hasUnitPrice;
                const created = await ctx.client.expenseCategories.create(body as never);
                return successResult("clockify_expenses_categories_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_expenses_categories_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_categories_update",
        {
            title: "Update an expense category",
            description: "Update an expense category name, unit pricing, or price behavior by ID.",
            inputSchema: {
                categoryId: z.string().min(1),
                name: z.string().optional(),
                unit: z.string().optional(),
                priceInCents: zNumberLike(z.number().int()).optional(),
                hasUnitPrice: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                };
                if (args.name) body.name = args.name;
                if (args.unit) body.unit = args.unit;
                if (args.priceInCents !== undefined) body.priceInCents = args.priceInCents;
                if (args.hasUnitPrice !== undefined) body.hasUnitPrice = args.hasUnitPrice;
                const updated = await ctx.client.expenseCategories.update(body as never);
                return successResult("clockify_expenses_categories_update", updated, {
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                });
            } catch (err) {
                return errorResult("clockify_expenses_categories_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_categories_delete",
        {
            title: "Delete an expense category",
            description:
                "Permanently delete an expense category by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                categoryId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                const preview = { action: "delete", entity: "expense_category", id: args.categoryId };
                const confirmation = requireConfirmation(ctx, "clockify_expenses_categories_delete", "expense_category_delete", args, preview);
                if (confirmation) return confirmation;
                // Clockify rejects deleting an ACTIVE category — archive it first
                // via the dedicated PATCH .../status endpoint (not a replace), then
                // delete.
                await ctx.client.expenseCategories.archive({
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                    archived: true,
                });
                await ctx.client.expenseCategories.delete({
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                });
                return successResult(
                    "clockify_expenses_categories_delete",
                    { deleted: true, categoryId: args.categoryId },
                    { workspaceId: ctx.workspaceId, categoryId: args.categoryId },
                );
            } catch (err) {
                return errorResult("clockify_expenses_categories_delete", err);
            }
        },
    );

    server.registerTool(
        "clockify_expenses_categories_archive",
        {
            title: "Archive or reactivate an expense category",
            description: "Toggle the archived state on an expense category.",
            inputSchema: {
                categoryId: z.string().min(1),
                archived: z.boolean(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const archived = await ctx.client.expenseCategories.archive({
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                    body: { archived: args.archived },
                });
                return successResult("clockify_expenses_categories_archive", archived, {
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                });
            } catch (err) {
                return errorResult("clockify_expenses_categories_archive", err);
            }
        },
    );
}
