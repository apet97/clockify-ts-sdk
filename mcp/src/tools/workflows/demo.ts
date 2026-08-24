import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

import { errorResult, successResult } from "../../result.js";
import { collectPagedList } from "../paging.js";

import {
    arrayOfStrings,
    createWorkPackage,
    entryIds,
    idOf,
    mergeChanged,
    ref,
    str,
} from "./resolve.js";
import { logWork } from "./time-tracking.js";
import type { AnyRecord, EntityRef, Warning } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";

type DemoTaskUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateTasksRequest>;
type DemoClientUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>;
const DEMO_ENTRY_MAX_PAGES = 50;
const DAY_MS = 86_400_000;

interface DemoPackageIds extends Record<string, string> {
    workspaceId: string;
    clientId: string;
    projectId: string;
    taskId: string;
    tagId: string;
}

class DemoSeedConflict extends Error {
    readonly statusCode = 409;

    constructor() {
        super(
            "deterministic demo entry conflicts with existing data; run clockify_demo_cleanup before reseeding",
        );
        this.name = "DemoSeedConflict";
    }
}

function demoProjectUpdateRequest(value: AnyRecord, workspaceId: string): ClockifyApi.UpdateProjectsRequest {
    const name = value.name;
    if (typeof name !== "string" || name.length === 0) {
        throw new Error("cannot archive demo project: current name is missing or invalid");
    }
    if (typeof value.billable !== "boolean" || typeof value.public !== "boolean") {
        throw new Error("cannot archive demo project: current billable/public state is invalid");
    }
    return {
        workspaceId,
        projectId: idOf(value),
        name,
        billable: value.billable,
        isPublic: value.public,
        archived: true,
    };
}

function demoEntity(value: unknown, type: "task" | "client"): AnyRecord {
    if (!isRecord(value)) {
        throw new Error(`cannot archive demo ${type}: current state is missing or invalid`);
    }
    return value;
}

function requiredDemoName(value: AnyRecord, type: "task" | "client"): string {
    const name = value.name;
    if (typeof name !== "string" || name.length === 0) {
        throw new Error(`cannot archive demo ${type}: current name is missing or invalid`);
    }
    return name;
}

function stringArrayField(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`cannot archive demo task: current ${field} is invalid`);
    }
    return [...value];
}

function demoTaskUpdateBody(value: unknown): DemoTaskUpdateBody {
    const task = demoEntity(value, "task");
    const body: DemoTaskUpdateBody = { name: requiredDemoName(task, "task"), status: "DONE" };
    if (task.assigneeId != null) {
        if (typeof task.assigneeId !== "string") {
            throw new Error("cannot archive demo task: current assigneeId is invalid");
        }
        body.assigneeId = task.assigneeId;
    }
    for (const field of ["assigneeIds", "userGroupIds"] as const) {
        if (task[field] != null) body[field] = stringArrayField(task[field], field);
    }
    if (task.billable != null) {
        if (typeof task.billable !== "boolean") {
            throw new Error("cannot archive demo task: current billable is invalid");
        }
        body.billable = task.billable;
    }
    if (task.budgetEstimate != null) {
        if (typeof task.budgetEstimate !== "number" || !Number.isFinite(task.budgetEstimate)) {
            throw new Error("cannot archive demo task: current budgetEstimate is invalid");
        }
        body.budgetEstimate = task.budgetEstimate;
    }
    if (task.estimate != null) {
        if (typeof task.estimate !== "string") {
            throw new Error("cannot archive demo task: current estimate is invalid");
        }
        body.estimate = task.estimate;
    }
    return body;
}

function demoClientUpdateBody(value: unknown): DemoClientUpdateBody {
    const client = demoEntity(value, "client");
    const body: DemoClientUpdateBody = { name: requiredDemoName(client, "client"), archived: true };
    for (const field of ["address", "email", "note"] as const) {
        if (client[field] != null) {
            if (typeof client[field] !== "string") {
                throw new Error(`cannot archive demo client: current ${field} is invalid`);
            }
            body[field] = client[field];
        }
    }
    return body;
}

