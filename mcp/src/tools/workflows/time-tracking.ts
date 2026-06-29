import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { successResult } from "../../result.js";
import { stopRunningTimer } from "../timer-stop.js";

import {
    AmbiguousNameError,
    arrayOfStrings,
    entryIds,
    findEntryForFix,
    idOf,
    ref,
    resolveProjectId,
    resolveTagId,
    resolveTaskId,
    reviewArgsFromEntry,
    str,
} from "./resolve.js";
import type { AnyRecord, ChangeSet, Warning } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

export function timeEntryInputSchema({ finished }: { finished: boolean }) {
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
    }
    return schema;
}

export async function logWork(ctx: Context, args: AnyRecord) {
    const body = await prepareEntryBody(ctx, args, true);
    const entry = await ctx.client.timeEntries.create(
        wireBody<ClockifyApi.CreateTimeEntryRequest>(body),
    );
    const ids = entryIds(ctx, entry, body);
    const reviewArgs = reviewArgsFromEntry(entry, body);
    return successResult(
        "clockify_log_work",
        entry,
        { workspaceId: ctx.workspaceId },
        {
            entity: "entry",
            ids,
            changed: { created: [ref("entry", entry, str(body.description))] },
            next: [
                {
                    tool: "clockify_review_day",
                    ...(reviewArgs ? { args: reviewArgs } : {}),
                    reason: "Review the day after logging work.",
                },
                {
                    tool: "clockify_fix_entry",
                    args: { entry_id: ids.entryId },
                    reason: "Adjust this entry if any details are wrong.",
                },
            ],
        },
    );
}

export async function startWork(ctx: Context, args: AnyRecord) {
    const startWasDefaulted = !str(args.start);
    const body = await prepareEntryBody(
        ctx,
        { ...args, start: str(args.start) || new Date().toISOString() },
        false,
    );
    const entry = await ctx.client.timeEntries.create(
        wireBody<ClockifyApi.CreateTimeEntryRequest>(body),
    );
    const ids = entryIds(ctx, entry, body);
    return successResult(
        "clockify_start_work",
        entry,
        {
            workspaceId: ctx.workspaceId,
            ...(startWasDefaulted ? { startWasDefaulted: true, resolvedStart: body.start } : {}),
        },
        {
            entity: "entry",
            ids,
            changed: { created: [ref("entry", entry, str(body.description))] },
            next: [
                {
                    tool: "clockify_stop_work",
                    reason: "Stop this timer when the work session is finished.",
                },
                {
                    tool: "clockify_switch_work",
                    reason: "Switch to another work item without manually stopping first.",
                },
            ],
        },
    );
}

export async function stopWork(ctx: Context, args: AnyRecord) {
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());
    const outcome = await stopRunningTimer(ctx, userId, str(args.end) || new Date().toISOString());
    if (!outcome.running) {
        return successResult(
            "clockify_stop_work",
            { stopped: false, reason: "no timer running" },
            { workspaceId: ctx.workspaceId, userId },
            { entity: "entry", ids: { workspaceId: ctx.workspaceId, userId } },
        );
    }
    const entry = outcome.entry;
    const ids = entryIds(ctx, entry, { userId });
    return successResult(
        "clockify_stop_work",
        entry,
        { workspaceId: ctx.workspaceId, userId },
        {
            entity: "entry",
            ids,
            changed: { updated: [ref("entry", entry)] },
            next: [{ tool: "clockify_review_day", reason: "Review the day after stopping work." }],
        },
    );
}

export async function switchWork(ctx: Context, args: AnyRecord) {
    const warnings: Warning[] = [];
    let stopped: unknown = null;
    try {
        stopped = (await stopWork(ctx, {})).structuredContent;
    } catch {
        warnings.push({
            code: "stop_failed",
            message: "Could not stop the existing timer; attempting to start the new one.",
        });
    }
    let started: AnyRecord;
    try {
        started = (await startWork(ctx, args)).structuredContent as AnyRecord;
    } catch (err) {
        // An ambiguous/unknown project/task/tag name must still surface the grounded
        // clarification receipt (runWorkflow turns this throw into one), so let it through.
        if (err instanceof AmbiguousNameError) throw err;
        // The stop already ran above. Re-throw with that fact in the message so the
        // failure never silently hides that the previous timer is already stopped.
        const stopNote =
            stopped === null
                ? "could not stop the previous timer"
                : (stopped as { stopped?: boolean }).stopped === false
                  ? "no timer was running"
                  : "the previous timer was stopped";
        throw new Error(
            `switch_work: ${stopNote}, but starting the new timer failed: ${(err as Error).message}`,
        );
    }
    return successResult(
        "clockify_switch_work",
        { status: "ok", stopped, started },
        { workspaceId: ctx.workspaceId },
        {
            entity: "entry",
            ids: (started.ids as Record<string, string>) ?? { workspaceId: ctx.workspaceId },
            changed: { created: (started.changed as ChangeSet | undefined)?.created ?? [] },
            warnings,
            next: [
                {
                    tool: "clockify_stop_work",
                    reason: "Stop the newly started timer when finished.",
                },
            ],
        },
    );
}

