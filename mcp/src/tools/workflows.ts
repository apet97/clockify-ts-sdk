import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation, stripConfirmationArgs } from "../orchestration/confirm-guard.js";
import { assertSafeWebhookUrl } from "../orchestration/webhook-url.js";
import type { ChangeSet, EntityRef, NextAction, RecoveryHint, Warning } from "../result.js";
import { errorResult, successResult } from "../result.js";

type AnyRecord = Record<string, unknown>;
type Bucket = "created" | "updated" | "deleted" | "reused";

const WEBHOOK_EVENTS = [
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

export function registerWorkflowTools(server: McpServer, ctx: Context): void {
    server.registerTool(
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

    server.registerTool(
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

    server.registerTool(
        "clockify_log_work",
        {
            title: "Log finished work",
            description: "Log a finished time entry from names or IDs; accepts start/end or duration_seconds plus end.",
            inputSchema: timeEntryInputSchema({ finished: true }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_log_work", args, () => logWork(ctx, args)),
    );

    server.registerTool(
        "clockify_start_work",
        {
            title: "Start work",
            description: "Start a running work timer using human-friendly names or returned IDs.",
            inputSchema: timeEntryInputSchema({ finished: false }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_start_work", args, () => startWork(ctx, args)),
    );

    server.registerTool(
        "clockify_stop_work",
        {
            title: "Stop work",
            description: "Stop the current running work timer. Returns ok when no timer is running.",
            inputSchema: { end: z.string().optional() },
            annotations: { idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_stop_work", args, () => stopWork(ctx, args)),
    );

    server.registerTool(
        "clockify_switch_work",
        {
            title: "Switch work",
            description: "Stop the current timer and start a new timer in one workflow call.",
            inputSchema: timeEntryInputSchema({ finished: false }),
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => runWorkflow("clockify_switch_work", args, () => switchWork(ctx, args)),
    );

    server.registerTool(
        "clockify_review_day",
        {
            title: "Review day",
            description: "Review one day of entries for totals, gaps, running timers, and missing details.",
            inputSchema: reviewInputSchema({ week: false }),
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_review_day", args, () => reviewPeriod(ctx, "clockify_review_day", args)),
    );

    server.registerTool(
        "clockify_review_week",
        {
            title: "Review week",
            description: "Review a week of entries for totals, gaps, running timers, and missing details.",
            inputSchema: reviewInputSchema({ week: true }),
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_review_week", args, () => reviewPeriod(ctx, "clockify_review_week", args)),
    );

    server.registerTool(
        "clockify_fix_entry",
        {
            title: "Fix time entry",
            description: "Find one entry by ID or strict filters, then update selected fields.",
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
                start: z.string().optional(),
                end: z.string().optional(),
                billable: z.boolean().optional(),
            },
            annotations: { idempotentHint: true },
        },
        async (args) => runWorkflow("clockify_fix_entry", args, () => fixEntry(ctx, args)),
    );

    server.registerTool(
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

    server.registerTool(
        "clockify_record_expense",
        {
            title: "Record expense",
            description: "Record an expense with category and project names or IDs. Supports dry_run plus confirm_token.",
            inputSchema: {
                amount: z.number(),
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

    server.registerTool(
        "clockify_request_time_off",
        {
            title: "Request time off",
            description: "Create a time-off request with a policy name or ID. Supports dry_run plus confirm_token.",
            inputSchema: {
                policy: z.string().optional(),
                policy_id: z.string().optional(),
                start: z.string().min(1),
                end: z.string().min(1),
                note: z.string().optional(),
                half_day: z.boolean().optional(),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => runWorkflow("clockify_request_time_off", args, () => requestTimeOff(ctx, args)),
    );

    server.registerTool(
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

    server.registerTool(
        "clockify_setup_webhook",
        {
            title: "Set up webhook",
            description: "Create a webhook subscription after HTTPS URL validation. Supports dry_run plus confirm_token.",
            inputSchema: {
                name: z.string().min(1),
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

    server.registerTool(
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

    server.registerTool(
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

function timeEntryInputSchema({ finished }: { finished: boolean }) {
    const schema: Record<string, z.ZodTypeAny> = {
        start: z.string().optional(),
        description: z.string().optional(),
        project: z.string().optional(),
        project_id: z.string().optional(),
        task: z.string().optional(),
        task_id: z.string().optional(),
        tag: z.string().optional(),
        tag_ids: z.array(z.string()).optional(),
        billable: z.boolean().optional(),
    };
    if (finished) {
        schema.end = z.string().optional();
        schema.duration_seconds = z.number().int().min(1).optional();
        schema.durationSeconds = z.number().int().min(1).optional();
        schema.allow_overlap = z.boolean().optional();
    }
    return schema;
}

function reviewInputSchema({ week }: { week: boolean }) {
    return {
        date: week ? z.never().optional() : z.string().optional(),
        week_start: week ? z.string().optional() : z.never().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        workday_start: z.string().optional(),
        workday_end: z.string().optional(),
        min_gap_minutes: z.number().int().min(0).optional(),
        include_entries: z.boolean().optional(),
        max_rows: z.number().int().min(0).optional(),
    };
}

async function runWorkflow(action: string, args: AnyRecord, fn: () => Promise<ReturnType<typeof successResult>>) {
    try {
        return await fn();
    } catch (err) {
        return errorResult(action, err, defaultRecovery(action, args));
    }
}

async function createWorkPackage(ctx: Context, args: AnyRecord) {
    const upsert = args.upsert !== false;
    const changed: ChangeSet = {};
    const ids: Record<string, string | undefined> = { workspaceId: ctx.workspaceId };
    const data: AnyRecord = {};

    let clientId = str(args.client_id);
    if (!clientId && str(args.client)) {
        const found = await findOneByName(
            await ctx.client.clients.list({
                workspaceId: ctx.workspaceId,
                name: str(args.client),
                page: 1,
                "page-size": 200,
            } as never),
            str(args.client),
            "client",
        );
        if (found && upsert) {
            clientId = idOf(found);
            data.client = found;
            pushChanged(changed, "reused", ref("client", found));
        } else {
            const created = await ctx.client.clients.create({
                workspaceId: ctx.workspaceId,
                body: { name: str(args.client) },
            } as never);
            clientId = idOf(created);
            data.client = created;
            pushChanged(changed, "created", ref("client", created, str(args.client)));
        }
    }
    if (clientId) ids.clientId = clientId;

    let projectId = str(args.project_id);
    if (!projectId) {
        const projectName = str(args.project);
        if (!projectName) throw new Error("project or project_id is required");
        const listed = await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            name: projectName,
            ...(clientId ? { clients: [clientId] } : {}),
            page: 1,
            "page-size": 200,
        } as never);
        const found = await findOneByName(listed, projectName, "project");
        if (found && upsert) {
            projectId = idOf(found);
            data.project = found;
            pushChanged(changed, "reused", ref("project", found));
        } else {
            const created = await ctx.client.projects.create({
                workspaceId: ctx.workspaceId,
                name: projectName,
                ...(clientId ? { clientId } : {}),
                ...(args.color ? { color: args.color } : {}),
                ...(args.billable !== undefined ? { billable: args.billable } : {}),
                ...(args.is_public !== undefined ? { isPublic: args.is_public } : {}),
            } as never);
            projectId = idOf(created);
            data.project = created;
            pushChanged(changed, "created", ref("project", created, projectName));
        }
    }
    ids.projectId = projectId;

    let taskId = str(args.task_id);
    if (!taskId && str(args.task)) {
        const listed = await ctx.client.tasks.list({
            workspaceId: ctx.workspaceId,
            projectId,
            name: str(args.task),
            page: 1,
            "page-size": 200,
        } as never);
        const found = await findOneByName(listed, str(args.task), "task");
        if (found && upsert) {
            taskId = idOf(found);
            data.task = found;
            pushChanged(changed, "reused", ref("task", found));
        } else {
            const created = await ctx.client.tasks.create({
                workspaceId: ctx.workspaceId,
                projectId,
                name: str(args.task),
            } as never);
            taskId = idOf(created);
            data.task = created;
            pushChanged(changed, "created", ref("task", created, str(args.task)));
        }
    }
    if (taskId) ids.taskId = taskId;

    const tagIds = arrayOfStrings(args.tag_ids);
    const tagNames = [...arrayOfStrings(args.tags), ...(str(args.tag) ? [str(args.tag)] : [])];
    const tags: unknown[] = [];
    for (const name of tagNames) {
        const found = await findOneByName(
            await ctx.client.tags.list({ workspaceId: ctx.workspaceId, name, page: 1, "page-size": 200 } as never),
            name,
            "tag",
        );
        if (found && upsert) {
            tagIds.push(idOf(found));
            tags.push(found);
            pushChanged(changed, "reused", ref("tag", found));
        } else {
            const created = await ctx.client.tags.create({ workspaceId: ctx.workspaceId, name } as never);
            tagIds.push(idOf(created));
            tags.push(created);
            pushChanged(changed, "created", ref("tag", created, name));
        }
    }
    if (tagIds.length === 1) ids.tagId = tagIds[0];
    if (tagIds.length > 0) data.tagIds = tagIds;
    if (tags.length > 0) data.tags = tags;

    return successResult("clockify_create_work_package", data, { workspaceId: ctx.workspaceId }, {
        entity: "work_package",
        ids,
        changed,
        next: packageNext(projectId, taskId, tagIds),
    });
}

async function logWork(ctx: Context, args: AnyRecord) {
    const body = await prepareEntryBody(ctx, args, true);
    const entry = await ctx.client.timeEntries.create(body as never);
    const ids = entryIds(ctx, entry, body);
    return successResult("clockify_log_work", entry, { workspaceId: ctx.workspaceId }, {
        entity: "entry",
        ids,
        changed: { created: [ref("entry", entry, str(body.description))] },
        next: [
            { tool: "clockify_review_day", args: reviewArgsFromEntry(entry, body), reason: "Review the day after logging work." },
            { tool: "clockify_fix_entry", args: { entry_id: ids.entryId }, reason: "Adjust this entry if any details are wrong." },
        ],
    });
}

async function startWork(ctx: Context, args: AnyRecord) {
    const startWasDefaulted = !str(args.start);
    const body = await prepareEntryBody(ctx, { ...args, start: str(args.start) || new Date().toISOString() }, false);
    const entry = await ctx.client.timeEntries.create(body as never);
    const ids = entryIds(ctx, entry, body);
    return successResult(
        "clockify_start_work",
        entry,
        { workspaceId: ctx.workspaceId, ...(startWasDefaulted ? { startWasDefaulted: true, resolvedStart: body.start } : {}) },
        {
            entity: "entry",
            ids,
            changed: { created: [ref("entry", entry, str(body.description))] },
            next: [
                { tool: "clockify_stop_work", reason: "Stop this timer when the work session is finished." },
                { tool: "clockify_switch_work", reason: "Switch to another work item without manually stopping first." },
            ],
        },
    );
}

async function stopWork(ctx: Context, args: AnyRecord) {
    const user = await ctx.client.users.getCurrentUser();
    const userId = idOf(user);
    try {
        const entry = await ctx.client.timeEntries.stopTimer({
            workspaceId: ctx.workspaceId,
            userId,
            end: str(args.end) || new Date().toISOString(),
        } as never);
        const ids = entryIds(ctx, entry, { userId });
        return successResult("clockify_stop_work", entry, { workspaceId: ctx.workspaceId, userId }, {
            entity: "entry",
            ids,
            changed: { updated: [ref("entry", entry)] },
            next: [{ tool: "clockify_review_day", reason: "Review the day after stopping work." }],
        });
    } catch (err) {
        if ((err as { statusCode?: number }).statusCode === 404 || /no running/i.test(String((err as Error).message))) {
            return successResult(
                "clockify_stop_work",
                { stopped: false, reason: "no timer running" },
                { workspaceId: ctx.workspaceId, userId },
                { entity: "entry", ids: { workspaceId: ctx.workspaceId, userId } },
            );
        }
        throw err;
    }
}

async function switchWork(ctx: Context, args: AnyRecord) {
    const warnings: Warning[] = [];
    let stopped: unknown = null;
    try {
        stopped = (await stopWork(ctx, {})).structuredContent;
    } catch {
        warnings.push({ code: "stop_failed", message: "Could not stop the existing timer; attempting to start the new one." });
    }
    const started = (await startWork(ctx, args)).structuredContent as AnyRecord;
    return successResult("clockify_switch_work", { status: "ok", stopped, started }, { workspaceId: ctx.workspaceId }, {
        entity: "entry",
        ids: (started.ids as Record<string, string>) ?? { workspaceId: ctx.workspaceId },
        changed: { created: ((started.changed as ChangeSet | undefined)?.created ?? []) },
        warnings,
        next: [{ tool: "clockify_stop_work", reason: "Stop the newly started timer when finished." }],
    });
}

async function reviewPeriod(ctx: Context, action: string, args: AnyRecord) {
    const user = await ctx.client.users.getCurrentUser();
    const range = dateRange(action, args);
    const pageSize = 200;
    const entries = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId: idOf(user),
        start: range.start,
        end: range.end,
        page: 1,
        "page-size": pageSize,
    } as never)) as AnyRecord[];
    const review = summarizeEntries(entries, args);
    return successResult(action, review, { workspaceId: ctx.workspaceId, userId: idOf(user), count: entries.length }, {
        entity: "entry_review",
        ids: { workspaceId: ctx.workspaceId, userId: idOf(user) },
        next: review.suggestedActions.length
            ? review.suggestedActions
            : [{ tool: "clockify_log_work", reason: "Log any missing work discovered during review." }],
    });
}

async function fixEntry(ctx: Context, args: AnyRecord) {
    const entry = await findEntryForFix(ctx, args);
    const entryId = idOf(entry);
    const projectId = str(args.project_id) || (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    const body: AnyRecord = {
        workspaceId: ctx.workspaceId,
        timeEntryId: entryId,
        start: str(args.start) || str(entry.start) || str(entry.timeInterval && (entry.timeInterval as AnyRecord).start),
    };
    const nextDescription = str(args.new_description) || str(args.description);
    if (nextDescription) body.description = nextDescription;
    if (str(args.end)) body.end = str(args.end);
    if (projectId) body.projectId = projectId;
    if (args.billable !== undefined) body.billable = args.billable;
    if (!body.start) throw new Error("entry start is required to update this time entry");
    const { workspaceId, timeEntryId, ...updateBody } = body;
    const updated = await ctx.client.timeEntries.update({ workspaceId, timeEntryId, body: updateBody } as never);
    const ids = entryIds(ctx, updated, body);
    return successResult("clockify_fix_entry", updated, { workspaceId: ctx.workspaceId }, {
        entity: "entry",
        ids,
        changed: { updated: [ref("entry", updated, nextDescription)] },
        next: [{ tool: "clockify_review_day", args: reviewArgsFromEntry(updated, body), reason: "Review the affected day." }],
    });
}

async function invoiceClientWork(ctx: Context, args: AnyRecord) {
    const clientId = str(args.client_id) || (str(args.client) ? await resolveClientId(ctx, str(args.client)) : "");
    if (!clientId) throw new Error("client or client_id is required");
    const today = new Date();
    const todayDate = today.toISOString().slice(0, 10);
    const due = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 14));
    const dueDate = due.toISOString().slice(0, 10);
    const preview = {
        workspaceId: ctx.workspaceId,
        clientId,
        number: str(args.number) || `MCP-${today.toISOString().slice(0, 10).replaceAll("-", "")}-${clientId.slice(-6)}`,
        currency: str(args.currency),
        issuedDate: normalizeDate(str(args.issued_date) || todayDate),
        dueDate: normalizeDate(str(args.due_date) || dueDate),
        ...(str(args.note) ? { note: str(args.note) } : {}),
    };
    const confirmation = maybeConfirm(ctx, "clockify_invoice_client_work", "billing_write", args, preview);
    if (confirmation) return confirmation;
    const invoice = await ctx.client.invoices.create(preview as never);
    const ids = { workspaceId: ctx.workspaceId, clientId, invoiceId: idOf(invoice) };
    return successResult("clockify_invoice_client_work", invoice, { workspaceId: ctx.workspaceId }, {
        entity: "invoice",
        ids,
        changed: { created: [ref("invoice", invoice, preview.number)] },
        warnings: [{ code: "invoice_has_no_items", message: "Invoice created with no line items. Add items manually if needed." }],
        next: [{ tool: "clockify_invoices_get", args: { invoiceId: ids.invoiceId }, reason: "Inspect the invoice draft." }],
    });
}

async function recordExpense(ctx: Context, args: AnyRecord) {
    const categoryId = str(args.category_id) || (str(args.category) ? await resolveExpenseCategoryId(ctx, str(args.category)) : "");
    if (!categoryId) throw new Error("missing required alternative: provide category or category_id");
    const projectId = str(args.project_id) || (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
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
    const confirmation = maybeConfirm(ctx, "clockify_record_expense", "expense_write", args, preview);
    if (confirmation) return confirmation;
    const expense = await ctx.client.expenses.create(preview as never);
    return successResult("clockify_record_expense", expense, { workspaceId: ctx.workspaceId }, {
        entity: "expense",
        ids: { workspaceId: ctx.workspaceId, expenseId: idOf(expense), categoryId, projectId, userId },
        changed: { created: [ref("expense", expense)] },
        next: [{ tool: "clockify_expenses_list", reason: "Verify the recorded expense in the expense list." }],
    });
}

async function requestTimeOff(ctx: Context, args: AnyRecord) {
    const policyId = str(args.policy_id) || (str(args.policy) ? await resolvePolicyId(ctx, str(args.policy)) : "");
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
    const confirmation = maybeConfirm(ctx, "clockify_request_time_off", "time_off_write", args, preview);
    if (confirmation) return confirmation;
    const request = await ctx.client.timeOff.submit(preview as never);
    return successResult("clockify_request_time_off", request, { workspaceId: ctx.workspaceId }, {
        entity: "time_off_request",
        ids: { workspaceId: ctx.workspaceId, requestId: idOf(request), policyId },
        changed: { created: [ref("time_off_request", request)] },
        next: [{ tool: "clockify_time_off_requests_list", reason: "Check the request status after submitting." }],
    });
}

async function scheduleWork(ctx: Context, args: AnyRecord) {
    const userId = str(args.user_id) || (str(args.user) ? await resolveUserId(ctx, str(args.user)) : "");
    const projectId = str(args.project_id) || (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    if (!userId) throw new Error("schedule_work needs a user: pass user_id or user");
    if (!projectId) throw new Error("schedule_work needs a project: pass project_id or project");
    const taskId = str(args.task_id) || (str(args.task) ? await resolveTaskId(ctx, projectId, str(args.task)) : "");
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
        ...(args.include_non_working_days !== undefined ? { includeNonWorkingDays: args.include_non_working_days } : {}),
    };
    const confirmation = maybeConfirm(ctx, "clockify_schedule_work", "scheduling_write", args, preview);
    if (confirmation) return confirmation;
    const assignment = await ctx.client.scheduling.create(preview as never);
    return successResult("clockify_schedule_work", assignment, { workspaceId: ctx.workspaceId }, {
        entity: "assignment",
        ids: { workspaceId: ctx.workspaceId, assignmentId: idOf(assignment), userId, projectId, taskId },
        changed: { created: [ref("assignment", assignment)] },
        next: [{ tool: "clockify_scheduling_assignments_list", reason: "Verify the scheduled assignment." }],
    });
}

async function setupWebhook(ctx: Context, args: AnyRecord) {
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
    if (triggerSourceType === "WORKSPACE_ID" && triggerSource.length === 0) triggerSource.push(ctx.workspaceId);
    const preview = {
        name: str(args.name),
        url: url.toString(),
        webhookEvent,
        triggerSourceType,
        triggerSource,
    };
    const confirmation = maybeConfirm(ctx, "clockify_setup_webhook", "external_side_effect", args, preview);
    if (confirmation) return confirmation;
    const webhook = await ctx.client.webhooks.create({ workspaceId: ctx.workspaceId, body: preview } as never);
    return successResult("clockify_setup_webhook", webhook, { workspaceId: ctx.workspaceId }, {
        entity: "webhook",
        ids: { workspaceId: ctx.workspaceId, webhookId: idOf(webhook) },
        changed: { created: [ref("webhook", webhook, preview.name)] },
        next: [{ tool: "clockify_webhooks_get", args: { webhookId: idOf(webhook) }, reason: "Inspect the webhook." }],
    });
}

async function demoSeed(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    const pkg = (await createWorkPackage(ctx, {
        client: `${prefix}-client`,
        project: `${prefix}-project`,
        task: `${prefix}-task`,
        tag: `${prefix}-tag`,
        upsert: args.upsert !== false,
    })).structuredContent as AnyRecord;
    const date = str(args.date) || "2026-01-02";
    const logged = (await logWork(ctx, {
        description: `${prefix}-entry`,
        start: `${date}T09:00:00.000Z`,
        end: `${date}T09:15:00.000Z`,
        project_id: (pkg.ids as AnyRecord)?.projectId,
        task_id: (pkg.ids as AnyRecord)?.taskId,
        tag_ids: (pkg.ids as AnyRecord)?.tagId ? [(pkg.ids as AnyRecord).tagId] : [],
        allow_overlap: true,
    })).structuredContent;
    return successResult("clockify_demo_seed", { package: pkg, entry: logged }, { workspaceId: ctx.workspaceId }, {
        entity: "demo",
        ids: (pkg.ids as Record<string, string>) ?? { workspaceId: ctx.workspaceId },
        changed: mergeChanged(pkg.changed as ChangeSet | undefined, (logged as AnyRecord).changed as ChangeSet | undefined),
        next: [{ tool: "clockify_demo_cleanup", args: { prefix }, reason: "Clean up deterministic demo objects." }],
    });
}

async function demoCleanup(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];
    const user = await ctx.client.users.getCurrentUser();
    const entries = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId: idOf(user),
        start: str(args.start) || "2026-01-01T00:00:00.000Z",
        end: str(args.end) || "2026-12-31T23:59:59.999Z",
        page: 1,
        "page-size": 200,
    } as never)) as AnyRecord[];
    for (const entry of entries.filter((item) => str(item.description).startsWith(prefix))) {
        await cleanupEntity("entry", entry, deleted, warnings, () =>
            ctx.client.timeEntries.delete({ workspaceId: ctx.workspaceId, timeEntryId: idOf(entry) } as never),
        );
    }

    const projects = prefixMatches(
        await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        } as never),
        prefix,
    );
    for (const project of projects) {
        const tasks = prefixMatches(
            await ctx.client.tasks.list({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                page: 1,
                "page-size": 200,
            } as never),
            prefix,
        );
        for (const task of tasks) {
            await cleanupEntity("task", task, deleted, warnings, () =>
                ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                } as never),
            );
        }
    }

    const tags = prefixMatches(
        await ctx.client.tags.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 } as never),
        prefix,
    );
    for (const tag of tags) {
        await cleanupEntity("tag", tag, deleted, warnings, () =>
            ctx.client.tags.delete({ workspaceId: ctx.workspaceId, tagId: idOf(tag) } as never),
        );
    }

    for (const project of projects) {
        await cleanupEntity("project", project, deleted, warnings, async () => {
            await ctx.client.projects.update({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                name: str(project.name),
                archived: true,
            } as never);
            await ctx.client.projects.delete({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
            } as never);
        });
    }

    const clients = prefixMatches(
        await ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        } as never),
        prefix,
    );
    for (const client of clients) {
        await cleanupEntity("client", client, deleted, warnings, async () => {
            await ctx.client.clients.update({
                workspaceId: ctx.workspaceId,
                clientId: idOf(client),
                body: { name: str(client.name), archived: true },
            } as never);
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: idOf(client),
            } as never);
        });
    }
    return successResult("clockify_demo_cleanup", { prefix, deleted: deleted.length }, { workspaceId: ctx.workspaceId }, {
        entity: "demo",
        ids: { workspaceId: ctx.workspaceId },
        changed: { deleted },
        warnings,
    });
}

async function cleanupEntity(
    type: string,
    value: AnyRecord,
    deleted: EntityRef[],
    warnings: Warning[],
    fn: () => Promise<unknown>,
): Promise<void> {
    const entity = ref(type, value);
    try {
        await fn();
        deleted.push(entity);
    } catch (err) {
        warnings.push({
            code: "cleanup_failed",
            message: `${type} ${entity.id || "(unknown)"}: ${String((err as Error).message ?? err)}`,
        });
    }
}

function prefixMatches(items: unknown, prefix: string): AnyRecord[] {
    return Array.isArray(items)
        ? (items as AnyRecord[]).filter((item) => str(item.name).startsWith(prefix))
        : [];
}

async function prepareEntryBody(ctx: Context, args: AnyRecord, requireEnd: boolean): Promise<AnyRecord> {
    let start = str(args.start);
    const end = str(args.end) || (requireEnd ? "" : undefined);
    const durationSeconds = typeof args.duration_seconds === "number" ? args.duration_seconds : args.durationSeconds;
    if (!start && typeof durationSeconds === "number") {
        const endMs = Date.parse(end || new Date().toISOString());
        if (Number.isNaN(endMs)) throw new Error("end is not a valid ISO 8601 timestamp");
        start = new Date(endMs - durationSeconds * 1000).toISOString();
    }
    if (!start) throw new Error("start is required for clockify_log_work; use duration_seconds with end or clockify_start_work for a running timer");
    if (requireEnd && !end) throw new Error("end is required for clockify_log_work; use clockify_start_work for a running timer");
    const projectId = str(args.project_id) || (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    const taskId = str(args.task_id) || (str(args.task) ? await resolveTaskId(ctx, projectId, str(args.task)) : "");
    const tagIds = [...arrayOfStrings(args.tag_ids)];
    if (str(args.tag)) tagIds.push(await resolveTagId(ctx, str(args.tag)));
    return {
        workspaceId: ctx.workspaceId,
        start,
        ...(end ? { end } : {}),
        description: str(args.description),
        ...(projectId ? { projectId } : {}),
        ...(taskId ? { taskId } : {}),
        ...(tagIds.length ? { tagIds } : {}),
        ...(args.billable !== undefined ? { billable: args.billable } : {}),
    };
}

// maybeConfirm delegates to the shared requireConfirmation guard so the
// workflow surface and the destructive domain delete tools run one
// implementation of the dry_run -> confirm_token handshake. Behaviour is
// byte-identical to the previous inline implementation.
function maybeConfirm(ctx: Context, toolName: string, riskClass: string, args: AnyRecord, preview: AnyRecord) {
    return requireConfirmation(ctx, toolName, riskClass, args, preview);
}

function defaultRecovery(action: string, args: AnyRecord): RecoveryHint {
    if (action.includes("create_work_package")) {
        return { hint: "List clients, projects, tasks, or tags, then retry with returned IDs or exact names.", tool: "clockify_tools_guide" };
    }
    if (/(log_work|start_work|stop_work|switch_work|fix_entry|review_day|review_week)/.test(action)) {
        return { hint: "Check entry, project, task, tag, and time fields; use returned IDs or exact names.", tool: "clockify_review_day" };
    }
    if (action.includes("invoice")) {
        return { hint: "If invoicing is unavailable, report that and continue. Otherwise list clients or invoices, then retry.", tool: "clockify_invoices_list" };
    }
    if (action.includes("expense")) {
        return { hint: "If expenses are unavailable, report that and continue. Otherwise list expense categories and retry.", tool: "clockify_expenses_categories_list" };
    }
    if (action.includes("time_off")) {
        return { hint: "If time off is unavailable, report that and continue. Otherwise list policies and retry.", tool: "clockify_time_off_policies_list" };
    }
    if (action === "clockify_schedule_work") {
        return { hint: "Verify project and user IDs, then retry. Scheduling can be plan or role gated.", tool: "clockify_projects_list" };
    }
    if (action.includes("webhook")) {
        return {
            hint: "Verify the HTTPS callback URL and event. If reusing a preview, run dry_run again for a fresh token.",
            tool: "clockify_setup_webhook",
            args: stripConfirmationArgs(args),
        };
    }
    return { hint: "Call clockify_status, then retry with IDs returned by previous calls.", tool: "clockify_status" };
}

function packageNext(projectId: string, taskId: string, tagIds: string[]): NextAction[] {
    const args = { project_id: projectId, ...(taskId ? { task_id: taskId } : {}), ...(tagIds.length ? { tag_ids: tagIds } : {}) };
    return [
        { tool: "clockify_log_work", args, reason: "Log finished work against this package." },
        { tool: "clockify_start_work", args, reason: "Start a timer against this package." },
    ];
}

async function findEntryForFix(ctx: Context, args: AnyRecord): Promise<AnyRecord> {
    if (str(args.entry_id)) {
        return (await ctx.client.timeEntries.get({ workspaceId: ctx.workspaceId, timeEntryId: str(args.entry_id) } as never)) as AnyRecord;
    }
    const user = await ctx.client.users.getCurrentUser();
    const entries = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId: idOf(user),
        start: str(args.start_after) || "1970-01-01T00:00:00.000Z",
        end: str(args.start_before) || new Date().toISOString(),
        page: 1,
        "page-size": 200,
    } as never)) as AnyRecord[];
    const matches = entries.filter((entry) => {
        const description = str(entry.description);
        if (str(args.exact_description) && description !== str(args.exact_description)) return false;
        if (str(args.description_contains) && !description.includes(str(args.description_contains))) return false;
        return true;
    });
    if (matches.length !== 1) throw new Error(`expected exactly one matching entry, found ${matches.length}; pass entry_id`);
    return matches[0]!;
}

function summarizeEntries(entries: AnyRecord[], args: AnyRecord) {
    const sorted = [...entries].sort((a, b) => Date.parse(entryStart(a)) - Date.parse(entryStart(b)));
    const issues: AnyRecord[] = [];
    let totalSeconds = 0;
    for (const entry of sorted) {
        const startMs = Date.parse(entryStart(entry));
        const endValue = entryEnd(entry);
        const endMs = endValue ? Date.parse(endValue) : Date.now();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) totalSeconds += Math.round((endMs - startMs) / 1000);
        if (!str(entry.description)) issues.push({ code: "missing_description", entry_id: idOf(entry) });
        if (!str(entry.projectId)) issues.push({ code: "missing_project", entry_id: idOf(entry) });
        if (!endValue) issues.push({ code: "running_entry", entry_id: idOf(entry) });
    }
    const maxRows = typeof args.max_rows === "number" && args.max_rows > 0 ? args.max_rows : 15;
    const suggestedActions = issues.slice(0, maxRows).map((issue) => ({
        tool: issue.code === "running_entry" ? "clockify_stop_work" : "clockify_fix_entry",
        args: issue.entry_id ? { entry_id: issue.entry_id } : undefined,
        reason: `Resolve ${issue.code}.`,
    }));
    return {
        totals: {
            entries: entries.length,
            seconds: totalSeconds,
            hours: Math.round((totalSeconds / 3600) * 100) / 100,
            runningEntries: issues.filter((issue) => issue.code === "running_entry").length,
        },
        issues: issues.slice(0, maxRows),
        suggestedActions,
        entries: args.include_entries ? sorted.slice(0, maxRows) : undefined,
    };
}

function dateRange(action: string, args: AnyRecord): { start: string; end: string } {
    if (str(args.start) && str(args.end)) return { start: str(args.start), end: str(args.end) };
    const raw = str(args.date) || str(args.week_start) || new Date().toISOString().slice(0, 10);
    const day = new Date(`${raw}T00:00:00.000Z`);
    if (action === "clockify_review_week") {
        const start = new Date(day);
        start.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 7);
        return { start: start.toISOString(), end: end.toISOString() };
    }
    const end = new Date(day);
    end.setUTCDate(day.getUTCDate() + 1);
    return { start: day.toISOString(), end: end.toISOString() };
}

async function resolveClientId(ctx: Context, value: string): Promise<string> {
    const listed = await ctx.client.clients.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "client")) ?? { id: value });
}

