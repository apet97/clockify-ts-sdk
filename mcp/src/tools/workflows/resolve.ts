import { leftBehindNote, runComposition, type CompositionStep } from "clockify-sdk-ts-115/compose";
import { resolveRelativeDay } from "clockify-sdk-ts-115/dates";
import { iterAll } from "clockify-sdk-ts-115/iter";
import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { looksLikeClockifyId, matchByName } from "clockify-sdk-ts-115/resolve";

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
    let projectId = str(args.project_id);
    let taskId = str(args.task_id);
    const tagIds = arrayOfStrings(args.tag_ids);
    const tags: unknown[] = [];

    // Build the create-or-reuse steps and run them transactionally: if a later
    // required step fails, the entities CREATED so far roll back (archive-first /
    // DONE-first, since active deletes 400) so a partial run never orphans.
    const steps: CompositionStep[] = [];

    if (!clientId && str(args.client)) {
        const clientName = str(args.client);
        steps.push({
            label: "client",
            required: false,
            run: async () => {
                const found = await findOneByName(
                    await ctx.client.clients.list({
                        workspaceId: ctx.workspaceId,
                        name: clientName,
                        page: 1,
                        "page-size": 200,
                    }),
                    clientName,
                    "client",
                );
                if (found && upsert) {
                    clientId = idOf(found);
                    data.client = found;
                    pushChanged(changed, "reused", ref("client", found));
                    return { kind: "done", reused: [ref("client", found)] };
                }
                const created = await ctx.client.clients.create({
                    workspaceId: ctx.workspaceId,
                    body: { name: clientName },
                });
                clientId = idOf(created);
                data.client = created;
                const r = ref("client", created, clientName);
                pushChanged(changed, "created", r);
                const cid = clientId;
                return {
                    kind: "done",
                    created: [r],
                    undo: async () => {
                        // active client delete 400s — archive (body envelope) then delete
                        await ctx.client.clients.update(
                            wireBody<ClockifyApi.UpdateClientsRequest>({
                                workspaceId: ctx.workspaceId,
                                clientId: cid,
                                body: { name: clientName, archived: true },
                            }),
                        );
                        await ctx.client.clients.delete({
                            workspaceId: ctx.workspaceId,
                            clientId: cid,
                        });
                    },
                };
            },
        });
    }

    steps.push({
        label: "project",
        required: true,
        run: async () => {
            if (projectId) return { kind: "done" }; // supplied by id — neither created nor reused
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
                return { kind: "done", reused: [ref("project", found)] };
            }
            const created = await ctx.client.projects.create({
                workspaceId: ctx.workspaceId,
                name: projectName,
                ...(clientId ? { clientId } : {}),
                ...(args.color ? { color: args.color } : {}),
                ...(args.billable !== undefined ? { billable: args.billable } : {}),
                ...(args.is_public !== undefined ? { isPublic: args.is_public } : {}),
                // KEEP as never: workflow project setup uses validated flat create fields.
            } as never);
            projectId = idOf(created);
            data.project = created;
            const r = ref("project", created, projectName);
            pushChanged(changed, "created", r);
            const pid = projectId;
            return {
                kind: "done",
                created: [r],
                undo: async () => {
                    // active project delete 400s — archive then delete
                    await ctx.client.projects.update({
                        workspaceId: ctx.workspaceId,
                        projectId: pid,
                        name: projectName,
                        archived: true,
                    });
                    await ctx.client.projects.delete({
                        workspaceId: ctx.workspaceId,
                        projectId: pid,
                    });
                },
            };
        },
    });

    if (!taskId && str(args.task)) {
        const taskName = str(args.task);
        // required: an explicitly-requested task that can't be created rolls back the
        // created client/project rather than leaving a half-built package behind.
        steps.push({
            label: "task",
            required: true,
            run: async () => {
                const listed = await ctx.client.tasks.list({
                    workspaceId: ctx.workspaceId,
                    projectId,
                    name: taskName,
                    page: 1,
                    "page-size": 200,
                });
                const found = await findOneByName(listed, taskName, "task");
                if (found && upsert) {
                    taskId = idOf(found);
                    data.task = found;
                    pushChanged(changed, "reused", ref("task", found));
                    return { kind: "done", reused: [ref("task", found)] };
                }
                const created = await ctx.client.tasks.create({
                    workspaceId: ctx.workspaceId,
                    projectId,
                    name: taskName,
                });
                taskId = idOf(created);
                data.task = created;
                const r = ref("task", created, taskName);
                pushChanged(changed, "created", r);
                const tid = taskId;
                const pid = projectId;
                return {
                    kind: "done",
                    created: [r],
                    undo: async () => {
                        // active task delete 400s — mark DONE then delete
                        await ctx.client.tasks.update(
                            wireBody<ClockifyApi.UpdateTasksRequest>({
                                workspaceId: ctx.workspaceId,
                                projectId: pid,
                                taskId: tid,
                                status: "DONE",
                            }),
                        );
                        await ctx.client.tasks.delete({
                            workspaceId: ctx.workspaceId,
                            projectId: pid,
                            taskId: tid,
                        });
                    },
                };
            },
        });
    }

    const tagNames = [...arrayOfStrings(args.tags), ...(str(args.tag) ? [str(args.tag)] : [])];
    for (const name of tagNames) {
        // best-effort: a tag is decorative — a tag failure warns, it never nukes the package.
        steps.push({
            label: `tag:${name}`,
            required: false,
            run: async () => {
                const found = await findOneByName(
                    await ctx.client.tags.list({
                        workspaceId: ctx.workspaceId,
                        name,
                        page: 1,
                        "page-size": 200,
                    }),
                    name,
                    "tag",
                );
                if (found && upsert) {
                    tagIds.push(idOf(found));
                    tags.push(found);
                    pushChanged(changed, "reused", ref("tag", found));
                    return { kind: "done", reused: [ref("tag", found)] };
                }
                const created = await ctx.client.tags.create({
                    workspaceId: ctx.workspaceId,
                    name,
                });
                tagIds.push(idOf(created));
                tags.push(created);
                const r = ref("tag", created, name);
                pushChanged(changed, "created", r);
                const tagId = idOf(created);
                return {
                    kind: "done",
                    created: [r],
                    undo: async () => {
                        await ctx.client.tags.delete({ workspaceId: ctx.workspaceId, tagId });
                    },
                };
            },
        });
    }

    const outcome = await runComposition(steps);
    if (outcome.status.kind === "failed") {
        throw new Error(
            `create_work_package failed at ${outcome.status.label}: ${outcome.status.message}. ${leftBehindNote(outcome.status.rollbackWarnings)}`,
        );
    }

    if (clientId) ids.clientId = clientId;
    ids.projectId = projectId;
    if (taskId) ids.taskId = taskId;
    if (tagIds.length === 1) ids.tagId = tagIds[0];
    if (tagIds.length > 0) data.tagIds = tagIds;
    if (tags.length > 0) data.tags = tags;

    const next = packageNext(projectId, taskId, tagIds);
    if (outcome.warnings.length > 0) {
        return successResult(
            "clockify_create_work_package",
            data,
            { workspaceId: ctx.workspaceId },
            {
                entity: "work_package",
                ids,
                changed,
                warnings: outcome.warnings,
                next,
            },
        );
    }
    return successResult(
        "clockify_create_work_package",
        data,
        { workspaceId: ctx.workspaceId },
        {
            entity: "work_package",
            ids,
            changed,
            next,
        },
    );
}

