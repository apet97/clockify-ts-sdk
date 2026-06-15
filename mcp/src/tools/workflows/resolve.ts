import { resolveRelativeDay } from "clockify-sdk-ts-115/dates";
import { looksLikeClockifyId } from "clockify-sdk-ts-115/resolve";

import { requireConfirmation, stripConfirmationArgs } from "../../orchestration/confirm-guard.js";
import { successResult } from "../../result.js";

import type { AnyRecord, Bucket, ChangeSet, EntityRef, NextAction, RecoveryHint } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

export async function createWorkPackage(ctx: Context, args: AnyRecord) {
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
            }),
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
            });
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
        });
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
        });
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
            });
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
            await ctx.client.tags.list({ workspaceId: ctx.workspaceId, name, page: 1, "page-size": 200 }),
            name,
            "tag",
        );
        if (found && upsert) {
            tagIds.push(idOf(found));
            tags.push(found);
            pushChanged(changed, "reused", ref("tag", found));
        } else {
            const created = await ctx.client.tags.create({ workspaceId: ctx.workspaceId, name });
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

export function maybeConfirm(ctx: Context, toolName: string, riskClass: string, args: AnyRecord, preview: AnyRecord) {
    return requireConfirmation(ctx, toolName, riskClass, args, preview);
}

export function defaultRecovery(action: string, args: AnyRecord): RecoveryHint {
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

export function packageNext(projectId: string, taskId: string, tagIds: string[]): NextAction[] {
    const args = { project_id: projectId, ...(taskId ? { task_id: taskId } : {}), ...(tagIds.length ? { tag_ids: tagIds } : {}) };
    return [
        { tool: "clockify_log_work", args, reason: "Log finished work against this package." },
        { tool: "clockify_start_work", args, reason: "Start a timer against this package." },
    ];
}

export async function findEntryForFix(ctx: Context, args: AnyRecord): Promise<AnyRecord> {
    if (str(args.entry_id)) {
        return (await ctx.client.timeEntries.get({ workspaceId: ctx.workspaceId, timeEntryId: str(args.entry_id) })) as AnyRecord;
    }
    const user = await ctx.client.users.getCurrentUser();
    const entries = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId: idOf(user),
        start: str(args.start_after) || "1970-01-01T00:00:00.000Z",
        end: str(args.start_before) || new Date().toISOString(),
        page: 1,
        "page-size": 200,
    })) as AnyRecord[];
    const matches = entries.filter((entry) => {
        const description = str(entry.description);
        if (str(args.exact_description) && description !== str(args.exact_description)) return false;
        if (str(args.description_contains) && !description.includes(str(args.description_contains))) return false;
        return true;
    });
    if (matches.length !== 1) throw new Error(`expected exactly one matching entry, found ${matches.length}; pass entry_id`);
    return matches[0]!;
}

export function summarizeEntries(entries: AnyRecord[], args: AnyRecord) {
    const sorted = [...entries].sort((a, b) => Date.parse(entryStart(a)) - Date.parse(entryStart(b)));
    const issues: Array<{ code: string; entry_id?: string }> = [];
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

export function dateRange(action: string, args: AnyRecord): { start: string; end: string } {
    if (str(args.start) && str(args.end)) return { start: str(args.start), end: str(args.end) };
    const rawInput = str(args.date) || str(args.week_start);
    // Resolve relative words ("yesterday", "last monday") + YYYY-MM-DD server-side;
    // an empty input means today. Unparseable input falls through unchanged.
    const raw = (resolveRelativeDay(new Date(), { date: rawInput || undefined }) ?? rawInput) || new Date().toISOString().slice(0, 10);
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

/**
 * Resolve a name to an id, or throw. A 24-hex value is trusted as an id (the
 * happy path, no list call). Otherwise the name is matched (case-insensitive via
 * findOneByName); a miss THROWS rather than shipping the unverified name to the
 * wire as an id — the old `?? { id: value }` fallback 404'd at best and could hit
 * a different entity at worst.
 */
function notFound(noun: string, value: string): Error {
    return new Error(`no ${noun} named ${JSON.stringify(value)}; pass a 24-character id or an exact name`);
}

export async function resolveClientId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.clients.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 });
    const found = await findOneByName(listed, value, "client");
    if (!found) throw notFound("client", value);
    return idOf(found);
}