export async function demoSeed(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    if (!/^(DEMO-|sdk-demo-)/.test(prefix)) {
        throw new TypeError("invalid prefix: demo seed requires the reserved DEMO-/sdk-demo- namespace");
    }
    const date = demoDate(args.date);
    const start = `${date}T09:00:00.000Z`;
    const end = `${date}T09:15:00.000Z`;
    const description = `${prefix}-entry`;
    const existing = await findExistingDemoEntry(ctx, { description, start, end });
    const pkgResult = existing
        ? await reuseExistingDemoPackage(ctx, prefix, existing.entry)
        : await createWorkPackage(ctx, {
              client: `${prefix}-client`,
              project: `${prefix}-project`,
              task: `${prefix}-task`,
              tag: `${prefix}-tag`,
              upsert: true,
          });
    const pkg = pkgResult.structuredContent;
    const { workspaceId, clientId, projectId, taskId, tagId } = pkg.ids ?? {};
    if (
        pkg.action !== "clockify_create_work_package" ||
        !workspaceId ||
        !clientId ||
        !projectId ||
        !taskId ||
        !tagId
    ) {
        throw new Error("clockify_create_work_package returned an incomplete success receipt");
    }
    const packageIds: DemoPackageIds = { workspaceId, clientId, projectId, taskId, tagId };
    if (existing && !entryMatchesPackage(existing.entry, packageIds, ctx.workspaceId)) {
        throw new DemoSeedConflict();
    }
    const logged = existing
        ? successResult(
              "clockify_log_work",
              existing.entry,
              { workspaceId: ctx.workspaceId },
              {
                  entity: "entry",
                  ids: entryIds(ctx, existing.entry, { userId: existing.userId }),
                  changed: { reused: [ref("entry", existing.entry, description)] },
              },
          ).structuredContent
        : (
              await logWork(ctx, {
                  description,
                  start,
                  end,
                  project_id: packageIds.projectId,
                  task_id: packageIds.taskId,
                  tag_ids: [packageIds.tagId],
              })
          ).structuredContent;
    if (logged.action !== "clockify_log_work") {
        throw new Error("clockify_log_work returned an invalid success receipt");
    }
    return successResult(
        "clockify_demo_seed",
        { package: pkg, entry: logged },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: packageIds,
            changed: mergeChanged(pkg.changed, logged.changed),
            next: [
                {
                    tool: "clockify_demo_cleanup",
                    args: { prefix },
                    reason: "Clean up deterministic demo objects.",
                },
            ],
        },
    );
}

function demoDate(value: unknown): string {
    const date = str(value) || "2026-01-02";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new TypeError("date must use YYYY-MM-DD");
    }
    const instant = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(instant.getTime()) || instant.toISOString().slice(0, 10) !== date) {
        throw new TypeError("date must be a real calendar day");
    }
    return date;
}

async function findExistingDemoEntry(
    ctx: Context,
    expected: { description: string; start: string; end: string },
): Promise<{ entry: ClockifyApi.TimeEntry; userId: string } | undefined> {
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());
    const dayStart = `${expected.start.slice(0, 10)}T00:00:00.000Z`;
    const dayEnd = new Date(Date.parse(dayStart) + DAY_MS).toISOString();
    const entries = await collectPagedList(
        (page) =>
            ctx.client.timeEntries.listForUser({
                workspaceId: ctx.workspaceId,
                userId,
                start: dayStart,
                end: dayEnd,
                description: expected.description,
                page,
                "page-size": 200,
            }),
        { pageSize: 200, maxPages: DEMO_ENTRY_MAX_PAGES },
    );
    const owned = entries.filter((entry) => str(entry.description) === expected.description);
    if (owned.length === 0) return undefined;
    const exact = owned.filter((entry) => {
        const wire = isRecord(entry) ? entry : undefined;
        const entryStart = str(entry.timeInterval?.start) || str(wire?.start);
        const entryEnd = str(entry.timeInterval?.end) || str(wire?.end);
        return (
            str(entry.userId) === userId &&
            sameInstant(entryStart, expected.start) &&
            sameInstant(entryEnd, expected.end)
        );
    });
    const entry = exact[0];
    if (owned.length !== 1 || exact.length !== 1 || !entry) {
        throw new DemoSeedConflict();
    }
    return { entry, userId };
}