export function maybeConfirm(
    ctx: Context,
    toolName: string,
    riskClass: string,
    args: AnyRecord,
    preview: AnyRecord,
) {
    return requireConfirmation(ctx, toolName, riskClass, args, preview);
}

export function defaultRecovery(action: string, args: AnyRecord): RecoveryHint {
    if (action.includes("create_work_package")) {
        return {
            hint: "List clients, projects, tasks, or tags, then retry with returned IDs or exact names.",
            tool: "clockify_tools_guide",
        };
    }
    if (
        /(log_work|start_work|stop_work|switch_work|fix_entry|review_day|review_week)/.test(action)
    ) {
        return {
            hint: "Check entry, project, task, tag, and time fields; use returned IDs or exact names.",
            tool: "clockify_review_day",
        };
    }
    if (action.includes("invoice")) {
        return {
            hint: "If invoicing is unavailable, report that and continue. Otherwise list clients or invoices, then retry.",
            tool: "clockify_invoices_list",
        };
    }
    if (action.includes("expense")) {
        return {
            hint: "If expenses are unavailable, report that and continue. Otherwise list expense categories and retry.",
            tool: "clockify_expenses_categories_list",
        };
    }
    if (action.includes("time_off")) {
        return {
            hint: "If time off is unavailable, report that and continue. Otherwise list policies and retry.",
            tool: "clockify_time_off_policies_list",
        };
    }
    if (action === "clockify_schedule_work") {
        return {
            hint: "Verify project and user IDs, then retry. Scheduling can be plan or role gated.",
            tool: "clockify_projects_list",
        };
    }
    if (action.includes("webhook")) {
        return {
            hint: "Verify the HTTPS callback URL and event. If reusing a preview, run dry_run again for a fresh token.",
            tool: "clockify_setup_webhook",
            args: stripConfirmationArgs(args),
        };
    }
    return {
        hint: "Call clockify_status, then retry with IDs returned by previous calls.",
        tool: "clockify_status",
    };
}

