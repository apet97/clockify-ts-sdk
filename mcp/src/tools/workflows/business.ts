import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { assertSafeWebhookUrl } from "../../orchestration/webhook-url.js";
import { errorResult, successResult } from "../../result.js";

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

// The full webhook event set the Clockify API accepts, mirroring the generated
// `ClockifyApi.WebhookEventType` union. `clockify_setup_webhook` binds its
// `event`/`webhook_event` enum to this, so the workflow tool now accepts every
// event the low-level `clockify_webhooks_create` tool already takes as a free
// string — it previously listed only 12 and hard-rejected the other 39 valid
// events at schema validation. `satisfies` rejects any typo/removed event; the
// exhaustiveness guard below fails the build if the generated union gains one.
export const WEBHOOK_EVENTS = [
    "NEW_TIME_ENTRY",
    "TIME_ENTRY_UPDATED",
    "TIME_ENTRY_DELETED",
    "TIME_ENTRY_SPLIT",
    "TIME_ENTRY_RESTORED",
    "NEW_TIMER_STARTED",
    "TIMER_STOPPED",
    "NEW_PROJECT",
    "PROJECT_UPDATED",
    "PROJECT_DELETED",
    "NEW_TASK",
    "TASK_UPDATED",
    "TASK_DELETED",
    "NEW_CLIENT",
    "CLIENT_UPDATED",
    "CLIENT_DELETED",
    "NEW_TAG",
    "TAG_UPDATED",
    "TAG_DELETED",
    "USER_JOINED_WORKSPACE",
    "USER_DELETED_FROM_WORKSPACE",
    "USER_DEACTIVATED_ON_WORKSPACE",
    "USER_ACTIVATED_ON_WORKSPACE",
    "USER_EMAIL_CHANGED",
    "USER_UPDATED",
    "USERS_INVITED_TO_WORKSPACE",
    "LIMITED_USERS_ADDED_TO_WORKSPACE",
    "NEW_INVOICE",
    "INVOICE_UPDATED",
    "NEW_APPROVAL_REQUEST",
    "APPROVAL_REQUEST_STATUS_UPDATED",
    "TIME_OFF_REQUESTED",
    "TIME_OFF_REQUEST_UPDATED",
    "TIME_OFF_REQUEST_APPROVED",
    "TIME_OFF_REQUEST_REJECTED",
    "TIME_OFF_REQUEST_STARTED",
    "TIME_OFF_REQUEST_WITHDRAWN",
    "BALANCE_UPDATED",
    "EXPENSE_CREATED",
    "EXPENSE_UPDATED",
    "EXPENSE_DELETED",
    "EXPENSE_RESTORED",
    "ASSIGNMENT_CREATED",
    "ASSIGNMENT_UPDATED",
    "ASSIGNMENT_DELETED",
    "ASSIGNMENT_PUBLISHED",
    "USER_GROUP_CREATED",
    "USER_GROUP_UPDATED",
    "USER_GROUP_DELETED",
    "COST_RATE_UPDATED",
    "BILLABLE_RATE_UPDATED",
] as const satisfies readonly ClockifyApi.WebhookEventType[];

// Compile-time drift guard: if the generated WebhookEventType union gains a
// member missing from WEBHOOK_EVENTS, `_MissingWebhookEvent` becomes that member
// (not `never`), the assertion type collapses to `false`, and `const … = true`
// fails type-check — forcing this list back in sync with the regenerated SDK.
type _MissingWebhookEvent = Exclude<ClockifyApi.WebhookEventType, (typeof WEBHOOK_EVENTS)[number]>;
const _webhookEventsExhaustive: _MissingWebhookEvent extends never ? true : false = true;
void _webhookEventsExhaustive;

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
    const userId =
        str(args.user_id) ||
        (ctx.currentUserId
            ? await ctx.currentUserId()
            : idOf(await ctx.client.users.getCurrentUser()));
    const preview = {
        workspaceId: ctx.workspaceId,
        amount: args.amount,
        categoryId,
        date: normalizeDate(str(args.date) || new Date().toISOString().slice(0, 10)),
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
    // The submit period shape is policy-unit dependent: DAYS-unit policies reject
    // {start,end} and want {start,days}; HOURS-unit policies want {start,end} and
    // reject days (live-verified 2026-06-21). The tool can't see the policy unit,
    // so require at least one of end / days before any mutation. Mirrors the
    // domain tool clockify_time_off_requests_submit. See discrepancies.md
    // `time-off.submit.period-shape-is-policy-type-dependent`.
    const end = str(args.end);
    const days = typeof args.days === "number" ? args.days : undefined;
    if (!end && days === undefined) {
        return errorResult(
            "clockify_request_time_off",
            new Error(
                "provide either `end` (date-range / HOURS-unit policies) or `days` (DAYS-unit policies) — the live API requires one",
            ),
        );
    }
    const policyId =
        str(args.policy_id) ||
        (str(args.policy) ? await resolvePolicyId(ctx, str(args.policy)) : "");
    if (!policyId) throw new Error("missing required alternative: provide policy or policy_id");
    const period: AnyRecord = { start: str(args.start) };
    if (end) period.end = end;
    if (days !== undefined) period.days = days;
    const preview = {
        workspaceId: ctx.workspaceId,
        policyId,
        body: {
            ...(str(args.note) ? { note: str(args.note) } : {}),
            timeOffPeriod: {
                isHalfDay: args.half_day === true,
                // Honor an explicit morning/afternoon choice; FIRST_HALF (morning)
                // stays the default so a bare half_day:true is unchanged.
                halfDayPeriod: args.half_day ? str(args.half_day_period) || "FIRST_HALF" : "NOT_DEFINED",
                period,
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