async function resolveProjectId(ctx: Context, value: string): Promise<string> {
    const listed = await ctx.client.projects.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "project")) ?? { id: value });
}

async function resolveTaskId(ctx: Context, projectId: string, value: string): Promise<string> {
    if (!projectId) throw new Error("project_id or project is required when resolving task by name");
    const listed = await ctx.client.tasks.list({ workspaceId: ctx.workspaceId, projectId, name: value, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "task")) ?? { id: value });
}

async function resolveTagId(ctx: Context, value: string): Promise<string> {
    const listed = await ctx.client.tags.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "tag")) ?? { id: value });
}

async function resolveExpenseCategoryId(ctx: Context, value: string): Promise<string> {
    const listed = await ctx.client.expenseCategories.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "expense category")) ?? { id: value });
}

async function resolvePolicyId(ctx: Context, value: string): Promise<string> {
    const listed = await ctx.client.timeOffPolicies.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 } as never);
    return idOf((await findOneByName(listed, value, "time-off policy")) ?? { id: value });
}

async function resolveUserId(ctx: Context, value: string): Promise<string> {
    const listed = (await ctx.client.users.findWorkspaceUsers({ workspaceId: ctx.workspaceId, name: value } as never)) as unknown[];
    const found = await findOneByName(listed, value, "user", ["name", "email"]);
    return idOf(found ?? { id: value });
}