function packageNext(projectId: string, taskId: string, tagIds: string[]): NextAction[] {
    const args = {
        project_id: projectId,
        ...(taskId ? { task_id: taskId } : {}),
        ...(tagIds.length ? { tag_ids: tagIds } : {}),
    };
    return [
        { tool: "clockify_log_work", args, reason: "Log finished work against this package." },
        { tool: "clockify_start_work", args, reason: "Start a timer against this package." },
    ];
}

export async function findEntryForFix(ctx: Context, args: AnyRecord): Promise<AnyRecord> {
    if (str(args.entry_id)) {
        return (await ctx.client.timeEntries.get({
            workspaceId: ctx.workspaceId,
            timeEntryId: str(args.entry_id),
        })) as AnyRecord;
    }
    const user = await ctx.client.users.getCurrentUser();
    // Walk ALL pages: a real entry past row 200 must still be findable,
    // otherwise the exactly-one assertion below fails with "found 0" or
    // matches a stale duplicate. iterAll honors the Last-Page header.
    const entries: AnyRecord[] = [];
    for await (const entry of iterAll<AnyRecord, AnyRecord>(
        // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        (req) => ctx.client.timeEntries.listForUser(req as never) as never,
        {
            workspaceId: ctx.workspaceId,
            userId: idOf(user),
            start: str(args.start_after) || "1970-01-01T00:00:00.000Z",
            end: str(args.start_before) || new Date().toISOString(),
        },
        { pageSize: 200 },
    )) {
        entries.push(entry);
    }
    const matches = entries.filter((entry) => {
        const description = str(entry.description);
        if (str(args.exact_description) && description !== str(args.exact_description))
            return false;
        if (str(args.description_contains) && !description.includes(str(args.description_contains)))
            return false;
        return true;
    });
    if (matches.length !== 1)
        throw new Error(
            `expected exactly one matching entry, found ${matches.length}; pass entry_id`,
        );
    return matches[0]!;
}

