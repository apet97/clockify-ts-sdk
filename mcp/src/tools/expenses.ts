/**
 * Expense + expense-category tools. Expense create takes a multipart
 * file upload upstream — for now we expose update/delete/list/get +
 * the category surface, and defer create to a future port that wraps
 * the wrapper's file-upload helper.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerExpensesTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_expenses_list",
        {
            title: "List expenses",
            description: "List workspace expenses with optional date range and pagination.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
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
            description: "Permanently delete one expense by ID from the pinned workspace.",
            inputSchema: { expenseId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
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
        "clockify_expenses_categories_list",
        {
            title: "List expense categories",
            description: "List workspace expense categories with bounded pagination controls.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
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
                priceInCents: z.number().int().optional(),
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
                priceInCents: z.number().int().optional(),
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
            description: "Permanently delete an expense category by ID.",
            inputSchema: { categoryId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
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