async function findOneByName(items: unknown, name: string, label: string, keys = ["name"]): Promise<AnyRecord | null> {
    const rows = Array.isArray(items) ? items : [];
    const matches = rows.filter((item) => keys.some((key) => str((item as AnyRecord)[key]).toLowerCase() === name.toLowerCase())) as AnyRecord[];
    if (matches.length > 1) throw new Error(`multiple ${label}s match ${JSON.stringify(name)}; use an ID`);
    return matches[0] ?? null;
}

function entryIds(ctx: Context, entry: unknown, fallback: AnyRecord): Record<string, string | undefined> {
    const row = entry as AnyRecord;
    return {
        workspaceId: ctx.workspaceId,
        userId: str(row.userId) || str(fallback.userId),
        entryId: idOf(entry),
        projectId: str(row.projectId) || str(fallback.projectId),
        taskId: str(row.taskId) || str(fallback.taskId),
    };
}

function reviewArgsFromEntry(entry: unknown, fallback: AnyRecord): AnyRecord | undefined {
    const start = entryStart((entry as AnyRecord) ?? fallback) || str(fallback.start);
    return start ? { date: start.slice(0, 10) } : undefined;
}

function entryStart(entry: AnyRecord): string {
    return str(entry.start) || str((entry.timeInterval as AnyRecord | undefined)?.start);
}

function entryEnd(entry: AnyRecord): string {
    return str(entry.end) || str((entry.timeInterval as AnyRecord | undefined)?.end);
}

function normalizeDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

function ref(type: string, value: unknown, fallbackName?: string): EntityRef {
    const row = (value ?? {}) as AnyRecord;
    return { type, id: idOf(value), ...(str(row.name) || str(row.description) || fallbackName ? { name: str(row.name) || str(row.description) || fallbackName } : {}) };
}

function pushChanged(changed: ChangeSet, bucket: Bucket, value: EntityRef): void {
    if (!value.id) return;
    changed[bucket] ??= [];
    changed[bucket]!.push(value);
}

function mergeChanged(...sets: Array<ChangeSet | undefined>): ChangeSet {
    const out: ChangeSet = {};
    for (const set of sets) {
        if (!set) continue;
        for (const bucket of ["created", "updated", "deleted", "reused"] as const) {
            if (set[bucket]?.length) out[bucket] = [...(out[bucket] ?? []), ...set[bucket]!];
        }
    }
    return out;
}

function idOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return str((value as AnyRecord).id) || str((value as AnyRecord)._id);
}

function str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function arrayOfStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}
