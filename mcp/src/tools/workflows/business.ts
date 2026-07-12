import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

import { assertSafeWebhookUrl } from "../../orchestration/webhook-url.js";
import { errorResult, successResult } from "../../result.js";
import { redactWebhook } from "../webhooks.js";

import {
    idOf,
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

const WEBHOOK_EVENT_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENTS);

interface TimeOffRequestPreview {
    workspaceId: string;
    policyId: string;
    body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest>;
}

function requiredFiniteNumber(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new TypeError(`${name} must be a boolean`);
    return value;
}

function webhookEvent(value: string): ClockifyApi.WebhookEventType {
    if (!WEBHOOK_EVENT_SET.has(value)) throw new TypeError("webhook_event is invalid");
    const matched = WEBHOOK_EVENTS.find((candidate) => candidate === value);
    if (matched === undefined) throw new TypeError("webhook_event is invalid");
    return matched;
}

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
    return {
        workspaceId: ctx.workspaceId,
        clientId,
        number:
            str(args.number) ||
            `MCP-${today.toISOString().slice(0, 10).replaceAll("-", "")}-${clientId.slice(-6)}`,
        currency: str(args.currency),
        issuedDate: normalizeDate(str(args.issued_date) || todayDate),
        dueDate: normalizeDate(str(args.due_date) || dueDate),
    } satisfies ClockifyApi.InvoiceCreateRequest;
}

export async function executeInvoiceClientWork(
    ctx: Context,
    preview: Awaited<ReturnType<typeof invoiceClientWork>>,
) {
    const invoice = await ctx.client.invoices.create(preview);
    const ids = {
        workspaceId: preview.workspaceId,
        clientId: preview.clientId,
        invoiceId: idOf(invoice),
    };
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
    const amount = requiredFiniteNumber(args.amount, "amount");
    const billable = optionalBoolean(args.billable, "billable");
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
    return {
        workspaceId: ctx.workspaceId,
        amount,
        categoryId,
        date: normalizeDate(str(args.date) || new Date().toISOString().slice(0, 10)),
        userId,
        ...(projectId ? { projectId } : {}),
        ...(str(args.task_id) ? { taskId: str(args.task_id) } : {}),
        ...(str(args.notes) ? { notes: str(args.notes) } : {}),
        ...(billable !== undefined ? { billable } : {}),
    } satisfies ClockifyApi.ExpenseCreateRequest;
}

export async function executeRecordExpense(
    ctx: Context,
    preview: Awaited<ReturnType<typeof recordExpense>>,
) {
    const expense = await ctx.client.expenses.create(preview);
    return successResult(
        "clockify_record_expense",
        expense,
        { workspaceId: ctx.workspaceId },
        {
            entity: "expense",
            ids: {
                workspaceId: ctx.workspaceId,
                expenseId: idOf(expense),
                categoryId: preview.categoryId,
                projectId: preview.projectId,
                userId: preview.userId,
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

export async function requestTimeOff(
    ctx: Context,
    args: AnyRecord,
): Promise<TimeOffRequestPreview | CallToolResult> {
    // The submit period shape is policy-unit dependent: DAYS-unit policies reject
    // {start,end} and want {start,days}; HOURS-unit policies want {start,end} and
    // reject days (live-verified 2026-06-21). The tool can't see the policy unit,
    // so require at least one of end / days before any mutation. Mirrors the
    // domain tool clockify_time_off_requests_submit. See discrepancies.md
    // `time-off.submit.period-shape-is-policy-type-dependent`.
    const end = str(args.end);
    const days = typeof args.days === "number" ? args.days : undefined;
    if (end && days !== undefined) {
        return errorResult(
            "clockify_request_time_off",
            new Error("provide exactly one of `end` or `days`, not both"),
        );
    }
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
    const period: ClockifyApi.PeriodV1Request = {
        start: str(args.start),
        ...(end ? { end } : {}),
        ...(days !== undefined ? { days } : {}),
    };
    const halfDayPeriod: ClockifyApi.HalfDayPeriod = args.half_day
        ? str(args.half_day_period) === "SECOND_HALF"
            ? "SECOND_HALF"
            : "FIRST_HALF"
        : "NOT_DEFINED";
    const body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest> = {
        note: str(args.note),
        timeOffPeriod: {
            isHalfDay: args.half_day === true,
            halfDayPeriod,
            period,
        },
    };
    return {
        workspaceId: ctx.workspaceId,
        policyId,
        body,
    } satisfies ClockifyApi.SubmitTimeOffRequest;
}

export async function executeRequestTimeOff(ctx: Context, preview: TimeOffRequestPreview) {
    const request = await ctx.client.timeOff.submit(preview);
    return successResult(
        "clockify_request_time_off",
        request,
        { workspaceId: ctx.workspaceId },
        {
            entity: "time_off_request",
            ids: {
                workspaceId: preview.workspaceId,
                requestId: idOf(request),
                policyId: preview.policyId,
            },
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
    const hoursPerDay = requiredFiniteNumber(args.hours_per_day, "hours_per_day");
    if (hoursPerDay <= 0) throw new RangeError("hours_per_day must be greater than zero");
    const billable = optionalBoolean(args.billable, "billable");
    const includeNonWorkingDays = optionalBoolean(
        args.include_non_working_days,
        "include_non_working_days",
    );
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
    return {
        workspaceId: ctx.workspaceId,
        userId,
        projectId,
        start: str(args.start),
        end: str(args.end),
        hoursPerDay,
        ...(taskId ? { taskId } : {}),
        ...(str(args.note) ? { note: str(args.note) } : {}),
        ...(billable !== undefined ? { billable } : {}),
        ...(includeNonWorkingDays !== undefined ? { includeNonWorkingDays } : {}),
    } satisfies ClockifyApi.CreateRecurringSchedulingRequest;
}

export async function executeScheduleWork(
    ctx: Context,
    preview: Awaited<ReturnType<typeof scheduleWork>>,
) {
    const created = await ctx.client.scheduling.createRecurring(preview);
    // createRecurring returns an ARRAY (one entry per occurrence); use the first for the receipt.
    const assignment = Array.isArray(created) ? created[0] : created;
    return successResult(
        "clockify_schedule_work",
        created,
        { workspaceId: ctx.workspaceId },
        {
            entity: "assignment",
            ids: {
                workspaceId: ctx.workspaceId,
                assignmentId: idOf(assignment),
                userId: preview.userId,
                projectId: preview.projectId,
                taskId: preview.taskId ?? "",
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
    const eventValue = str(args.webhook_event) || str(args.event);
    if (!eventValue) throw new Error("webhook_event is required");
    return {
        workspaceId: ctx.workspaceId,
        body: {
            name: str(args.name),
            url: url.toString(),
            webhookEvent: webhookEvent(eventValue),
            triggerSourceType: "WORKSPACE_ID",
            triggerSource: [ctx.workspaceId],
        },
    } satisfies ClockifyApi.WebhookRequest;
}

export async function executeSetupWebhook(
    ctx: Context,
    preview: Awaited<ReturnType<typeof setupWebhook>>,
) {
    const webhook = await ctx.client.webhooks.create(preview);
    return successResult(
        "clockify_setup_webhook",
        // Redact the authToken HMAC secret before it enters the result envelope —
        // Clockify returns it on create, and an agent transcript would leak it.
        redactWebhook(webhook),
        { workspaceId: ctx.workspaceId },
        {
            entity: "webhook",
            ids: { workspaceId: ctx.workspaceId, webhookId: idOf(webhook) },
            changed: { created: [ref("webhook", webhook, preview.body.name)] },
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