export async function fixEntry(ctx: Context, args: AnyRecord) {
    const entry = await findEntryForFix(ctx, args);
    const entryId = idOf(entry);
    const projectId =
        str(args.project_id) ||
        (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    // Scope task resolution to the resolved project, falling back to the
    // entry's existing project, so a task name resolves correctly and the
    // PUT-replace update doesn't leave a stale task pointer.
    const taskScopeProjectId = projectId || str(entry.projectId);
    const taskId =
        str(args.task_id) ||
        (str(args.task) ? await resolveTaskId(ctx, taskScopeProjectId, str(args.task)) : "");
    const tagIds = [...arrayOfStrings(args.tag_ids)];
    if (str(args.tag)) tagIds.push(await resolveTagId(ctx, str(args.tag)));
    const ivl = (entry.timeInterval ?? {}) as AnyRecord;
    const body: AnyRecord = {
        workspaceId: ctx.workspaceId,
        timeEntryId: entryId,
        start: str(args.start) || str(entry.start) || str(ivl.start),
    };
    const nextDescription = str(args.new_description) || str(args.description);
    // timeEntries.update is a PUT-replace: every omitted field is wiped on the
    // live wire. Preserve each existing field from the already-fetched entry,
    // overriding only when args supply a value (mirrors how `start` is handled).
    body.description = nextDescription || str(entry.description);
    const nextEnd = str(args.end) || str(entry.end) || str(ivl.end);
    if (nextEnd) body.end = nextEnd; // omit only for a genuine running timer (no existing end)
    const nextProjectId = projectId || str(entry.projectId);
    if (nextProjectId) body.projectId = nextProjectId;
    const nextTaskId = taskId || str(entry.taskId);
    if (nextTaskId) body.taskId = nextTaskId;
    const nextTagIds = tagIds.length ? tagIds : arrayOfStrings(entry.tagIds);
    if (nextTagIds.length) body.tagIds = nextTagIds;
    body.billable = args.billable !== undefined ? args.billable : entry.billable === true;
    if (!body.start) throw new Error("entry start is required to update this time entry");
    const { workspaceId, timeEntryId, ...updateBody } = body;
    const updated = await ctx.client.timeEntries.update(
        wireBody<ClockifyApi.UpdateTimeEntriesRequest>({
            workspaceId,
            timeEntryId,
            body: updateBody,
        }),
    );
    const ids = entryIds(ctx, updated, body);
    const reviewArgs = reviewArgsFromEntry(updated, body);
    return successResult(
        "clockify_fix_entry",
        updated,
        { workspaceId: ctx.workspaceId },
        {
            entity: "entry",
            ids,
            changed: { updated: [ref("entry", updated, nextDescription)] },
            next: [
                {
                    tool: "clockify_review_day",
                    ...(reviewArgs ? { args: reviewArgs } : {}),
                    reason: "Review the affected day.",
                },
            ],
        },
    );
}

export async function prepareEntryBody(
    ctx: Context,
    args: AnyRecord,
    requireEnd: boolean,
): Promise<AnyRecord> {
    let start = str(args.start);
    const end = str(args.end) || (requireEnd ? "" : undefined);
    const durationSeconds =
        typeof args.duration_seconds === "number" ? args.duration_seconds : args.durationSeconds;
    if (!start && typeof durationSeconds === "number") {
        const endMs = Date.parse(end || new Date().toISOString());
        if (Number.isNaN(endMs)) throw new Error("end is not a valid ISO 8601 timestamp");
        start = new Date(endMs - durationSeconds * 1000).toISOString();
    }
    if (!start)
        throw new Error(
            "start is required for clockify_log_work; use duration_seconds with end or clockify_start_work for a running timer",
        );
    if (requireEnd && !end)
        throw new Error(
            "end is required for clockify_log_work; use clockify_start_work for a running timer",
        );
    // Validate any explicit end (the duration branch above only checks it
    // when start is derived); an unparseable end with a supplied start
    // otherwise reaches the wire as an opaque 400.
    if (typeof end === "string" && end && Number.isNaN(Date.parse(end))) {
        throw new Error(`end ${JSON.stringify(end)} is not a valid ISO 8601 timestamp`);
    }
    const projectId =
        str(args.project_id) ||
        (str(args.project) ? await resolveProjectId(ctx, str(args.project)) : "");
    const taskId =
        str(args.task_id) ||
        (str(args.task) ? await resolveTaskId(ctx, projectId, str(args.task)) : "");
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
