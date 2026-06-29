import type { Context } from "../../client.js";
import { successResult } from "../../result.js";
import type { NextAction } from "../../result.js";

/** One planned step: which tool, whether it mutates, and whether it needs confirm. */
interface PlanStep {
    step: number;
    tool: string;
    mutates: boolean;
    requiresConfirmation: boolean;
    why: string;
}

interface Intent {
    match: RegExp;
    label: string;
    steps: Array<Omit<PlanStep, "step">>;
}

// Static, read-only intent → tool-chain map. No API calls: this tool exists so an
// agent can explain (and a human can approve) which tools a change will use, in
// order, BEFORE anything mutates.
const INTENTS: Intent[] = [
    {
        match: /invoice|bill|billing/i,
        label: "invoice a client",
        steps: [
            { tool: "clockify_status", mutates: false, requiresConfirmation: false, why: "Confirm credentials and the pinned workspace." },
            { tool: "clockify_review_week", mutates: false, requiresConfirmation: false, why: "Review the billable work that will be invoiced." },
            { tool: "clockify_invoice_client_work", mutates: true, requiresConfirmation: true, why: "Create the draft invoice (dry_run first, then confirm_token)." },
        ],
    },
    {
        match: /time.?off|leave|vacation|pto|holiday/i,
        label: "request time off",
        steps: [
            { tool: "clockify_status", mutates: false, requiresConfirmation: false, why: "Confirm the current user and workspace." },
            { tool: "clockify_request_time_off", mutates: true, requiresConfirmation: true, why: "Create the request (dry_run first, then confirm_token)." },
        ],
    },
    {
        match: /schedul|assign/i,
        label: "schedule work",
        steps: [
            { tool: "clockify_schedule_work", mutates: true, requiresConfirmation: true, why: "Create the assignment (dry_run first, then confirm_token)." },
        ],
    },
    {
        match: /expense/i,
        label: "record an expense",
        steps: [
            { tool: "clockify_record_expense", mutates: true, requiresConfirmation: true, why: "Record the expense (dry_run first, then confirm_token)." },
        ],
    },
    {
        match: /webhook/i,
        label: "set up a webhook",
        steps: [
            { tool: "clockify_setup_webhook", mutates: true, requiresConfirmation: true, why: "Validate the HTTPS URL, then create it (dry_run first, then confirm_token)." },
        ],
    },
    {
        match: /delete|remove|clean.?up|tear.?down|purge/i,
        label: "delete / clean up data",
        steps: [
            { tool: "clockify_review_day", mutates: false, requiresConfirmation: false, why: "See exactly what exists before deleting." },
            { tool: "clockify_demo_cleanup", mutates: true, requiresConfirmation: true, why: "Delete demo objects by prefix; domain *_delete tools also take dry_run + confirm_token." },
        ],
    },
    {
        match: /log|track|record time|time entry|timesheet/i,
        label: "log finished work",
        steps: [
            { tool: "clockify_create_work_package", mutates: true, requiresConfirmation: false, why: "Create or reuse the project/task/tag the entry needs (idempotent)." },
            { tool: "clockify_log_work", mutates: true, requiresConfirmation: false, why: "Log the finished time entry from names or IDs." },
        ],
    },
    {
        match: /start|stop|switch|timer/i,
        label: "run a timer",
        steps: [
            { tool: "clockify_status", mutates: false, requiresConfirmation: false, why: "Check whether a timer is already running." },
            { tool: "clockify_start_work", mutates: true, requiresConfirmation: false, why: "Start (or use clockify_stop_work / clockify_switch_work) a timer." },
        ],
    },
    {
        match: /review|report|summary|audit|totals|gaps/i,
        label: "review time",
        steps: [
            { tool: "clockify_review_week", mutates: false, requiresConfirmation: false, why: "Read-only totals, running timers, and missing details." },
        ],
    },
    {
        match: /project|task|tag|client|create|set ?up/i,
        label: "create reusable work objects",
        steps: [
            { tool: "clockify_create_work_package", mutates: true, requiresConfirmation: false, why: "Create or reuse client/project/task/tags (idempotent upsert)." },
        ],
    },
];

const FALLBACK: Intent = {
    match: /.*/,
    label: "orient first",
    steps: [
        { tool: "clockify_status", mutates: false, requiresConfirmation: false, why: "Confirm credentials, workspace, and any running timer." },
        { tool: "clockify_tools_guide", mutates: false, requiresConfirmation: false, why: "List the workflow tool groups and when to drop to domain tools." },
    ],
};

export async function planChange(
    ctx: Context,
    args: { goal: string; entity?: string },
): Promise<ReturnType<typeof successResult>> {
    const goal = String(args.goal ?? "").trim();
    const intent = INTENTS.find((i) => i.match.test(goal)) ?? FALLBACK;
    const plan: PlanStep[] = intent.steps.map((s, index) => ({ step: index + 1, ...s }));
    const mutating = plan.filter((s) => s.mutates);
    const confirmable = plan.filter((s) => s.requiresConfirmation);
    const next: NextAction[] = plan[0]
        ? [{ tool: plan[0].tool, reason: `First step: ${plan[0].why}` }]
        : [];

    return successResult(
        "clockify_plan_change",
        {
            goal,
            entity: args.entity ?? null,
            intent: intent.label,
            plan,
            mutatingSteps: mutating.length,
            confirmationRequiredSteps: confirmable.length,
            notes: [
                "This tool is read-only and makes no API calls — it only explains the plan.",
                confirmable.length > 0
                    ? "Steps marked requiresConfirmation use the dry_run -> confirm_token handshake: call with dry_run:true, then re-call with the returned confirm_token."
                    : "No step in this plan needs the dry_run -> confirm_token handshake.",
                "Prefer the workflow tools above; drop to domain tools only when a workflow points you there.",
            ],
        },
        { workspaceId: ctx.workspaceId },
        {
            entity: "plan",
            ids: { workspaceId: ctx.workspaceId },
            next,
        },
    );
}
