import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { assertSafeWebhookUrl } from "../../orchestration/webhook-url.js";
import { successResult } from "../../result.js";

import {
    arrayOfStrings,
    idOf,
    maybeConfirm,
    normalizeDate,
    ref,
    resolveClientId,
    resolveExpenseCategoryId,
    resolvePolicyId,
    resolveProjectId,
    resolveTaskId,
    resolveUserId,
    str,
} from "./resolve.js";
import type { AnyRecord } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

export const WEBHOOK_EVENTS = [
    "NEW_TIME_ENTRY",
    "TIME_ENTRY_UPDATED",
    "TIME_ENTRY_DELETED",
    "NEW_PROJECT",
    "PROJECT_UPDATED",
    "PROJECT_DELETED",
    "NEW_TASK",
    "TASK_UPDATED",
    "TASK_DELETED",
    "NEW_CLIENT",
    "CLIENT_UPDATED",
    "CLIENT_DELETED",
] as const;

export async function invoiceClientWork(ctx: Context, args: AnyRecord) {
    const clientId =
        str(args.client_id) ||
        (str(args.client) ? await resolveClientId(ctx, str(args.client)) : "");
    if (!clientId) throw new Error("client or client_id is required");
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);
    const due = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14),
    );
    const dueDate = due.toISOString().slice(0, 10);
    const preview = {
        workspaceId: ctx.workspaceId,
        clientId,
        number:
            str(args.number) ||
            `MCP-${today.toISOString().slice(0, 10).replaceAll("-", "")}-${clientId.slice(-6)}`,
        currency: str(args.currency),
        issuedDate: normalizeDate(str(args.issued_date) || todayDate),
        dueDate: normalizeDate(str(args.due_date) || dueDate),
        ...(str(args.note) ? { note: str(args.note) } : {}),
    };
    const confirmation = maybeConfirm(
        ctx,
        "clockify_invoice_client_work",
        "billing_write",
        args,
        preview,
    );
    if (confirmation) return confirmation;
    const invoice = await ctx.client.invoices.create(preview);
    const ids = { workspaceId: ctx.workspaceId, clientId, invoiceId: idOf(invoice) };
    return successResult(
        "clockify_invoice_client_work",
        invoice,
        { workspaceId: ctx.workspaceId },
        {
            entity: "invoice",
            ids,
            changed: { created: [ref("invoice", invoice, preview.number)] },
            warnings: [
                {
                    code: "invoice_has_no_items",
                    message: "Invoice created with no line items. Add items manually if needed.",
                },
            ],
            next: [
                {
                    tool: "clockify_invoices_get",
                    args: { invoiceId: ids.invoiceId },
                    reason: "Inspect the invoice draft.",
                },
            ],
        },
    );
}

