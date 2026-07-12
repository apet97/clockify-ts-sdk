/**
 * Expense + expense-category tools. Create/update POST multipart
 * form-data upstream. Receipt files are optional on the live create/update
 * contract; updates without one use one documented generated-type boundary.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { resolveExpenseCategoryId } from "./workflows/resolve.js";

// Clockify's expense PUT needs an explicit list of which fields to apply;
// derive it from the scalar fields the caller actually supplied.
type ExpenseUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateExpensesRequest>;
type ExpenseChangeField = ExpenseUpdateBody["changeFields"][number];
type ExpenseFields = Pick<ExpenseUpdateBody, "amount" | "categoryId" | "date"> &
    Partial<
        Pick<ExpenseUpdateBody, "billable" | "file" | "notes" | "projectId" | "taskId" | "userId">
    >;
type ExpenseCategoryUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateExpenseCategoriesRequest>;

function expenseCategoryUpdateBody(current: unknown): ExpenseCategoryUpdateBody {
    if (current == null || typeof current !== "object") {
        throw new TypeError("Cannot update expense category: current state is unavailable.");
    }
    const value = current as Record<string, unknown>;
    if (typeof value.name !== "string" || value.name.length === 0) {
        throw new TypeError("Cannot update expense category: current name is missing.");
    }
    const body: ExpenseCategoryUpdateBody = { name: value.name };
    if (value.unit !== undefined && value.unit !== null) {
        if (typeof value.unit !== "string") {
            throw new TypeError("Cannot update expense category: current unit is invalid.");
        }
        body.unit = value.unit;
    }
    if (value.priceInCents !== undefined && value.priceInCents !== null) {
        if (typeof value.priceInCents !== "number" || !Number.isFinite(value.priceInCents)) {
            throw new TypeError("Cannot update expense category: current priceInCents is invalid.");
        }
        body.priceInCents = value.priceInCents;
    }
    if (value.hasUnitPrice !== undefined) {
        if (typeof value.hasUnitPrice !== "boolean") {
            throw new TypeError("Cannot update expense category: current hasUnitPrice is invalid.");
        }
        body.hasUnitPrice = value.hasUnitPrice;
    }
    return body;
}

// The expense create/update wire requires `date` as RFC3339 (yyyy-MM-ddThh:mm:ssZ)
// and 400s "invalid value for field: [date]" on a bare YYYY-MM-DD (live-verified).
// Promote a date-only value to midnight UTC; pass any other value through. (The
// record_expense workflow already normalizes via the resolve helper; these domain
// tools forwarded the raw arg.)
function normaliseExpenseDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
}

function expenseChangeFields(fields: ExpenseFields): ExpenseChangeField[] {
    const changes: ExpenseChangeField[] = [];
    if (fields.amount !== undefined) changes.push("AMOUNT");
    if (fields.date !== undefined) changes.push("DATE");
    if (fields.projectId !== undefined) changes.push("PROJECT");
    if (fields.taskId !== undefined) changes.push("TASK");
    if (fields.categoryId !== undefined) changes.push("CATEGORY");
    if (fields.notes !== undefined) changes.push("NOTES");
    if (fields.billable !== undefined) changes.push("BILLABLE");
    if (fields.file !== undefined) changes.push("FILE");
    if (fields.userId !== undefined) changes.push("USER");
    return changes;
}

async function currentUserId(ctx: Context): Promise<string> {
    // Lazy single-flight memo when the context provides one (fetched once per
    // server lifetime); fall back to a direct call for hand-built contexts.
    const id = ctx.currentUserId
        ? await ctx.currentUserId()
        : entityId(await ctx.client.users.getCurrentUser());
    if (!id) throw new Error("Could not determine the current user ID; pass userId explicitly.");
    return id;
}

export function registerExpensesTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
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
            const req: {
                workspaceId: string;
                page: number;
                "page-size": number;
                start?: string;
                end?: string;
            } = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.start) req.start = args.start;
            if (args.end) req.end = args.end;
            // The typed request now carries page/page-size, so it is passed directly; only the
            // response shape is narrowed below (the live list envelope is wider than generated).
            const response = (await ctx.client.expenses.list(req)) as
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
        },
    );

    defineTool(
        server,
        "clockify_expenses_get",
        {
            title: "Get an expense",
            description: "Fetch one expense by ID from the pinned Clockify workspace.",
            inputSchema: { expenseId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const expense = await ctx.client.expenses.get({
                workspaceId: ctx.workspaceId,
                expenseId: args.expenseId,
            });
            return successResult("clockify_expenses_get", expense, {
                workspaceId: ctx.workspaceId,
                expenseId: args.expenseId,
            });
        },
    );

    defineTool(
        server,
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
            const preview = { action: "delete", entity: "expense", id: args.expenseId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_expenses_delete",
                "expense_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.expenses.delete({
                workspaceId: ctx.workspaceId,
                expenseId: args.expenseId,
            });
            return successResult(
                "clockify_expenses_delete",
                { deleted: true, expenseId: args.expenseId },
                { workspaceId: ctx.workspaceId, expenseId: args.expenseId },
                writeReceipt("deleted", "expense", args.expenseId),
            );
        },
    );

    defineTool(
        server,
        "clockify_expenses_create",
        {
            title: "Create an expense",
            description:
                "Create a workspace expense from amount, category, project, and date; defaults the user to the API-key owner.",
            inputSchema: {
                amount: zNumberLike(z.number()),
                categoryId: z
                    .string()
                    .min(1)
                    .describe("Category id (24-hex) or exact category name."),
                projectId: z.string().min(1),
                date: z.string().min(1),
                taskId: z.string().optional(),
                notes: z.string().optional(),
                billable: z.boolean().optional(),
                userId: z.string().optional(),
                file: z.string().optional().describe("Optional receipt file reference."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const { userId, categoryId } = args;
            const owner = userId ?? (await currentUserId(ctx));
            const request: ClockifyApi.ExpenseCreateRequest = {
                amount: args.amount,
                projectId: args.projectId,
                date: String(normaliseExpenseDate(args.date)),
                categoryId: await resolveExpenseCategoryId(ctx, categoryId),
                userId: owner,
                workspaceId: ctx.workspaceId,
            };
            if (args.taskId !== undefined) request.taskId = args.taskId;
            if (args.notes !== undefined) request.notes = args.notes;
            if (args.billable !== undefined) request.billable = args.billable;
            if (args.file !== undefined) request.file = args.file;
            const created = await ctx.client.expenses.create(request);
            return successResult(
                "clockify_expenses_create",
                created,
                { workspaceId: ctx.workspaceId },
                writeReceipt("created", "expense", { id: entityId(created) }),
            );
        },
    );

    defineTool(
        server,
        "clockify_expenses_update",
        {
            title: "Update an expense",
            description:
                "Update an expense by ID (full replace of amount, category, date, plus any optional fields supplied).",
            inputSchema: {
                expenseId: z.string().min(1),
                amount: zNumberLike(z.number()),
                categoryId: z
                    .string()
                    .min(1)
                    .describe("Category id (24-hex) or exact category name."),
                date: z.string().min(1),
                projectId: z.string().optional(),
                taskId: z.string().optional(),
                notes: z.string().optional(),
                billable: z.boolean().optional(),
                userId: z.string().optional(),
                file: z.string().min(1).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const owner = args.userId ?? (await currentUserId(ctx));
            const fields: ExpenseFields = {
                amount: args.amount,
                categoryId: await resolveExpenseCategoryId(ctx, args.categoryId),
                date: normaliseExpenseDate(args.date),
            };
            if (args.file !== undefined) fields.file = args.file;
            if (args.projectId !== undefined) fields.projectId = args.projectId;
            if (args.taskId !== undefined) fields.taskId = args.taskId;
            if (args.notes !== undefined) fields.notes = args.notes;
            if (args.billable !== undefined) fields.billable = args.billable;
            if (args.userId !== undefined) fields.userId = args.userId;
            const bodyWithoutFile: Omit<ExpenseUpdateBody, "file"> = {
                amount: fields.amount,
                categoryId: fields.categoryId,
                changeFields: expenseChangeFields(fields),
                date: fields.date,
                userId: owner,
            };
            if (fields.projectId !== undefined) bodyWithoutFile.projectId = fields.projectId;
            if (fields.taskId !== undefined) bodyWithoutFile.taskId = fields.taskId;
            if (fields.notes !== undefined) bodyWithoutFile.notes = fields.notes;
            if (fields.billable !== undefined) bodyWithoutFile.billable = fields.billable;
            let updated: unknown;
            if (fields.file !== undefined) {
                const request: ClockifyApi.UpdateExpensesRequest = {
                    body: { ...bodyWithoutFile, file: fields.file },
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                };
                updated = await ctx.client.expenses.update(request);
            } else {
                const request = {
                    body: bodyWithoutFile,
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                };
                // Live expense PUT accepts an omitted receipt file, but the generated
                // multipart request still marks `file` required. All wire fields are
                // constructed above and protected ids are assigned last.
                // KEEP as never: narrow no-file generated-requiredness mismatch.
                updated = await ctx.client.expenses.update(request as never);
            }
            return successResult(
                "clockify_expenses_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    expenseId: args.expenseId,
                },
                writeReceipt("updated", "expense", args.expenseId),
            );
        },
    );

    defineTool(
        server,
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
            const response = await ctx.client.expenseCategories.list(
                {
                    workspaceId: ctx.workspaceId,
                },
                {
                    queryParams: {
                        page: args.page ?? 1,
                        "page-size": args.pageSize ?? 50,
                    },
                },
            );
            const items = Array.isArray(response) ? response : (response.categories ?? []);
            return successResult("clockify_expenses_categories_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_expenses_categories_create",
        {
            title: "Create an expense category",
            description:
                "Create a new expense category. Use unit/priceInCents when you want fixed-price categories.",
            inputSchema: {
                name: z.string().min(1),
                unit: z.string().optional(),
                priceInCents: zNumberLike(z.number().int()).optional(),
                hasUnitPrice: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.ExpenseCategoryRequest> = {
                name: args.name,
            };
            if (args.unit) body.unit = args.unit;
            if (args.priceInCents !== undefined) body.priceInCents = args.priceInCents;
            if (args.hasUnitPrice !== undefined) body.hasUnitPrice = args.hasUnitPrice;
            const req: ClockifyApi.ExpenseCategoryRequest = {
                workspaceId: ctx.workspaceId,
                body,
            };
            const created = await ctx.client.expenseCategories.create(req);
            return successResult(
                "clockify_expenses_categories_create",
                created,
                {
                    workspaceId: ctx.workspaceId,
                },
                writeReceipt("created", "expense_category", {
                    id: entityId(created),
                    name: args.name,
                }),
            );
        },
    );

    defineTool(
        server,
        "clockify_expenses_categories_update",
        {
            title: "Update an expense category",
            description: "Update an expense category name, unit pricing, or price behavior by ID.",
            inputSchema: {
                categoryId: z.string().min(1),
                name: z.string().min(1).optional(),
                unit: z.string().optional(),
                priceInCents: zNumberLike(z.number().int()).optional(),
                hasUnitPrice: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            let current: unknown;
            const seenPages = new Set<string>();
            for (let page = 1; current === undefined; page += 1) {
                const listed = (await ctx.client.expenseCategories.list(
                    { workspaceId: ctx.workspaceId },
                    { queryParams: { page, "page-size": 200 } },
                )) as unknown;
                const rows = Array.isArray(listed)
                    ? listed
                    : listed != null &&
                        typeof listed === "object" &&
                        Array.isArray((listed as { categories?: unknown }).categories)
                      ? (listed as { categories: unknown[] }).categories
                      : undefined;
                if (rows === undefined) {
                    throw new TypeError(
                        "Cannot update expense category: category list is invalid.",
                    );
                }
                const fingerprint = JSON.stringify(
                    rows.map((item) =>
                        item != null && typeof item === "object"
                            ? ((item as { id?: unknown }).id ?? null)
                            : null,
                    ),
                );
                if (seenPages.has(fingerprint)) {
                    throw new TypeError(
                        "Cannot update expense category: category pagination repeated a page.",
                    );
                }
                seenPages.add(fingerprint);
                current = rows.find(
                    (item) =>
                        item != null &&
                        typeof item === "object" &&
                        (item as { id?: unknown }).id === args.categoryId,
                );
                if (current !== undefined || rows.length < 200) break;
            }
            if (current === undefined) {
                throw new TypeError(
                    "Cannot update expense category: current category was not found.",
                );
            }
            const body = expenseCategoryUpdateBody(current);
            let changed = false;
            if (args.name !== undefined) {
                changed ||= body.name !== args.name;
                body.name = args.name;
            }
            if (args.unit !== undefined) {
                changed ||= body.unit !== args.unit;
                body.unit = args.unit;
            }
            if (args.priceInCents !== undefined) {
                changed ||= body.priceInCents !== args.priceInCents;
                body.priceInCents = args.priceInCents;
            }
            if (args.hasUnitPrice !== undefined) {
                changed ||= body.hasUnitPrice !== args.hasUnitPrice;
                body.hasUnitPrice = args.hasUnitPrice;
            }
            if (!changed) {
                throw new TypeError("Expense category update is a no-op; supply a changed field.");
            }
            const req: ClockifyApi.UpdateExpenseCategoriesRequest = {
                body,
                workspaceId: ctx.workspaceId,
                categoryId: args.categoryId,
            };
            const updated = await ctx.client.expenseCategories.update(req);
            return successResult(
                "clockify_expenses_categories_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                },
                writeReceipt("updated", "expense_category", args.categoryId),
            );
        },
    );

    defineTool(
        server,
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
            const preview = { action: "delete", entity: "expense_category", id: args.categoryId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_expenses_categories_delete",
                "expense_category_delete",
                args,
                preview,
            );
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
                writeReceipt("deleted", "expense_category", args.categoryId),
            );
        },
    );

    defineTool(
        server,
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
            const archived = await ctx.client.expenseCategories.archive({
                workspaceId: ctx.workspaceId,
                categoryId: args.categoryId,
                body: { archived: args.archived },
            });
            return successResult(
                "clockify_expenses_categories_archive",
                archived,
                {
                    workspaceId: ctx.workspaceId,
                    categoryId: args.categoryId,
                },
                writeReceipt("updated", "expense_category", args.categoryId),
            );
        },
    );
}