export function summarizeEntries(entries: AnyRecord[], args: AnyRecord) {
    const sorted = [...entries].sort(
        (a, b) => Date.parse(entryStart(a)) - Date.parse(entryStart(b)),
    );
    const issues: Array<{ code: string; entry_id?: string }> = [];
    let totalSeconds = 0;
    for (const entry of sorted) {
        const startMs = Date.parse(entryStart(entry));
        const endValue = entryEnd(entry);
        const endMs = endValue ? Date.parse(endValue) : Date.now();
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs)
            totalSeconds += Math.round((endMs - startMs) / 1000);
        if (!str(entry.description))
            issues.push({ code: "missing_description", entry_id: idOf(entry) });
        if (!str(entry.projectId)) issues.push({ code: "missing_project", entry_id: idOf(entry) });
        if (!endValue) issues.push({ code: "running_entry", entry_id: idOf(entry) });
    }
    const maxRows = typeof args.max_rows === "number" && args.max_rows > 0 ? args.max_rows : 15;
    const suggestedActions = issues.slice(0, maxRows).map((issue) => ({
        tool: issue.code === "running_entry" ? "clockify_stop_work" : "clockify_fix_entry",
        ...(issue.entry_id ? { args: { entry_id: issue.entry_id } } : {}),
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
    if (str(args.start) && str(args.end)) {
        // Validate the explicit range the same way the single-date path
        // does, instead of letting a date-only or malformed value reach
        // the wire as an opaque 400. normalizeDate widens "YYYY-MM-DD" to
        // a full ISO instant.
        const start = normalizeDate(str(args.start));
        const end = normalizeDate(str(args.end));
        for (const [field, value] of [
            ["start", start],
            ["end", end],
        ] as const) {
            if (Number.isNaN(Date.parse(value))) {
                throw new Error(
                    `invalid ${field} ${JSON.stringify(value)}; use YYYY-MM-DD or an ISO 8601 timestamp`,
                );
            }
        }
        return { start, end };
    }
    const rawInput = str(args.date) || str(args.week_start);
    // Resolve relative words ("yesterday", "last monday") + YYYY-MM-DD server-side;
    // an empty input means today.
    const raw =
        (resolveRelativeDay(new Date(), rawInput ? { date: rawInput } : {}) ?? rawInput) ||
        new Date().toISOString().slice(0, 10);
    const day = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(day.getTime())) {
        // Reject unparseable input with a clear, field-named message instead of
        // letting `.toISOString()` throw an opaque "Invalid time value" RangeError.
        // The "invalid" wording keeps the receipt's stable error code at invalid_request.
        const field = str(args.date) ? "date" : "week_start";
        throw new Error(
            `invalid ${field} ${JSON.stringify(rawInput)}; use YYYY-MM-DD or a relative day like "yesterday" or "last monday"`,
        );
    }
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
    return new Error(
        `no ${noun} named ${JSON.stringify(value)}; pass a 24-character id or an exact name`,
    );
}

/**
 * Shared body for the per-entity name→id resolvers: id-passthrough → list →
 * match-by-name → throw. `keys` defaults to `["name"]`; an ambiguous match throws
 * AmbiguousNameError (→ clarification receipt) and a miss throws notFound. The
 * `list` thunk is only invoked for a name (a 24-hex id short-circuits first).
 */
async function resolveByName(
    value: string,
    label: string,
    list: () => Promise<unknown>,
    keys?: string[],
): Promise<string> {
    if (looksLikeClockifyId(value)) return value;
    const found = await findOneByName(await list(), value, label, keys);
    if (!found) throw notFound(label, value);
    return idOf(found);
}

export function resolveClientId(ctx: Context, value: string): Promise<string> {
    return resolveByName(value, "client", () =>
        ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            name: value,
            page: 1,
            "page-size": 200,
        }),
    );
}

export function resolveProjectId(ctx: Context, value: string): Promise<string> {
    return resolveByName(value, "project", () =>
        ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            name: value,
            page: 1,
            "page-size": 200,
        }),
    );
}