export async function recordExpense(ctx: Context, args: AnyRecord) {
    const categoryId =
        str(args.category_id) ||
        (str(args.category) ? await resolveExpenseCategoryId(ctx, str(args.category)) : "");
    if (!categoryId)
        throw new Error("missing required alternative: provide category or category_id");
    const projectId =
        str(args.project_id) ||
        (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    const userId = str(args.user_id) || idOf(await ctx.client.users.getCurrentUser());
    const preview = {
        workspaceId: ctx.workspaceId,
        amount: args.amount,
        categoryId,
        date: normalizeDate(str(args.date) || new Date().toISOString()),
        projectId,
        userId,
        ...(str(args.task_id) ? { taskId: str(args.task_id) } : {}),
        ...(str(args.notes) ? { notes: str(args.notes) } : {}),
        ...(args.billable !== undefined ? { billable: args.billable } : {}),
    };
    const confirmation = maybeConfirm(
        ctx,
        "clockify_record_expense",
        "expense_write",
        args,
        preview,
    );
    if (confirmation) return confirmation;
    const expense = await ctx.client.expenses.create(
        wireBody<ClockifyApi.ExpenseCreateRequest>(preview),
    );
    return successResult(
        "clockify_record_expense",
        expense,
        { workspaceId: ctx.workspaceId },
        {
            entity: "expense",
            ids: {
                workspaceId: ctx.workspaceId,
                expenseId: idOf(expense),
                categoryId,
                projectId,
                userId,
            },
            changed: { created: [ref("expense", expense)] },
            next: [
                {
                    tool: "clockify_expenses_list",
                    reason: "Verify the recorded expense in the expense list.",
                },
            ],
        },
    );
}

export async function requestTimeOff(ctx: Context, args: AnyRecord) {
    const policyId =
        str(args.policy_id) ||
        (str(args.policy) ? await resolvePolicyId(ctx, str(args.policy)) : "");
    if (!policyId) throw new Error("missing required alternative: provide policy or policy_id");
    const preview = {
        workspaceId: ctx.workspaceId,
        policyId,
        body: {
            ...(str(args.note) ? { note: str(args.note) } : {}),
            timeOffPeriod: {
                isHalfDay: args.half_day === true,
                halfDayPeriod: args.half_day ? "FIRST_HALF" : "NOT_DEFINED",
                period: { start: str(args.start), end: str(args.end) },
            },
        },
    };
    const confirmation = maybeConfirm(
        ctx,
        "clockify_request_time_off",
        "time_off_write",
        args,
        preview,
    );
    if (confirmation) return confirmation;
    const request = await ctx.client.timeOff.submit(
        wireBody<ClockifyApi.SubmitTimeOffRequest>(preview),
    );
    return successResult(
        "clockify_request_time_off",
        request,
        { workspaceId: ctx.workspaceId },
        {
            entity: "time_off_request",
            ids: { workspaceId: ctx.workspaceId, requestId: idOf(request), policyId },
            changed: { created: [ref("time_off_request", request)] },
            next: [
                {
                    tool: "clockify_time_off_requests_list",
                    reason: "Check the request status after submitting.",
                },
            ],
        },
    );
}

export async function scheduleWork(ctx: Context, args: AnyRecord) {
    const userId =
        str(args.user_id) || (str(args.user) ? await resolveUserId(ctx, str(args.user)) : "");
    const projectId =
        str(args.project_id) ||
        (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    if (!userId) throw new Error("schedule_work needs a user: pass user_id or user");
    if (!projectId) throw new Error("schedule_work needs a project: pass project_id or project");
    const taskId =
        str(args.task_id) ||
        (str(args.task) ? await resolveTaskId(ctx, projectId, str(args.task)) : "");
    const preview = {
        workspaceId: ctx.workspaceId,
        userId,
        projectId,
        period: { start: str(args.start), end: str(args.end) },
        hoursPerDay: args.hours_per_day,
        published: false,
        ...(taskId ? { taskId } : {}),
        ...(str(args.note) ? { note: str(args.note) } : {}),
        ...(args.billable !== undefined ? { billable: args.billable } : {}),
        ...(args.include_non_working_days !== undefined
            ? { includeNonWorkingDays: args.include_non_working_days }
            : {}),
    };
    const confirmation = maybeConfirm(
        ctx,
        "clockify_schedule_work",
        "scheduling_write",
        args,
        preview,
    );
    if (confirmation) return confirmation;
    const assignment = await ctx.client.scheduling.create(
        wireBody<ClockifyApi.CreateSchedulingRequest>(preview),
    );
    return successResult(
        "clockify_schedule_work",
        assignment,
        { workspaceId: ctx.workspaceId },
        {
            entity: "assignment",
            ids: {
                workspaceId: ctx.workspaceId,
                assignmentId: idOf(assignment),
                userId,
                projectId,
                taskId,
            },
            changed: { created: [ref("assignment", assignment)] },
            next: [
                {
                    tool: "clockify_scheduling_assignments_list",
                    reason: "Verify the scheduled assignment.",
                },
            ],
        },
    );
}

export async function setupWebhook(ctx: Context, args: AnyRecord) {
    // assertSafeWebhookUrl enforces HTTPS and rejects SSRF targets
    // (loopback / private / link-local / unique-local / cloud-metadata
    // hosts and localhost-ish names) before the preview is built, so even a
    // dry_run refuses a bad host. DNS-rebinding is out of scope (offline
    // guard); see orchestration/webhook-url.ts.
    const url = assertSafeWebhookUrl(str(args.url));
    const webhookEvent = str(args.webhook_event) || str(args.event);
    if (!webhookEvent) throw new Error("webhook_event is required");
    const triggerSourceType = str(args.trigger_source_type) || "WORKSPACE_ID";
    const triggerSource = arrayOfStrings(args.trigger_source);
    if (triggerSourceType === "WORKSPACE_ID" && triggerSource.length === 0)
        triggerSource.push(ctx.workspaceId);
    const preview = {
        name: str(args.name),
        url: url.toString(),
        webhookEvent,
        triggerSourceType,
        triggerSource,
    };
    const confirmation = maybeConfirm(
        ctx,
        "clockify_setup_webhook",
        "external_side_effect",
        args,
        preview,
    );
    if (confirmation) return confirmation;
    const webhook = await ctx.client.webhooks.create(
        wireBody<ClockifyApi.WebhookRequest>({ workspaceId: ctx.workspaceId, body: preview }),
    );
    return successResult(
        "clockify_setup_webhook",
        webhook,
        { workspaceId: ctx.workspaceId },
        {
            entity: "webhook",
            ids: { workspaceId: ctx.workspaceId, webhookId: idOf(webhook) },
            changed: { created: [ref("webhook", webhook, preview.name)] },
            next: [
                {
                    tool: "clockify_webhooks_get",
                    args: { webhookId: idOf(webhook) },
                    reason: "Inspect the webhook.",
                },
            ],
        },
    );
}
