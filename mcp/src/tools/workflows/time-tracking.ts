import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
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

type CreateTimeEntryRequest = Extract<
    ClockifyApi.CreateTimeEntryRequest,
    { workspaceId: string; start: string }
>;
type UpdateTimeEntryBody = ClockifyRequestBody<ClockifyApi.UpdateTimeEntriesRequest>;
type WritableCustomField = NonNullable<UpdateTimeEntryBody["customFields"]>[number];

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
    const entry = await ctx.client.timeEntries.create(body);
    const ids = entryIds(ctx, entry, { ...body });
    const reviewArgs = reviewArgsFromEntry(entry, { ...body });
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
    const entry = await ctx.client.timeEntries.create(body);
    const ids = entryIds(ctx, entry, { ...body });
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
    const requestedBillable = optionalBoolean(args.billable, "billable");
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
    const start = str(args.start) || str(entry.timeInterval.start);
    const nextDescription = str(args.new_description) || str(args.description);
    // timeEntries.update is a PUT-replace: every omitted field is wiped on the
    // live wire. Preserve each existing field from the already-fetched entry,
    // overriding only when args supply a value (mirrors how `start` is handled).
    const description = nextDescription || str(entry.description);
    const nextEnd = str(args.end) || str(entry.timeInterval.end);
    const nextProjectId = projectId || str(entry.projectId);
    const nextTaskId = taskId || str(entry.taskId);
    const nextTagIds = tagIds.length ? tagIds : arrayOfStrings(entry.tagIds);
    const customFields = writableCustomFields(entry.customFieldValues);
    if (!start) throw new Error("entry start is required to update this time entry");
    const body: UpdateTimeEntryBody = {
        start,
        description,
        billable: requestedBillable ?? entry.billable === true,
        ...(nextEnd ? { end: nextEnd } : {}),
        ...(nextProjectId ? { projectId: nextProjectId } : {}),
        ...(nextTaskId ? { taskId: nextTaskId } : {}),
        ...(nextTagIds.length ? { tagIds: nextTagIds } : {}),
        ...(customFields !== undefined ? { customFields } : {}),
        ...(entry.type === "REGULAR" || entry.type === "BREAK" ? { type: entry.type } : {}),
    };
    const request: ClockifyApi.UpdateTimeEntriesRequest = {
        workspaceId: ctx.workspaceId,
        timeEntryId: entryId,
        body,
    };
    const updated = await ctx.client.timeEntries.update(request);
    const fallback = { workspaceId: ctx.workspaceId, timeEntryId: entryId, ...body };
    const ids = entryIds(ctx, updated, fallback);
    const reviewArgs = reviewArgsFromEntry(updated, fallback);
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

async function prepareEntryBody(
    ctx: Context,
    args: AnyRecord,
    requireEnd: boolean,
): Promise<CreateTimeEntryRequest> {
    const billable = optionalBoolean(args.billable, "billable");
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
    const request: CreateTimeEntryRequest = {
        workspaceId: ctx.workspaceId,
        start,
        ...(end ? { end } : {}),
        description: str(args.description),
        ...(projectId ? { projectId } : {}),
        ...(taskId ? { taskId } : {}),
        ...(tagIds.length ? { tagIds } : {}),
        ...(billable !== undefined ? { billable } : {}),
    };
    return request;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
    return value;
}

function writableCustomFields(
    values: ClockifyApi.TimeEntry["customFieldValues"],
): WritableCustomField[] | undefined {
    const seenIds = new Set<string>();
    return values?.map((value, index) => {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError(`invalid customFieldValues[${index}]; an object is required`);
        }
        if (typeof value.customFieldId !== "string" || value.customFieldId.trim() === "") {
            throw new TypeError(
                `invalid customFieldValues[${index}].customFieldId; a non-empty string is required`,
            );
        }
        const customFieldId = value.customFieldId.trim();
        if (seenIds.has(customFieldId)) {
            throw new TypeError(
                `invalid duplicate customFieldId ${JSON.stringify(customFieldId)} in customFieldValues`,
            );
        }
        seenIds.add(customFieldId);
        const sourceType = value.sourceType;
        if (
            sourceType !== undefined &&
            sourceType !== "WORKSPACE" &&
            sourceType !== "PROJECT" &&
            sourceType !== "TIMEENTRY"
        ) {
            throw new TypeError(
                `invalid customFieldValues[${index}].sourceType ${JSON.stringify(sourceType)}`,
            );
        }
        return {
            customFieldId,
            ...(sourceType === "WORKSPACE" || sourceType === "PROJECT"
                ? { sourceType }
                : {}),
            value: writableCustomFieldValue(value.value, `customFieldValues[${index}].value`),
        };
    });
}

function writableCustomFieldValue(
    value: unknown,
    path: string,
    ancestors: ReadonlySet<object> = new Set(),
): unknown {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (Number.isFinite(value)) return value;
        throw new TypeError(`invalid ${path}; numbers must be finite`);
    }
    if (typeof value !== "object") {
        throw new TypeError(`invalid ${path}; a JSON-compatible value is required`);
    }
    if (ancestors.has(value)) {
        throw new TypeError(`invalid ${path}; cyclic values are not supported`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`invalid ${path}; a JSON-compatible value is required`);
    }
    const nestedAncestors = new Set(ancestors).add(value);
    if (Array.isArray(value)) {
        return value.map((item, index) =>
            writableCustomFieldValue(item, `${path}[${index}]`, nestedAncestors),
        );
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            writableCustomFieldValue(item, `${path}.${key}`, nestedAncestors),
        ]),
    );
}
