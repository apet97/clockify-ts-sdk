import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { zNumberLike } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineTool, successResult } from "../../result.js";

import { WEBHOOK_EVENTS, invoiceClientWork, recordExpense, requestTimeOff, scheduleWork, setupWebhook } from "./business.js";
import { demoCleanup, demoSeed } from "./demo.js";
import { planChange } from "./plan.js";
import { createWorkPackage } from "./resolve.js";
import { reviewInputSchema, reviewPeriod } from "./review.js";
import { runWorkflow } from "./run.js";
import { fixEntry, logWork, startWork, stopWork, switchWork, timeEntryInputSchema } from "./time-tracking.js";

export function registerWorkflowTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_tools_guide",
        {
            title: "Clockify tools guide",
            description: "Show the workflow-first tool groups and when to use domain tools instead.",
            inputSchema: {},
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async () =>
            successResult(
                "clockify_tools_guide",
                {
                    workflows: [
                        {
                            group: "orientation",
                            tools: ["clockify_status", "clockify_tools_guide"],
                            useFor: ["first call", "tool choice", "current timer status"],
                        },
                        {
                            group: "work tracking",
                            tools: [
                                "clockify_create_work_package",
                                "clockify_log_work",
                                "clockify_start_work",
                                "clockify_stop_work",
                                "clockify_switch_work",
                                "clockify_fix_entry",
                            ],
                            useFor: ["create reusable work objects", "log finished work", "run timers", "fix entries"],
                        },
                        {
                            group: "review",
                            tools: ["clockify_review_day", "clockify_review_week"],
                            useFor: ["daily totals", "weekly totals", "gaps", "overlaps", "missing details"],
                        },
                        {
                            group: "business workflows",
                            tools: [
                                "clockify_invoice_client_work",
                                "clockify_record_expense",
                                "clockify_request_time_off",
                                "clockify_schedule_work",
                                "clockify_setup_webhook",
                            ],
                            useFor: ["billing", "expenses", "leave requests", "scheduling", "webhook setup"],
                        },
                    ],
                    commonTasks: [
                        { task: "Start using the MCP", tool: "clockify_status" },
                        { task: "Create a project/task/tag bundle", tool: "clockify_create_work_package" },
                        { task: "Log time from plain names", tool: "clockify_log_work" },
                        { task: "Review a week and decide what to fix", tool: "clockify_review_week" },
                    ],
                    rulesOfThumb: [
                        "Use workflow tools first.",
                        "Use IDs returned by previous calls when available.",
                        "Use domain tools for exact CRUD after a workflow points there.",
                    ],
                },
                { workspaceId: ctx.workspaceId },
                {
                    entity: "tool_guide",
                    ids: { workspaceId: ctx.workspaceId },
                    next: [
                        { tool: "clockify_status", reason: "Verify credentials and timer state." },
                        {
                            tool: "clockify_create_work_package",
                            reason: "Set up reusable work objects for future logging.",
                        },
                    ],
                },
            ),
    );

    defineTool(
        server,
        "clockify_plan_change",
        {
            title: "Plan a change (read-only)",
            description:
                "READ-ONLY planning: explain which Clockify tools a change will use, in order, before anything mutates. For each step it reports the tool, whether it mutates, and whether it needs the dry_run -> confirm_token handshake. Accepts a free-text `goal` (e.g. \"invoice Acme\", \"log yesterday's work\", \"clean demo data\") and an optional `entity`. Makes no API calls. Next: call the first tool in the returned plan.",
            inputSchema: {
                goal: z.string().min(1),
                entity: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const planArgs = { goal: args.goal, ...(args.entity !== undefined ? { entity: args.entity } : {}) };
            return runWorkflow("clockify_plan_change", planArgs, () => planChange(ctx, planArgs));
        },
    );

    defineTool(
        server,
        "clockify_create_work_package",
        {
            title: "Create work package",
            description: "Create or reuse a client, project, task, and tags from names or IDs.",
            inputSchema: {
                client: z.string().optional(),
                client_id: z.string().optional(),
                project: z.string().optional(),
                project_id: z.string().optional(),
                task: z.string().optional(),
                task_id: z.string().optional(),
                tag: z.string().optional(),
                tags: z.array(z.string()).optional(),
                tag_ids: z.array(z.string()).optional(),
                color: z.string().optional(),
                billable: z.boolean().optional(),
                is_public: z.boolean().optional(),
                upsert: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_create_work_package", args, () => createWorkPackage(ctx, args)),
    );

    defineTool(
        server,
        "clockify_log_work",
        {
            title: "Log finished work",
            description: "Log a finished time entry from names or IDs; accepts start/end or duration_seconds plus end.",
            inputSchema: timeEntryInputSchema({ finished: true }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_log_work", args, () => logWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_start_work",
        {
            title: "Start work",
            description: "Start a running work timer using human-friendly names or returned IDs.",
            inputSchema: timeEntryInputSchema({ finished: false }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_start_work", args, () => startWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_stop_work",
        {
            title: "Stop work",
            description: "Stop the current running work timer. Returns ok when no timer is running.",
            inputSchema: { end: z.string().optional() },
            annotations: { idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_stop_work", args, () => stopWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_switch_work",
        {
            title: "Switch work",
            description: "Stop the current timer and start a new timer in one workflow call.",
            inputSchema: timeEntryInputSchema({ finished: false }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_switch_work", args, () => switchWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_review_day",
        {
            title: "Review day",
            description: "Review one day of entries for totals, gaps, running timers, and missing details.",
            inputSchema: reviewInputSchema({ week: false }),
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_review_day", args, () => reviewPeriod(ctx, "clockify_review_day", args)),
    );

    defineTool(
        server,
        "clockify_review_week",
        {
            title: "Review week",
            description: "Review a week of entries for totals, gaps, running timers, and missing details.",
            inputSchema: reviewInputSchema({ week: true }),
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_review_week", args, () => reviewPeriod(ctx, "clockify_review_week", args)),
    );

    defineTool(
        server,
        "clockify_fix_entry",
        {
            title: "Fix time entry",
            description: "Find one entry by ID or strict filters, then update selected fields (description, start/end, project, task, tags, billable).",
            inputSchema: {
                entry_id: z.string().optional(),
                description_contains: z.string().optional(),
                exact_description: z.string().optional(),
                start_after: z.string().optional(),
                start_before: z.string().optional(),
                description: z.string().optional(),
                new_description: z.string().optional(),
                project: z.string().optional(),
                project_id: z.string().optional(),
                task: z.string().optional(),
                task_id: z.string().optional(),
                tag: z.string().optional(),
                tag_ids: z.array(z.string()).optional(),
                start: z.string().optional(),
                end: z.string().optional(),
                billable: z.boolean().optional(),
            },
            annotations: { idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_fix_entry", args, () => fixEntry(ctx, args)),
    );

    defineTool(
        server,
        "clockify_invoice_client_work",
        {
            title: "Invoice client work",
            description: "Create a draft invoice for a client name or ID. Supports dry_run plus confirm_token.",
            inputSchema: {
                client: z.string().optional(),
                client_id: z.string().optional(),
                number: z.string().optional(),
                issued_date: z.string().optional(),
                due_date: z.string().optional(),
                currency: z.string().min(1),
                note: z.string().optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_invoice_client_work", args, () => invoiceClientWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_record_expense",
        {
            title: "Record expense",
            description: "Record an expense with category and project names or IDs. Supports dry_run plus confirm_token.",
            inputSchema: {
                amount: zNumberLike(z.number()),
                date: z.string().optional(),
                category: z.string().optional(),
                category_id: z.string().optional(),
                project: z.string().optional(),
                project_id: z.string().optional(),
                task_id: z.string().optional(),
                user_id: z.string().optional(),
                notes: z.string().optional(),
                billable: z.boolean().optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_record_expense", args, () => recordExpense(ctx, args)),
    );

    defineTool(
        server,
        "clockify_request_time_off",
        {
            title: "Request time off",
            description: "Create a time-off request with a policy name or ID. Supports dry_run plus confirm_token.",
            inputSchema: {
                policy: z.string().optional(),
                policy_id: z.string().optional(),
                start: z
                    .string()
                    .min(1)
                    .describe(
                        "Start date. DAYS-unit policies want a date-only start (yyyy-MM-dd); HOURS-unit policies want a full RFC3339 datetime (yyyy-MM-ddThh:mm:ssZ).",
                    ),
                end: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Range end (RFC3339). Required by HOURS-unit (date-range) policies; omit for DAYS-unit policies and pass `days`. Provide `end` OR `days`.",
                    ),
                days: zNumberLike(z.number().int())
                    .optional()
                    .describe(
                        "Number of days. Required by DAYS-unit policies; omit for HOURS-unit policies and pass `end`. Provide `end` OR `days`.",
                    ),
                note: z.string().optional(),
                half_day: z.boolean().optional(),
                half_day_period: z
                    .enum(["FIRST_HALF", "SECOND_HALF"])
                    .optional()
                    .describe(
                        "Which half to take when half_day is true: FIRST_HALF (morning, default) or SECOND_HALF (afternoon).",
                    ),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_request_time_off", args, () => requestTimeOff(ctx, args)),
    );

    defineTool(
        server,
        "clockify_schedule_work",
        {
            title: "Schedule work",
            description: "Create a scheduling assignment by user and project names or IDs. Supports dry_run plus confirm_token.",
            inputSchema: {
                user: z.string().optional(),
                user_id: z.string().optional(),
                project: z.string().optional(),
                project_id: z.string().optional(),
                start: z.string().min(1),
                end: z.string().min(1),
                hours_per_day: z.number().min(0.5).max(24),
                billable: z.boolean().optional(),
                include_non_working_days: z.boolean().optional(),
                task: z.string().optional(),
                task_id: z.string().optional(),
                note: z.string().optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_schedule_work", args, () => scheduleWork(ctx, args)),
    );

    defineTool(
        server,
        "clockify_setup_webhook",
        {
            title: "Set up webhook",
            description: "Create a webhook subscription after HTTPS URL validation. Supports dry_run plus confirm_token.",
            inputSchema: {
                name: z.string().min(2).max(30),
                url: z.string().url(),
                event: z.enum(WEBHOOK_EVENTS).optional(),
                webhook_event: z.enum(WEBHOOK_EVENTS).optional(),
                trigger_source_type: z.string().optional(),
                trigger_source: z.array(z.string()).optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_setup_webhook", args, () => setupWebhook(ctx, args)),
    );

    defineTool(
        server,
        "clockify_demo_seed",
        {
            title: "Seed demo data",
            description: "Create or reuse deterministic demo client/project/task/tag/time-entry objects.",
            inputSchema: {
                run_id: z.string().optional(),
                prefix: z.string().optional(),
                date: z.string().optional(),
                upsert: z.boolean().optional(),
            },
            annotations: { idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_demo_seed", args, () => demoSeed(ctx, args)),
    );

    defineTool(
        server,
        "clockify_demo_cleanup",
        {
            title: "Clean demo data",
            description: "Delete deterministic demo objects by prefix, continuing through partial failures.",
            inputSchema: {
                run_id: z.string().optional(),
                prefix: z.string().optional(),
                start: z.string().optional(),
                end: z.string().optional(),
            },
            annotations: { destructiveHint: true, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_demo_cleanup", args, () => demoCleanup(ctx, args)),
    );
}
