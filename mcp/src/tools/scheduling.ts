/**
 * Scheduling assignments. The Clockify scheduling addon needs to be
 * enabled and the user typically needs admin/manager role; both
 * preconditions surface as upstream 403/404 which we expose verbatim
 * through errorResult.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveEntityRef, resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, errorResult, successResult, writeReceipt } from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";
import { userRefHelpers } from "./user-refs.js";

export function registerSchedulingTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);
    const listProjects = async (filter?: {
        archived?: boolean;
    }): Promise<Array<{ id: string; name: string; archived?: boolean }>> => {
        const rows = (await ctx.client.projects.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            ...(filter?.archived !== undefined ? { archived: filter.archived } : {}),
        })) as Array<{ id?: string; name?: string; archived?: boolean }>;
        return rows.map((r) => ({
            id: String(r.id ?? ""),
            name: String(r.name ?? ""),
            ...(r.archived !== undefined ? { archived: r.archived } : {}),
        }));
    };
    defineTool(
        server,
        "clockify_scheduling_assignments_list",
        {
            title: "List scheduling assignments",
            description:
                "List scheduling assignments in the workspace over a date range, with pagination and name filters. start/end are required — the endpoint 400s (code 3001) without them.",
            inputSchema: {
                start: z
                    .string()
                    .describe(
                        "Range start, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required — the endpoint 400s (code 3001) without it.",
                    ),
                end: z
                    .string()
                    .describe(
                        "Range end, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required — the endpoint 400s without it.",
                    ),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                name: z.string().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const req: ClockifyApi.ListSchedulingRequest = {
                workspaceId: ctx.workspaceId,
                start: args.start,
                end: args.end,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.name) req.name = args.name;
            const items = await ctx.client.scheduling.list(req);
            return successResult("clockify_scheduling_assignments_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_scheduling_assignments_list_per_project",
        {
            title: "List scheduling assignments per project",
            description:
                "Scheduling assignment totals grouped by project. start/end are required for both branches (each 400s without them). Pass a projectId for one project's totals (a dedicated GET endpoint); otherwise the all-projects search.",
            inputSchema: {
                projectId: z
                    .string()
                    .optional()
                    .describe(
                        "One project's totals. Uses the GET .../projects/totals/{projectId} endpoint (also requires start/end).",
                    ),
                start: z
                    .string()
                    .describe(
                        "Range start, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required for both the single-project GET and the all-projects search.",
                    ),
                end: z
                    .string()
                    .describe(
                        "Range end, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required for both the single-project GET and the all-projects search.",
                    ),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            // A single project's totals live at GET .../projects/totals/{projectId}.
            // The all-projects search is a POST whose body has NO projectId field —
            // sending one was silently dropped and returned ALL projects, so route
            // by presence of projectId instead.
            if (args.projectId) {
                // The single-project GET also REQUIRES start/end live (400s code
                // 3001 without them); forward them like the all-projects branch.
                const one = await ctx.client.scheduling.listOnProject({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    start: args.start,
                    end: args.end,
                });
                return successResult("clockify_scheduling_assignments_list_per_project", one, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                });
            }
            // The all-projects totals search REQUIRES start+end (omitting them
            // 400s) and reads camel `pageSize` off the body whitelist — kebab
            // `page-size` is silently ignored and returns ALL projects
            // (live-verified 2026-06-18). Send the flattened request with camel
            // pageSize; the response is a real ProjectAssignmentsTotal[].
            const req: ClockifyApi.ListPerProjectSchedulingRequest = {
                workspaceId: ctx.workspaceId,
                start: args.start,
                end: args.end,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
            };
            const items = await ctx.client.scheduling.listPerProject(req);
            return successResult("clockify_scheduling_assignments_list_per_project", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_scheduling_assignments_create",
        {
            title: "Create a scheduling assignment",
            description:
                "Create a scheduling assignment. Defaults to draft (published:false) to avoid notifying other users.",
            inputSchema: {
                userId: z.string().min(1),
                projectId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
                hoursPerDay: zNumberLike(z.number()),
                taskId: z.string().optional(),
                note: z.string().optional(),
                billable: z.boolean().optional(),
                includeNonWorkingDays: z.boolean().optional(),
                published: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const u = await resolveUserRef(
                { id: args.userId },
                { verb: "schedule", meUserId: await meUserId(), listUsers, trustIds: false },
            );
            if (!u.ok)
                return clarifyResult(
                    "clockify_scheduling_assignments_create",
                    "userId",
                    "user",
                    u.clarify,
                );
            const p = await resolveEntityRef(
                { id: args.projectId },
                { noun: "project", verb: "schedule against", list: listProjects },
            );
            if (!p.ok)
                return clarifyResult(
                    "clockify_scheduling_assignments_create",
                    "projectId",
                    "project",
                    p.clarify,
                );
            const body: ClockifyRequestBody<ClockifyApi.CreateSchedulingRequest> = {
                userId: u.userId,
                projectId: p.id,
                hoursPerDay: args.hoursPerDay,
                period: { start: args.start, end: args.end },
                published: args.published === true,
            };
            if (args.taskId) body.taskId = args.taskId;
            if (args.note) body.note = args.note;
            if (args.billable !== undefined) body.billable = args.billable;
            if (args.includeNonWorkingDays !== undefined)
                body.includeNonWorkingDays = args.includeNonWorkingDays;
            const req: ClockifyApi.CreateSchedulingRequest = {
                workspaceId: ctx.workspaceId,
                body,
            };
            const created = await ctx.client.scheduling.create(req);
            return successResult(
                "clockify_scheduling_assignments_create",
                created,
                {
                    workspaceId: ctx.workspaceId,
                },
                writeReceipt("created", "scheduling_assignment", { id: entityId(created) }),
            );
        },
    );

    defineTool(
        server,
        "clockify_scheduling_assignments_update",
        {
            title: "Update a scheduling assignment",
            description:
                "Edit a scheduling assignment's date range, hours, task, billable flag, or note by ID. " +
                "This is a PATCH on the recurring-assignment route (the bare /assignments/{id} PUT 404s " +
                "live), so start+end are required and seriesUpdateOption scopes the edit across a series. " +
                "The route cannot reassign the user or project — recreate the assignment to move it.",
            inputSchema: {
                assignmentId: z.string().min(1),
                start: z
                    .string()
                    .min(1)
                    .describe("New range start, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required."),
                end: z
                    .string()
                    .min(1)
                    .describe("New range end, ISO-8601 datetime (yyyy-MM-ddThh:mm:ssZ). Required."),
                hoursPerDay: zNumberLike(z.number()).optional(),
                taskId: z.string().optional(),
                note: z.string().optional(),
                billable: z.boolean().optional(),
                seriesUpdateOption: z
                    .enum(["THIS_ONE", "THIS_AND_FOLLOWING", "ALL"])
                    .optional()
                    .describe(
                        "Which occurrences of a recurring series to apply the edit to. Defaults to this assignment only.",
                    ),
                userId: z
                    .string()
                    .optional()
                    .describe(
                        "Not supported by this route — reassigning the user is rejected. Recreate the assignment to move it.",
                    ),
                projectId: z
                    .string()
                    .optional()
                    .describe(
                        "Not supported by this route — reassigning the project is rejected. Recreate the assignment to move it.",
                    ),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            // The live edit route is PATCH /scheduling/assignments/recurring/{id}
            // (the bare PUT /assignments/{id} returns a static-resource 404).
            // AssignmentUpdateRequestV1 carries no user/project field, so this
            // route cannot reassign an assignment — fail loudly instead of
            // silently dropping the caller's intent.
            if (args.userId !== undefined || args.projectId !== undefined) {
                return errorResult(
                    "clockify_scheduling_assignments_update",
                    new Error(
                        "The scheduling-assignment edit route cannot reassign the user or project, so you must not " +
                            "pass userId/projectId here; delete and recreate the assignment to move it.",
                    ),
                    {
                        hint: "Drop userId/projectId from the update, or delete the assignment and create a new one under the target user/project.",
                        tool: "clockify_scheduling_assignments_create",
                        retryable: false,
                    },
                );
            }
            const body: ClockifyRequestBody<ClockifyApi.UpdateRecurringSchedulingRequest> = {
                start: args.start,
                end: args.end,
            };
            if (args.hoursPerDay !== undefined) body.hoursPerDay = args.hoursPerDay;
            if (args.taskId) body.taskId = args.taskId;
            if (args.note) body.note = args.note;
            if (args.billable !== undefined) body.billable = args.billable;
            if (args.seriesUpdateOption) body.seriesUpdateOption = args.seriesUpdateOption;
            const updated = await ctx.client.scheduling.updateRecurring({
                workspaceId: ctx.workspaceId,
                assignmentId: args.assignmentId,
                body,
            });
            return successResult(
                "clockify_scheduling_assignments_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    assignmentId: args.assignmentId,
                },
                writeReceipt("updated", "scheduling_assignment", args.assignmentId),
            );
        },
    );

    defineTool(
        server,
        "clockify_scheduling_assignments_delete",
        {
            title: "Delete a scheduling assignment",
            description:
                "Permanently delete a scheduling assignment. Hits the recurring-assignment route " +
                "(DELETE /scheduling/assignments/recurring/{id}; the bare /assignments/{id} DELETE 404s " +
                "live); seriesUpdateOption scopes the deletion across a recurring series. " +
                "Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                assignmentId: z.string().min(1),
                seriesUpdateOption: z
                    .enum(["THIS_ONE", "THIS_AND_FOLLOWING", "ALL"])
                    .optional()
                    .describe(
                        "Which occurrences of a recurring series to delete. Defaults to this assignment only.",
                    ),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = {
                action: "delete",
                entity: "scheduling_assignment",
                id: args.assignmentId,
                ...(args.seriesUpdateOption
                    ? { seriesUpdateOption: args.seriesUpdateOption }
                    : {}),
            };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_scheduling_assignments_delete",
                "scheduling_assignment_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.scheduling.deleteRecurring({
                workspaceId: ctx.workspaceId,
                assignmentId: args.assignmentId,
                ...(args.seriesUpdateOption
                    ? { seriesUpdateOption: args.seriesUpdateOption }
                    : {}),
            });
            return successResult(
                "clockify_scheduling_assignments_delete",
                { deleted: true, assignmentId: args.assignmentId },
                { workspaceId: ctx.workspaceId, assignmentId: args.assignmentId },
                writeReceipt("deleted", "scheduling_assignment", args.assignmentId),
            );
        },
    );

    defineTool(
        server,
        "clockify_scheduling_publish",
        {
            title: "Publish scheduling assignments",
            description:
                "Publish draft scheduling assignments across a date range; set notifyUsers to alert the affected users.",
            inputSchema: {
                start: z.string().min(1),
                end: z.string().min(1),
                notifyUsers: z.boolean().optional(),
                search: z.string().optional(),
                extra: z
                    .record(z.unknown())
                    .optional()
                    .describe(
                        "Additional publish filters, e.g. userFilter, userGroupFilter, viewType",
                    ),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const { extra } = args;
            await ctx.client.scheduling.publish({
                workspaceId: ctx.workspaceId,
                start: args.start,
                end: args.end,
                ...(args.notifyUsers !== undefined ? { notifyUsers: args.notifyUsers } : {}),
                ...(args.search !== undefined ? { search: args.search } : {}),
                ...(extra ?? {}),
            });
            return successResult(
                "clockify_scheduling_publish",
                { published: true, start: args.start, end: args.end },
                { workspaceId: ctx.workspaceId },
            );
        },
    );

    defineTool(
        server,
        "clockify_scheduling_capacity",
        {
            title: "Scheduling user capacity",
            description:
                "List each user's scheduled capacity totals across a date range, filtered by user, group, or status.",
            inputSchema: {
                start: z.string().min(1),
                end: z.string().min(1),
                search: z.string().optional(),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                extra: z
                    .record(z.unknown())
                    .optional()
                    .describe(
                        "Additional capacity filters, e.g. userFilter, userGroupFilter, statusFilter",
                    ),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const { extra, page, pageSize, ...rest } = args;
            const items = await ctx.client.scheduling.getUsersCapacityFiltered({
                start: rest.start,
                end: rest.end,
                ...(rest.search !== undefined ? { search: rest.search } : {}),
                page: page ?? 1,
                pageSize: pageSize ?? 50,
                ...(extra ?? {}),
                workspaceId: ctx.workspaceId,
            });
            return successResult(
                "clockify_scheduling_capacity",
                items,
                {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                    page: page ?? 1,
                    pageSize: pageSize ?? 50,
                },
                { entity: "scheduling" },
            );
        },
    );
}
