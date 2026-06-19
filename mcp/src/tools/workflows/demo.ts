import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { successResult } from "../../result.js";

import { createWorkPackage, idOf, mergeChanged, ref, str } from "./resolve.js";
import { logWork } from "./time-tracking.js";
import type { AnyRecord, EntityRef, Warning } from "./types.js";
import type { WorkflowContext as Context } from "./types.js";
import type { ChangeSet } from "./types.js";

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
            allow_overlap: true,
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
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];
    const user = await ctx.client.users.getCurrentUser();
    const entries: AnyRecord[] = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId: idOf(user),
        start: str(args.start) || "2026-01-01T00:00:00.000Z",
        end: str(args.end) || "2026-12-31T23:59:59.999Z",
        page: 1,
        "page-size": 200,
    })).map((entry) => ({ ...entry }));
    for (const entry of entries.filter((item) => str(item.description).startsWith(prefix))) {
        await cleanupEntity("entry", entry, deleted, warnings, () =>
            ctx.client.timeEntries.delete({
                workspaceId: ctx.workspaceId,
                timeEntryId: idOf(entry),
            }),
        );
    }

    const projects = prefixMatches(
        await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
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
        for (const task of tasks) {
            await cleanupEntity("task", task, deleted, warnings, () =>
                ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                }),
            );
        }
    }

    const tags = prefixMatches(
        await ctx.client.tags.list({ workspaceId: ctx.workspaceId, page: 1, "page-size": 200 }),
        prefix,
    );
    for (const tag of tags) {
        await cleanupEntity("tag", tag, deleted, warnings, () =>
            ctx.client.tags.delete({ workspaceId: ctx.workspaceId, tagId: idOf(tag) }),
        );
    }

    for (const project of projects) {
        await cleanupEntity("project", project, deleted, warnings, async () => {
            await ctx.client.projects.update({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
                name: str(project.name),
                archived: true,
            });
            await ctx.client.projects.delete({
                workspaceId: ctx.workspaceId,
                projectId: idOf(project),
            });
        });
    }

    const clients = prefixMatches(
        await ctx.client.clients.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        }),
        prefix,
    );
    for (const client of clients) {
        await cleanupEntity("client", client, deleted, warnings, async () => {
            await ctx.client.clients.update(
                wireBody<ClockifyApi.UpdateClientsRequest>({
                    workspaceId: ctx.workspaceId,
                    clientId: idOf(client),
                    body: { name: str(client.name), archived: true },
                }),
            );
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: idOf(client),
            });
        });
    }
    return successResult(
        "clockify_demo_cleanup",
        { prefix, deleted: deleted.length },
        { workspaceId: ctx.workspaceId },
        {
            entity: "demo",
            ids: { workspaceId: ctx.workspaceId },
            changed: { deleted },
            warnings,
        },
    );
}

export async function cleanupEntity(
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

export function prefixMatches(items: unknown, prefix: string): AnyRecord[] {
    return Array.isArray(items)
        ? (items as AnyRecord[]).filter((item) => str(item.name).startsWith(prefix))
        : [];
}
