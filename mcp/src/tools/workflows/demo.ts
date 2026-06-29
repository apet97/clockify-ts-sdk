import { wireBody, type ClockifyApi } from "clockify-sdk-ts-115/requests";

import { errorResult, successResult } from "../../result.js";

import { createWorkPackage, idOf, maybeConfirm, mergeChanged, ref, str } from "./resolve.js";
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
            new Error("demo cleanup only deletes objects under the reserved DEMO-/sdk-demo- prefix"),
            {
                hint: "Use a DEMO- or sdk-demo- prefix, or delete production objects via the confirm-guarded clockify_*_delete tools.",
            },
        );
    }
    const deleted: EntityRef[] = [];
    const warnings: Warning[] = [];
    // Use the per-server single-flight memo (fetched at most once) when present;
    // fall back to a direct call for hand-built contexts.
    const userId = ctx.currentUserId
        ? await ctx.currentUserId()
        : idOf(await ctx.client.users.getCurrentUser());

    // Phase 1: read-only discovery of everything the cleanup would touch. No
    // mutation happens before the dry_run -> confirm_token handshake below.
    const matchedEntries: AnyRecord[] = (await ctx.client.timeEntries.listForUser({
        workspaceId: ctx.workspaceId,
        userId,
        start: str(args.start) || "2026-01-01T00:00:00.000Z",
        end: str(args.end) || "2026-12-31T23:59:59.999Z",
        page: 1,
        "page-size": 200,
    }))
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

    // Phase 2: confirmation handshake. dry_run:true returns a preview receipt with
    // a confirm_token and performs NO deletion; a valid confirm_token returns null
    // and we proceed; neither returns an error receipt instructing dry_run first.
    const preview = {
        prefix,
        entries: matchedEntries.length,
        projects: projects.length,
        tasks: matchedTasks.length,
        tags: tags.length,
        clients: clients.length,
    };
    const confirmation = maybeConfirm(ctx, "clockify_demo_cleanup", "demo_cleanup", args, preview);
    if (confirmation) return confirmation;

    // Phase 3: execute the irreversible deletes, continuing through partial failures.
    for (const entry of matchedEntries) {
        await cleanupEntity("entry", entry, deleted, warnings, () =>
            ctx.client.timeEntries.delete({
                workspaceId: ctx.workspaceId,
                timeEntryId: idOf(entry),
            }),
        );
    }

    for (const project of projects) {
        for (const task of tasksByProject.get(idOf(project)) ?? []) {
            await cleanupEntity("task", task, deleted, warnings, async () => {
                // Clockify 400s on DELETE of an ACTIVE task ("Cannot delete an
                // active task", live-verified) - mark DONE first, like
                // clockify_tasks_delete and the createWorkPackage undo. The list
                // row already carries the name the replace-PUT requires.
                await ctx.client.tasks.update(
                    wireBody<ClockifyApi.UpdateTasksRequest>({
                        workspaceId: ctx.workspaceId,
                        projectId: idOf(project),
                        taskId: idOf(task),
                        name: str(task.name),
                        status: "DONE",
                    }),
                );
                await ctx.client.tasks.delete({
                    workspaceId: ctx.workspaceId,
                    projectId: idOf(project),
                    taskId: idOf(task),
                });
            });
        }
    }

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
