import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveGroupRefs, resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";
import { clarifyResult } from "./resolve-clarify.js";
import { userRefHelpers } from "./user-refs.js";

const PROJECT_NAME_SCHEMA = z.string().min(2).max(250);
const PROJECT_COLOR_SCHEMA = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const PROJECT_NOTE_SCHEMA = z.string().max(16_384);
const PROJECT_MEMBERSHIP_RATE_SCHEMA = z
    .object({
        amount: z.number().int().describe("Integer minor-unit rate amount."),
        since: z.string().min(1).optional().describe("Effective-from ISO date or datetime."),
    })
    .strict();
const PROJECT_MEMBERSHIP_SCHEMA = z
    .object({
        userId: z.string().min(1).describe("Workspace user ID, exact name, or `me`."),
        hourlyRate: PROJECT_MEMBERSHIP_RATE_SCHEMA.optional(),
        costRate: PROJECT_MEMBERSHIP_RATE_SCHEMA.optional(),
    })
    .strict();
const PROJECT_MEMBERSHIP_GROUPS_SCHEMA = z
    .object({
        contains: z.enum(["CONTAINS", "DOES_NOT_CONTAIN"]).optional(),
        ids: z.array(z.string().min(1)).optional().describe("User-group IDs or exact names."),
        status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
    })
    .strict();

