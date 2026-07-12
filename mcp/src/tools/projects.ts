import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { archiveThenDeleteProject } from "clockify-sdk-ts-115/ensure";
import { toMinor } from "clockify-sdk-ts-115/money";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";

const PROJECT_NAME_SCHEMA = z.string().min(2).max(250);
const PROJECT_COLOR_SCHEMA = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const PROJECT_NOTE_SCHEMA = z.string().max(16_384);

export function registerProjectsTools(server: McpServer, ctx: Context): void {
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { destructiveHint: false, idempotentHint: false },
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { readOnlyHint: false, idempotentHint: true },
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

    defineTool(
        server,
        "clockify_projects_delete",
        {
            title: "Delete a project",
            description:
                "Permanently delete one project by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                projectId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "project", id: args.projectId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_projects_delete",
                "project_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            // archiveThenDeleteProject owns the live-verified sequence (GET name →
            // archive PUT archived:true → DELETE) and the empty-name guard: bare
            // DELETE of an ACTIVE project 400s ("Cannot delete an active project",
            // live-verified 2026-06-15) and the /archive route 404s. See
            // spec/evidence/discrepancies.md `deletes.archive-first.projects-tasks`.
            await archiveThenDeleteProject({
                workspaceId: ctx.workspaceId,
                id: args.projectId,
                resource: ctx.client.projects,
            });
            return successResult(
                "clockify_projects_delete",
                { deleted: true, projectId: args.projectId },
                { workspaceId: ctx.workspaceId, projectId: args.projectId },
                writeReceipt("deleted", "project", args.projectId, {
                    next: [
                        {
                            tool: "clockify_projects_list",
                            reason: "Verify the project no longer appears.",
                        },
                    ],
                }),
            );
        },
    );

    defineTool(
        server,
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
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const amountMinor = toMinor(args.amount, "major");
            let updated: unknown;
            if (args.rateKind === "COST") {
                const request: ClockifyApi.UpdateUserCostRateProjectsRequest = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    userId: args.userId,
                    amount: amountMinor,
                    ...(args.since ? { since: args.since } : {}),
                };
                updated = await ctx.client.projects.updateUserCostRate(request);
            } else {
                const request: ClockifyApi.UpdateUserHourlyRateProjectsRequest = {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    userId: args.userId,
                    amount: amountMinor,
                    ...(args.since ? { since: args.since } : {}),
                };
                updated = await ctx.client.projects.updateUserHourlyRate(request);
            }
            return successResult(
                "clockify_projects_set_member_rate",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    userId: args.userId,
                    rateKind: args.rateKind,
                    amountMajor: args.amount,
                    amountMinor,
                },
                writeReceipt("updated", "project", args.projectId),
            );
        },
    );
}