export function resolveTaskId(ctx: Context, projectId: string, value: string): Promise<string> {
    if (!projectId)
        throw new Error("project_id or project is required when resolving task by name");
    return resolveByName(value, "task", () =>
        ctx.client.tasks.list({
            workspaceId: ctx.workspaceId,
            projectId,
            name: value,
            page: 1,
            "page-size": 200,
        }),
    );
}

export function resolveTagId(ctx: Context, value: string): Promise<string> {
    return resolveByName(value, "tag", () =>
        ctx.client.tags.list({
            workspaceId: ctx.workspaceId,
            name: value,
            page: 1,
            "page-size": 200,
        }),
    );
}

export function resolveExpenseCategoryId(ctx: Context, value: string): Promise<string> {
    return resolveByName(value, "expense category", () =>
        // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        ctx.client.expenseCategories.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        } as never),
    );
}

export function resolvePolicyId(ctx: Context, value: string): Promise<string> {
    return resolveByName(value, "time-off policy", () =>
        // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        ctx.client.timeOffPolicies.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            // KEEP as never: generated list/search/view request or response envelope does not match this wire shape.
        } as never),
    );
}

export function resolveUserId(ctx: Context, value: string): Promise<string> {
    return resolveByName(
        value,
        "user",
        () =>
            ctx.client.users.list({
                workspaceId: ctx.workspaceId,
                name: value,
                "include-roles": false,
            }),
        ["name", "email"],
    );
}

/**
 * Thrown when a name matches more than one entity. Carries the real candidate
 * ids so `runWorkflow` can surface a grounded `clarification` receipt (a "did you
 * mean?" success envelope) instead of a dead-end error. The caller re-invokes with
 * the chosen id rather than guessing a name.
 */
export class AmbiguousNameError extends Error {
    readonly field: string;
    readonly value: string;
    readonly candidates: EntityRef[];

    constructor(label: string, value: string, candidates: EntityRef[]) {
        super(`multiple ${label}s match ${JSON.stringify(value)}; use an ID`);
        this.name = "AmbiguousNameError";
        this.field = label;
        this.value = value;
        this.candidates = candidates;
        Object.setPrototypeOf(this, AmbiguousNameError.prototype);
    }
}

async function findOneByName(
    items: unknown,
    name: string,
    label: string,
    keys = ["name"],
): Promise<AnyRecord | null> {
    // Match through the SDK's canonical matchByName so name-matching semantics
    // (case-insensitive exact, multi-key) live in ONE place across the SDK, CLI, and
    // MCP — no parallel matcher to drift. includeArchived:true preserves this path's
    // prior no-archived-filter behavior (the name-filtered lists are active-only anyway).
    const rows = (Array.isArray(items) ? items : []) as Array<{ name: string; archived?: boolean }>;
    const match = matchByName(rows, name, { includeArchived: true, matchKeys: keys });
    if (match.kind === "many") {
        throw new AmbiguousNameError(
            label,
            name,
            match.matches.map((m) => ref(label, m)),
        );
    }
    return match.kind === "one" ? match.entity : null;
}

export function entryIds(
    ctx: Context,
    entry: unknown,
    fallback: AnyRecord,
): Record<string, string | undefined> {
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

function entryStart(entry: AnyRecord): string {
    return str(entry.start) || str((entry.timeInterval as AnyRecord | undefined)?.start);
}

function entryEnd(entry: AnyRecord): string {
    return str(entry.end) || str((entry.timeInterval as AnyRecord | undefined)?.end);
}

export function normalizeDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
}

export function ref(type: string, value: unknown, fallbackName?: string): EntityRef {
    const row = (value ?? {}) as AnyRecord;
    const name = str(row.name) || str(row.description) || fallbackName;
    return { type, id: idOf(value), ...(name ? { name } : {}) };
}

function pushChanged(changed: ChangeSet, bucket: Bucket, value: EntityRef): void {
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
    return Array.isArray(value)
        ? value
              .filter((item): item is string => typeof item === "string" && item.trim() !== "")
              .map((item) => item.trim())
        : [];
}