function sameInstant(actual: string, expected: string): boolean {
    const actualTime = Date.parse(actual);
    const expectedTime = Date.parse(expected);
    return Number.isFinite(actualTime) && Number.isFinite(expectedTime) && actualTime === expectedTime;
}

function entryMatchesPackage(
    entry: ClockifyApi.TimeEntry,
    ids: DemoPackageIds,
    workspaceId: string,
): boolean {
    const expectedTagIds = [ids.tagId];
    const actualTagIds = arrayOfStrings(entry.tagIds).sort();
    return (
        str(entry.workspaceId) === workspaceId &&
        str(entry.projectId) === ids.projectId &&
        str(entry.taskId) === ids.taskId &&
        expectedTagIds.length === actualTagIds.length &&
        expectedTagIds.every((tagId, index) => tagId === actualTagIds[index])
    );
}

async function reuseExistingDemoPackage(
    ctx: Context,
    prefix: string,
    entry: ClockifyApi.TimeEntry,
) {
    const projectId = str(entry.projectId);
    const taskId = str(entry.taskId);
    const tagIds = arrayOfStrings(entry.tagIds);
    if (!projectId || !taskId || tagIds.length !== 1) throw new DemoSeedConflict();

    const [projects, tasks, tags] = await Promise.all([
        collectPagedList(
            (page) =>
                ctx.client.projects.list({
                    workspaceId: ctx.workspaceId,
                    name: `${prefix}-project`,
                    page,
                    "page-size": 200,
                }),
            { pageSize: 200, maxPages: DEMO_ENTRY_MAX_PAGES },
        ),
        collectPagedList(
            (page) =>
                ctx.client.tasks.list({
                    workspaceId: ctx.workspaceId,
                    projectId,
                    name: `${prefix}-task`,
                    page,
                    "page-size": 200,
                }),
            { pageSize: 200, maxPages: DEMO_ENTRY_MAX_PAGES },
        ),
        collectPagedList(
            (page) =>
                ctx.client.tags.list({
                    workspaceId: ctx.workspaceId,
                    name: `${prefix}-tag`,
                    page,
                    "page-size": 200,
                }),
            { pageSize: 200, maxPages: DEMO_ENTRY_MAX_PAGES },
        ),
    ]);
    const project = exactDemoEntity(projects, `${prefix}-project`, projectId);
    const clientId = str(project.clientId);
    if (!clientId) throw new DemoSeedConflict();
    const clients = await collectPagedList(
        (page) =>
            ctx.client.clients.list({
                workspaceId: ctx.workspaceId,
                name: `${prefix}-client`,
                page,
                "page-size": 200,
            }),
        { pageSize: 200, maxPages: DEMO_ENTRY_MAX_PAGES },
    );
    const client = exactDemoEntity(clients, `${prefix}-client`, clientId);
    const task = exactDemoEntity(tasks, `${prefix}-task`, taskId);
    const tag = exactDemoEntity(tags, `${prefix}-tag`, tagIds[0]);
    return successResult(
        "clockify_create_work_package",
        { client, project, task, tagIds, tags: [tag] },
        { workspaceId: ctx.workspaceId },
        {
            entity: "work_package",
            ids: {
                workspaceId: ctx.workspaceId,
                clientId,
                projectId,
                taskId,
                tagId: tagIds[0],
            },
            changed: {
                reused: [
                    ref("client", client),
                    ref("project", project),
                    ref("task", task),
                    ref("tag", tag),
                ],
            },
            next: [
                {
                    tool: "clockify_log_work",
                    args: { project_id: projectId, task_id: taskId, tag_ids: tagIds },
                    reason: "Log finished work against this package.",
                },
                {
                    tool: "clockify_start_work",
                    args: { project_id: projectId, task_id: taskId, tag_ids: tagIds },
                    reason: "Start a timer against this package.",
                },
            ],
        },
    );
}