export async function resolveProjectId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.projects.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 });
    const found = await findOneByName(listed, value, "project");
    if (!found) throw notFound("project", value);
    return idOf(found);
}

export async function resolveTaskId(ctx: Context, projectId: string, value: string): Promise<string> {
    if (!projectId) throw new Error("project_id or project is required when resolving task by name");
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.tasks.list({ workspaceId: ctx.workspaceId, projectId, name: value, page: 1, "page-size": 200 });
    const found = await findOneByName(listed, value, "task");
    if (!found) throw notFound("task", value);
    return idOf(found);
}

export async function resolveTagId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.tags.list({ workspaceId: ctx.workspaceId, name: value, page: 1, "page-size": 200 });
    const found = await findOneByName(listed, value, "tag");
    if (!found) throw notFound("tag", value);
    return idOf(found);
}

export async function resolveExpenseCategoryId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.expenseCategories.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 } as never);
    const found = await findOneByName(listed, value, "expense category");
    if (!found) throw notFound("expense category", value);
    return idOf(found);
}

export async function resolvePolicyId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = await ctx.client.timeOffPolicies.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 } as never);
    const found = await findOneByName(listed, value, "time-off policy");
    if (!found) throw notFound("time-off policy", value);
    return idOf(found);
}

export async function resolveUserId(ctx: Context, value: string): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const listed = (await ctx.client.users.list({ workspaceId: ctx.workspaceId, name: value, "include-roles": false })) as unknown[];
    const found = await findOneByName(listed, value, "user", ["name", "email"]);
    if (!found) throw notFound("user", value);
    return idOf(found);
}

export async function findOneByName(items: unknown, name: string, label: string, keys = ["name"]): Promise<AnyRecord | null> {
    const rows = Array.isArray(items) ? items : [];
    const matches = rows.filter((item) => keys.some((key) => str((item as AnyRecord)[key]).toLowerCase() === name.toLowerCase())) as AnyRecord[];
    if (matches.length > 1) throw new Error(`multiple ${label}s match ${JSON.stringify(name)}; use an ID`);
    return matches[0] ?? null;
}

export function entryIds(ctx: Context, entry: unknown, fallback: AnyRecord): Record<string, string | undefined> {
    const row = entry as AnyRecord;
    return {
        workspaceId: ctx.workspaceId,
        userId: str(row.userId) || str(fallback.userId),
        entryId: idOf(entry),
        projectId: str(row.projectId) || str(fallback.projectId),
        taskId: str(row.taskId) || str(fallback.taskId),
    };
}

export function reviewArgsFromEntry(entry: unknown, fallback: AnyRecord): AnyRecord | undefined {
    const start = entryStart((entry as AnyRecord) ?? fallback) || str(fallback.start);
    return start ? { date: start.slice(0, 10) } : undefined;
}

export function entryStart(entry: AnyRecord): string {
    return str(entry.start) || str((entry.timeInterval as AnyRecord | undefined)?.start);
}

export function entryEnd(entry: AnyRecord): string {
    return str(entry.end) || str((entry.timeInterval as AnyRecord | undefined)?.end);
}

export function normalizeDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

export function ref(type: string, value: unknown, fallbackName?: string): EntityRef {
    const row = (value ?? {}) as AnyRecord;
    return { type, id: idOf(value), ...(str(row.name) || str(row.description) || fallbackName ? { name: str(row.name) || str(row.description) || fallbackName } : {}) };
}

export function pushChanged(changed: ChangeSet, bucket: Bucket, value: EntityRef): void {
    if (!value.id) return;
    changed[bucket] ??= [];
    changed[bucket].push(value);
}

export function mergeChanged(...sets: Array<ChangeSet | undefined>): ChangeSet {
    const out: ChangeSet = {};
    for (const set of sets) {
        if (!set) continue;
        for (const bucket of ["created", "updated", "deleted", "reused"] as const) {
            if (set[bucket]?.length) out[bucket] = [...(out[bucket] ?? []), ...set[bucket]];
        }
    }
    return out;
}

export function idOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return "";
    return str((value as AnyRecord).id) || str((value as AnyRecord)._id);
}

export function str(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function arrayOfStrings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim()) : [];
}
