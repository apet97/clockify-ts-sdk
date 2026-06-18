import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

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
            const req: ClockifyApi.ListProjectsRequest = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.name) req.name = args.name;
            if (args.archived !== undefined) req.archived = args.archived;
            if (args.clientId) req.clients = [args.clientId];
            const projects = await ctx.client.projects.list(req);
            return successResult("clockify_projects_list", projects, {
                workspaceId: ctx.workspaceId,
                count: projects.length,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
                hasMore: projects.length === (args.pageSize ?? 50),
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
                name: z.string().min(1),
                clientId: z.string().optional(),
                color: z.string().optional(),
                billable: z.boolean().optional(),
                isPublic: z.boolean().optional(),
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
                },
            };
            const project = await ctx.client.projects.create(req);
            return successResult(
                "clockify_projects_create",
                project,
                undefined,
                writeReceipt("created", "project", { id: entityId(project), name: args.name }),
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
                name: z.string().optional(),
                clientId: z.string().optional(),
                color: z.string().optional(),
                billable: z.boolean().optional(),
                isPublic: z.boolean().optional(),
                archived: z.boolean().optional(),
                note: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.UpdateProjectsRequest> = {};
            if (args.name) body.name = args.name;
            if (args.clientId) body.clientId = args.clientId;
            if (args.color) body.color = args.color;
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
            // Clockify rejects DELETE of an ACTIVE project (400 "Cannot delete
            // an active project", live-verified 2026-06-15) and the dedicated
            // /archive route 404s — archive first via GET-then-PUT, carrying
            // the name the replace-PUT requires.
            const current = (await ctx.client.projects.get({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
            })) as { name?: string };
            await ctx.client.projects.update({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                name: String(current.name ?? ""),
                archived: true,
            });
            await ctx.client.projects.delete({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
            });
            return successResult(
                "clockify_projects_delete",
                { deleted: true, projectId: args.projectId },
                { workspaceId: ctx.workspaceId, projectId: args.projectId },
                writeReceipt("deleted", "project", args.projectId),
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
                amount: z.number().describe("Rate in major units, e.g. 75 for $75/hr."),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const amountMinor = toMinor(args.amount, "major");
            const req: Record<string, unknown> = {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                userId: args.userId,
                amount: amountMinor,
            };
            if (args.since) req.since = args.since;
            const updated =
                args.rateKind === "COST"
                    ? await ctx.client.projects.updateUserCostRate(
                          wireBody<ClockifyApi.UpdateUserCostRateProjectsRequest>(req),
                      )
                    : await ctx.client.projects.updateUserHourlyRate(
                          wireBody<ClockifyApi.UpdateUserHourlyRateProjectsRequest>(req),
                      );
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