function exactDemoEntity<T extends { id: string; name: string }>(
    rows: readonly T[],
    name: string,
    expectedId: string | undefined,
): T {
    const matches = rows.filter((row) => row.name === name);
    const match = matches[0];
    if (matches.length !== 1 || !match || match.id !== expectedId) {
        throw new DemoSeedConflict();
    }
    return match;
}

export async function demoCleanup(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    // Defense in depth: this bulk archive+delete is irreversible, so it may only
    // ever touch objects under the reserved demo namespace. An arbitrary prefix
    // cannot mass-delete production data even with a valid confirm_token.
    if (!/^(DEMO-|sdk-demo-)/.test(prefix)) {
        return errorResult(
            "clockify_demo_cleanup",
            // Leading "invalid" is an errorCodeForMessage token: this is pure
            // input validation, so the receipt must carry invalid_request, not
            // the catch-all `error` code an agent cannot act on.
            new Error(
                "invalid prefix: demo cleanup only deletes objects under the reserved DEMO-/sdk-demo- prefix",
            ),
            {
                hint: "Use a DEMO- or sdk-demo- prefix, or delete production objects via the confirm-guarded clockify_*_delete tools.",
            },
        );
    }
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());

    // Phase 1: read-only discovery of everything the cleanup would touch. No
    // mutation happens before the dry_run -> confirm_token handshake below.
    // Every sweep walks ALL pages: the default entry window is a full calendar
    // year, and a page-1-only read would under-report the preview a human
    // approves before issuing the confirm_token.
    const matchedEntries: AnyRecord[] = (
        await collectPagedList((page) =>
            ctx.client.timeEntries.listForUser({
                workspaceId: ctx.workspaceId,
                userId,
                start: str(args.start) || "2026-01-01T00:00:00.000Z",
                end: str(args.end) || "2026-12-31T23:59:59.999Z",
                description: prefix,
                page,
                "page-size": 200,
            }),
        )
    )
        .map((entry) => ({ ...entry }))
        .filter((item) => str(item.description).startsWith(prefix));

    const projects = prefixMatches(
        await collectPagedList((page) =>
            ctx.client.projects.list({
                workspaceId: ctx.workspaceId,
                name: prefix,
                page,
                "page-size": 200,
            }),
        ),
        prefix,
    );
    const tasksByProject = new Map<string, AnyRecord[]>();
    for (const project of projects) {
        const projectId = idOf(project);
        const tasks = prefixMatches(
            await collectPagedList((page) =>
                ctx.client.tasks.list({
                    workspaceId: ctx.workspaceId,
                    projectId,
                    name: prefix,
                    page,
                    "page-size": 200,
                }),
            ),
            prefix,
        );
        tasksByProject.set(projectId, tasks);
    }
    const matchedTasks = [...tasksByProject.values()].flat();

    const tags = prefixMatches(
        await collectPagedList((page) =>
            ctx.client.tags.list({
                workspaceId: ctx.workspaceId,
                name: prefix,
                page,
                "page-size": 200,
            }),
        ),
        prefix,
    );
    const clients = prefixMatches(
        await collectPagedList((page) =>
            ctx.client.clients.list({
                workspaceId: ctx.workspaceId,
                name: prefix,
                page,
                "page-size": 200,
            }),
        ),
        prefix,
    );

    const entryPlans = matchedEntries.map((entry) => ({
        value: entry,
        request: { workspaceId: ctx.workspaceId, timeEntryId: idOf(entry) },
    }));
    const taskPlans: Array<{
        value: AnyRecord;
        updateRequest: ClockifyApi.UpdateTasksRequest;
        deleteRequest: { workspaceId: string; projectId: string; taskId: string };
    }> = [];
    for (const project of projects) {
        for (const task of tasksByProject.get(idOf(project)) ?? []) {
            const projectId = idOf(project);
            const taskId = idOf(task);
            const current = await ctx.client.tasks.get({
                workspaceId: ctx.workspaceId,
                projectId,
                taskId,
            });
            taskPlans.push({
                value: task,
                updateRequest: {
                    workspaceId: ctx.workspaceId,
                    projectId,
                    taskId,
                    body: demoTaskUpdateBody(current),
                },
                deleteRequest: { workspaceId: ctx.workspaceId, projectId, taskId },
            });
        }
    }
    const tagPlans = tags.map((tag) => ({
        value: tag,
        request: { workspaceId: ctx.workspaceId, tagId: idOf(tag) },
    }));
    const projectPlans = projects.map((project) => ({
        value: project,
        updateRequest: demoProjectUpdateRequest(project, ctx.workspaceId),
        deleteRequest: { workspaceId: ctx.workspaceId, projectId: idOf(project) },
    }));
    const clientPlans: Array<{
        value: AnyRecord;
        updateRequest: ClockifyApi.UpdateClientsRequest;
        deleteRequest: { workspaceId: string; clientId: string };
    }> = [];
    for (const client of clients) {
        const clientId = idOf(client);
        const current = await ctx.client.clients.get({
            workspaceId: ctx.workspaceId,
            clientId,
        });
        clientPlans.push({
            value: client,
            updateRequest: {
                workspaceId: ctx.workspaceId,
                clientId,
                body: demoClientUpdateBody(current),
            },
            deleteRequest: { workspaceId: ctx.workspaceId, clientId },
        });
    }

    return {
        prefix,
        entries: matchedEntries.length,
        projects: projects.length,
        tasks: matchedTasks.length,
        tags: tags.length,
        clients: clients.length,
        execution: {
            entries: entryPlans,
            tasks: taskPlans,
            tags: tagPlans,
            projects: projectPlans,
            clients: clientPlans,
        },
    };
}

