import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";

import { errorResult, successResult } from "../../result.js";

import { createWorkPackage, idOf, mergeChanged, ref, str } from "./resolve.js";
import { logWork } from "./time-tracking.js";
import type { AnyRecord, EntityRef, Warning } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";
import type { ChangeSet } from "./types.js";

type DemoTaskUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateTasksRequest>;
type DemoClientUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>;

function demoEntity(value: unknown, type: "task" | "client"): AnyRecord {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`cannot archive demo ${type}: current state is missing or invalid`);
    }
    return value as AnyRecord;
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
    if (task.assigneeId !== undefined) {
        if (typeof task.assigneeId !== "string") {
            throw new Error("cannot archive demo task: current assigneeId is invalid");
        }
        body.assigneeId = task.assigneeId;
    }
    for (const field of ["assigneeIds", "userGroupIds"] as const) {
        if (task[field] !== undefined) body[field] = stringArrayField(task[field], field);
    }
    if (task.billable !== undefined) {
        if (typeof task.billable !== "boolean") {
            throw new Error("cannot archive demo task: current billable is invalid");
        }
        body.billable = task.billable;
    }
    if (task.budgetEstimate !== undefined) {
        if (typeof task.budgetEstimate !== "number" || !Number.isFinite(task.budgetEstimate)) {
            throw new Error("cannot archive demo task: current budgetEstimate is invalid");
        }
        body.budgetEstimate = task.budgetEstimate;
    }
    if (task.estimate !== undefined) {
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
    for (const field of ["address", "currencyCode", "email", "note"] as const) {
        if (client[field] !== undefined) {
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
    const pkg = (
        await createWorkPackage(ctx, {
            client: `${prefix}-client`,
            project: `${prefix}-project`,
            task: `${prefix}-task`,
            tag: `${prefix}-tag`,
            upsert: args.upsert !== false,
        })
    ).structuredContent as AnyRecord;
    const date = str(args.date) || "2026-01-02";
    const logged = (
        await logWork(ctx, {
            description: `${prefix}-entry`,
            start: `${date}T09:00:00.000Z`,
            end: `${date}T09:15:00.000Z`,
            project_id: (pkg.ids as AnyRecord)?.projectId,
            task_id: (pkg.ids as AnyRecord)?.taskId,
            tag_ids: (pkg.ids as AnyRecord)?.tagId ? [(pkg.ids as AnyRecord).tagId] : [],
        })
    ).structuredContent;
    return successResult(
        "clockify_demo_seed",
        { package: pkg, entry: logged },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: (pkg.ids as Record<string, string>) ?? { workspaceId: ctx.workspaceId },
            changed: mergeChanged(
                pkg.changed as ChangeSet | undefined,
                (logged as AnyRecord).changed as ChangeSet | undefined,
            ),
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

export async function demoCleanup(ctx: Context, args: AnyRecord) {
    const prefix = str(args.prefix) || `DEMO-${str(args.run_id) || "phase1"}`;
    // Defense in depth: this bulk archive+delete is irreversible, so it may only
    // ever touch objects under the reserved demo namespace. An arbitrary prefix
    // cannot mass-delete production data even with a valid confirm_token.
    if (!/^(DEMO-|sdk-demo-)/.test(prefix)) {
        return errorResult(
            "clockify_demo_cleanup",
            new Error(
                "demo cleanup only deletes objects under the reserved DEMO-/sdk-demo- prefix",
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
    const matchedEntries: AnyRecord[] = (
        await ctx.client.timeEntries.listForUser({
            workspaceId: ctx.workspaceId,
            userId,
            start: str(args.start) || "2026-01-01T00:00:00.000Z",
            end: str(args.end) || "2026-12-31T23:59:59.999Z",
            page: 1,
            "page-size": 200,
        })
    )
        .map((entry) => ({ ...entry }))
        .filter((item) => str(item.description).startsWith(prefix));

    const projects = prefixMatches(
        await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
    const tasksByProject = new Map<string, AnyRecord[]>();
    for (const project of projects) {
        const tasks = prefixMatches(
            await ctx.client.tasks.list({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                page: 1,
                "page-size": 200,
            }),
            prefix,
        );
        tasksByProject.set(idOf(project), tasks);
    }
    const matchedTasks = [...tasksByProject.values()].flat();

    const tags = prefixMatches(
        await ctx.client.tags.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 }),
        prefix,
    );
    const clients = prefixMatches(
        await ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
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
        updateRequest: {
            workspaceId: ctx.workspaceId,
            projectId: idOf(project),
            name: str(project.name),
            archived: true,
        },
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
            message: `${type} ${entity.id || "(unknown)"}: ${String((err as Error).message ?? err)}`,
        });
    }
}

function prefixMatches(items: unknown, prefix: string): AnyRecord[] {
    return Array.isArray(items)
        ? (items as AnyRecord[]).filter((item) => str(item.name).startsWith(prefix))
        : [];
}