export function registerProjectsTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);
    const listGroups = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.userGroups.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((row) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? ""),
        }));
    };
    defineTool(
        server,
        "clockify_projects_list",
        {
            title: "List projects",
            description: "List projects in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
                clientId: z.string().optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const page = args.page ?? 1;
            const pageSize = args.pageSize ?? 50;
            const req: ClockifyApi.ListProjectsRequest = {
                workspaceId: ctx.workspaceId,
                page,
                "page-size": pageSize,
            };
            if (args.name) req.name = args.name;
            if (args.archived !== undefined) req.archived = args.archived;
            if (args.clientId) req.clients = [args.clientId];
            const { items: projects, meta } = await pageWithMeta(ctx.client.projects.list(req), {
                workspaceId: ctx.workspaceId,
                page,
                pageSize,
            });
            return successResult("clockify_projects_list", projects, {
                ...meta,
            });
        },
        "Lower pageSize or narrow filters; verify the workspace ID.",
    );

    defineTool(
        server,
        "clockify_projects_create",
        {
            title: "Create a project",
            description: "Create a project in the pinned workspace.",
            inputSchema: {
                name: PROJECT_NAME_SCHEMA,
                clientId: z.string().min(1).optional(),
                color: PROJECT_COLOR_SCHEMA.optional(),
                billable: z.boolean().optional(),
                isPublic: z.boolean().optional(),
                note: PROJECT_NOTE_SCHEMA.optional(),
            },
        },
        async (args) => {
            const req: ClockifyApi.CreateProjectRequest = {
                workspaceId: ctx.workspaceId,
                body: {
                    name: args.name,
                    ...(args.clientId ? { clientId: args.clientId } : {}),
                    ...(args.color ? { color: args.color } : {}),
                    ...(args.billable !== undefined ? { billable: args.billable } : {}),
                    ...(args.isPublic !== undefined ? { isPublic: args.isPublic } : {}),
                    ...(args.note !== undefined ? { note: args.note } : {}),
                },
            };
            const project = await ctx.client.projects.create(req);
            const projectId = entityId(project);
            return successResult(
                "clockify_projects_create",
                project,
                undefined,
                writeReceipt(
                    "created",
                    "project",
                    { id: projectId, name: args.name },
                    {
                        next: [
                            {
                                tool: "clockify_tasks_create",
                                ...(projectId ? { args: { projectId } } : {}),
                                reason: "Add a task under the new project.",
                            },
                        ],
                    },
                ),
            );
        },
        "Reuse an existing client ID or check for an existing project with this name.",
    );

    defineTool(
        server,
        "clockify_projects_get",
        {
            title: "Get a project",
            description: "Fetch one project by ID from the pinned Clockify workspace.",
            inputSchema: { projectId: z.string().min(1) },
            idempotent: true,
        },
        async (args) => {
            const project = await ctx.client.projects.get({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
            });
            return successResult("clockify_projects_get", project, {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
            });
        },
    );

    defineTool(
        server,
        "clockify_projects_memberships_list",
        {
            title: "List project memberships",
            description:
                "Inspect the membership-facing fields returned by one project read before changing project access.",
            inputSchema: { projectId: z.string().min(1) },
            idempotent: true,
        },
        async (args) => {
            const request = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
            } satisfies ClockifyApi.GetProjectsRequest;
            const project = await ctx.client.projects.get(request);
            const memberships = project.memberships ?? [];
            const userGroups = "userGroups" in project ? project.userGroups : undefined;
            return successResult(
                "clockify_projects_memberships_list",
                {
                    projectId: args.projectId,
                    memberships,
                    ...(userGroups !== undefined ? { userGroups } : {}),
                },
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    count: memberships.length,
                },
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_projects_memberships_update",
        {
            title: "Update project memberships",
            description:
                "Replace project memberships with verified workspace users and optional verified user groups. Rate amounts are integer minor units. Run dry_run first, review the exact resolved request, then retry with the returned confirm_token.",
            strictInput: true,
            inputSchema: {
                projectId: z.string().min(1),
                memberships: z.array(PROJECT_MEMBERSHIP_SCHEMA).min(1),
                userGroups: PROJECT_MEMBERSHIP_GROUPS_SCHEMA.optional(),
                workspaceId: z.never().optional(),
                body: z.never().optional(),
            },
        },
        {
            preview: async (args) => {
                let listedUsers: Awaited<ReturnType<typeof listUsers>> | undefined;
                const listUsersOnce = async (): ReturnType<typeof listUsers> =>
                    (listedUsers ??= await listUsers());
                const currentUserId = await meUserId();
                const seenUserIds = new Set<string>();
                const resolvedMemberships: ClockifyApi.UserIdWithRatesRequest[] = [];
                for (const [index, membership] of args.memberships.entries()) {
                    const user = await resolveUserRef(
                        { id: membership.userId },
                        {
                            verb: "update project memberships for",
                            meUserId: currentUserId,
                            listUsers: listUsersOnce,
                            trustIds: false,
                        },
                    );
                    if (!user.ok) {
                        return clarifyResult(
                            "clockify_projects_memberships_update",
                            `memberships.${index}.userId`,
                            "user",
                            user.clarify,
                        );
                    }
                    if (seenUserIds.has(user.userId)) {
                        throw new TypeError(
                            `invalid memberships: duplicate resolved userId ${user.userId}`,
                        );
                    }
                    seenUserIds.add(user.userId);
                    const hourlyRate =
                        membership.hourlyRate === undefined
                            ? undefined
                            : {
                                  amount: membership.hourlyRate.amount,
                                  ...(membership.hourlyRate.since !== undefined
                                      ? { since: membership.hourlyRate.since }
                                      : {}),
                              } satisfies ClockifyApi.RateRequest;
                    const costRate =
                        membership.costRate === undefined
                            ? undefined
                            : {
                                  amount: membership.costRate.amount,
                                  ...(membership.costRate.since !== undefined
                                      ? { since: membership.costRate.since }
                                      : {}),
                              } satisfies ClockifyApi.RateRequest;
                    resolvedMemberships.push({
                        userId: user.userId,
                        ...(hourlyRate !== undefined ? { hourlyRate } : {}),
                        ...(costRate !== undefined ? { costRate } : {}),
                    });
                }

                let resolvedUserGroups: ClockifyApi.ProjectsUserGroupIdsSchema | undefined;
                if (args.userGroups !== undefined) {
                    let groupIds = args.userGroups.ids;
                    if (groupIds !== undefined) {
                        const groups = await resolveGroupRefs(groupIds, {
                            verb: "update project memberships for",
                            listGroups,
                        });
                        if (!groups.ok) {
                            return clarifyResult(
                                "clockify_projects_memberships_update",
                                "userGroups.ids",
                                "group",
                                groups.clarify,
                            );
                        }
                        groupIds = groups.groupIds;
                    }
                    resolvedUserGroups = {
                        ...(args.userGroups.contains !== undefined
                            ? { contains: args.userGroups.contains }
                            : {}),
                        ...(groupIds !== undefined ? { ids: groupIds } : {}),
                        ...(args.userGroups.status !== undefined
                            ? { status: args.userGroups.status }
                            : {}),
                    };
                }

                const request = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    memberships: resolvedMemberships,
                    ...(resolvedUserGroups !== undefined
                        ? { userGroups: resolvedUserGroups }
                        : {}),
                } satisfies ClockifyApi.UpdateMembershipsProjectsRequest;
                return { action: "update_memberships", entity: "project", request };
            },
            execute: async (preview) => {
                const project = await ctx.client.projects.updateMemberships(preview.request);
                return successResult(
                    "clockify_projects_memberships_update",
                    project,
                    {
                        workspaceId: preview.request.workspaceId,
                        projectId: preview.request.projectId,
                        membershipCount: preview.request.memberships.length,
                        groupIdCount: preview.request.userGroups?.ids?.length ?? 0,
                    },
                    writeReceipt("updated", "project", preview.request.projectId, {
                        next: [
                            {
                                tool: "clockify_projects_memberships_list",
                                args: { projectId: preview.request.projectId },
                                reason: "Read back the project membership projection after the update.",
                            },
                        ],
                    }),
                );
            },
        },
    );

    defineTool(
        server,
        "clockify_projects_update",
        {
            title: "Update a project",
            description:
                "Update project metadata such as name, client, visibility, color, or archive state.",
            inputSchema: {
                projectId: z.string().min(1),
                name: PROJECT_NAME_SCHEMA.optional(),
                clientId: z.string().min(1).optional(),
                color: PROJECT_COLOR_SCHEMA.optional(),
                billable: z.boolean().optional(),
                isPublic: z.boolean().optional(),
                archived: z.boolean().optional(),
                note: PROJECT_NOTE_SCHEMA.optional(),
            },
            idempotent: true,
        },
        async (args) => {
            if (
                args.name === undefined &&
                args.clientId === undefined &&
                args.color === undefined &&
                args.billable === undefined &&
                args.isPublic === undefined &&
                args.archived === undefined &&
                args.note === undefined
            ) {
                throw new Error("at least one project update field is required");
            }
            const body: ClockifyRequestBody<ClockifyApi.UpdateProjectsRequest> = {};
            if (args.name !== undefined) body.name = args.name;
            if (args.clientId !== undefined) body.clientId = args.clientId;
            if (args.color !== undefined) body.color = args.color;
            if (args.billable !== undefined) body.billable = args.billable;
            if (args.isPublic !== undefined) body.isPublic = args.isPublic;
            if (args.archived !== undefined) body.archived = args.archived;
            if (args.note !== undefined) body.note = args.note;
            const req: ClockifyApi.UpdateProjectsRequest = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                body,
            };
            const updated = await ctx.client.projects.update(req);
            return successResult(
                "clockify_projects_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                },
                writeReceipt("updated", "project", args.projectId),
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_projects_delete",
        {
            title: "Delete a project",
            description:
                "Permanently delete one project by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: { projectId: z.string().min(1) },
        },
        {
            preview: async (args) => {
                const deleteRequest = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                };
                const current = (await ctx.client.projects.get(deleteRequest)) as {
                    name?: unknown;
                };
                if (typeof current.name !== "string" || current.name.length === 0) {
                    throw new TypeError(
                        "Cannot archive project before delete: the project has no name to carry through the replace-PUT.",
                    );
                }
                const archiveRequest: ClockifyApi.UpdateProjectsRequest = {
                    ...deleteRequest,
                    name: current.name,
                    archived: true,
                };
                return {
                    action: "delete",
                    entity: "project",
                    id: args.projectId,
                    archiveRequest,
                    deleteRequest,
                };
            },
            execute: async (preview) => {
                await ctx.client.projects.update(preview.archiveRequest);
                await ctx.client.projects.delete(preview.deleteRequest);
                return successResult(
                    "clockify_projects_delete",
                    { deleted: true, projectId: preview.id },
                    { workspaceId: preview.deleteRequest.workspaceId, projectId: preview.id },
                    writeReceipt("deleted", "project", preview.id, {
                        next: [
                            {
                                tool: "clockify_projects_list",
                                reason: "Verify the project no longer appears.",
                            },
                        ],
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_projects_set_member_rate",
        {
            title: "Set a project member's rate",
            description:
                "Set a user's hourly (billable) or cost rate ON a specific project. Amount is in MAJOR units (e.g. 75 = $75.00); Clockify stores integer minor units. The member must already be on the project.",
            inputSchema: {
                projectId: z.string().min(1),
                userId: z.string().min(1),
                rateKind: z
                    .enum(["HOURLY", "COST"])
                    .describe("HOURLY = billable rate; COST = internal cost rate."),
                amount: zNumberLike(z.number()).describe(
                    "Rate in major units, e.g. 75 for $75/hr.",
                ),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            idempotent: true,
        },
        {
            preview: (args) => {
                const amountMinor = toMinor(args.amount, "major");
                const request = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    userId: args.userId,
                    amount: amountMinor,
                    ...(args.since ? { since: args.since } : {}),
                };
                return {
                    rateKind: args.rateKind,
                    amountMajor: args.amount,
                    amountMinor,
                    request,
                };
            },
            execute: async (preview) => {
                const updated =
                    preview.rateKind === "COST"
                        ? await ctx.client.projects.updateUserCostRate(
                              preview.request satisfies ClockifyApi.UpdateUserCostRateProjectsRequest,
                          )
                        : await ctx.client.projects.updateUserHourlyRate(
                              preview.request satisfies ClockifyApi.UpdateUserHourlyRateProjectsRequest,
                          );
                return successResult(
                    "clockify_projects_set_member_rate",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        projectId: preview.request.projectId,
                        userId: preview.request.userId,
                        rateKind: preview.rateKind,
                        amountMajor: preview.amountMajor,
                        amountMinor: preview.amountMinor,
                    },
                    writeReceipt("updated", "project", preview.request.projectId),
                );
            },
        },
    );
}