export async function executeDemoCleanup(
    ctx: Context,
    preview: Exclude<Awaited<ReturnType<typeof demoCleanup>>, ReturnType<typeof errorResult>>,
) {
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];

    for (const plan of preview.execution.entries) {
        await cleanupEntity("entry", plan.value, deleted, warnings, () =>
            ctx.client.timeEntries.delete(plan.request),
        );
    }

    for (const plan of preview.execution.tasks) {
        await cleanupEntity("task", plan.value, deleted, warnings, async () => {
            await ctx.client.tasks.update(plan.updateRequest);
            await ctx.client.tasks.delete(plan.deleteRequest);
        });
    }

    for (const plan of preview.execution.tags) {
        await cleanupEntity("tag", plan.value, deleted, warnings, () =>
            ctx.client.tags.delete(plan.request),
        );
    }

    for (const plan of preview.execution.projects) {
        await cleanupEntity("project", plan.value, deleted, warnings, async () => {
            await ctx.client.projects.update(plan.updateRequest);
            await ctx.client.projects.delete(plan.deleteRequest);
        });
    }

    for (const plan of preview.execution.clients) {
        await cleanupEntity("client", plan.value, deleted, warnings, async () => {
            await ctx.client.clients.update(plan.updateRequest);
            await ctx.client.clients.delete(plan.deleteRequest);
        });
    }
    return successResult(
        "clockify_demo_cleanup",
        { prefix: preview.prefix, deleted: deleted.length },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: { workspaceId: ctx.workspaceId },
            changed: { deleted },
            warnings,
        },
    );
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
            message: `${type} ${entity.id || "(unknown)"}: ${err instanceof Error ? err.message : String(err)}`,
        });
    }
}

function prefixMatches(items: unknown, prefix: string): AnyRecord[] {
    return Array.isArray(items)
        ? items.filter(isRecord).filter((item) => str(item.name).startsWith(prefix))
        : [];
}

function isRecord(value: unknown): value is AnyRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
