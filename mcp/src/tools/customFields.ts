/**
 * Workspace + project custom fields. Clockify splits the surface in
 * two: workspace-level definitions (list/create/update/delete) and
 * project-scoped associations (list/update/remove).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

export function registerCustomFieldsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_custom_fields_list",
        {
            title: "List workspace custom fields",
            description: "List custom field definitions in the workspace.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.customFields.listForWorkspace({
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                } as never)) as unknown[];
                return successResult("clockify_custom_fields_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_custom_fields_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_custom_fields_create",
        {
            title: "Create a workspace custom field",
            description: "Create a custom field definition at the workspace level.",
            inputSchema: {
                name: z.string().min(1),
                type: z.string().min(1).describe("Clockify field type, e.g. TXT, NUMBER, DROPDOWN_SINGLE."),
                allowedValues: z.array(z.string()).optional(),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                description: z.string().optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { name: args.name, type: args.type };
                if (args.allowedValues) body.allowedValues = args.allowedValues;
                if (args.required !== undefined) body.required = args.required;
                if (args.placeholder) body.placeholder = args.placeholder;
                if (args.description) body.description = args.description;
                const created = await ctx.client.customFields.createForWorkspace({
                    workspaceId: ctx.workspaceId,
                    body,
                } as never);
                return successResult("clockify_custom_fields_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_custom_fields_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_custom_fields_update",
        {
            title: "Update a workspace custom field",
            description: "Update a custom field definition.",
            inputSchema: {
                customFieldId: z.string().min(1),
                name: z.string().optional(),
                allowedValues: z.array(z.string()).optional(),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                description: z.string().optional(),
                status: z.string().optional().describe("ACTIVE | INACTIVE."),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.allowedValues) body.allowedValues = args.allowedValues;
                if (args.required !== undefined) body.required = args.required;
                if (args.placeholder) body.placeholder = args.placeholder;
                if (args.description) body.description = args.description;
                if (args.status) body.status = args.status;
                const updated = await ctx.client.customFields.updateForWorkspace({
                    workspaceId: ctx.workspaceId,
                    customFieldId: args.customFieldId,
                    body,
                } as never);
                return successResult("clockify_custom_fields_update", updated, {
                    workspaceId: ctx.workspaceId,
                    customFieldId: args.customFieldId,
                });
            } catch (err) {
                return errorResult("clockify_custom_fields_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_custom_fields_delete",
        {
            title: "Delete a workspace custom field",
            description: "Permanently delete a workspace custom field definition.",
            inputSchema: { customFieldId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.customFields.deleteForWorkspace({
                    workspaceId: ctx.workspaceId,
                    customFieldId: args.customFieldId,
                });
                return successResult(
                    "clockify_custom_fields_delete",
                    { deleted: true, customFieldId: args.customFieldId },
                    { workspaceId: ctx.workspaceId, customFieldId: args.customFieldId },
                );
            } catch (err) {
                return errorResult("clockify_custom_fields_delete", err);
            }
        },
    );

    server.registerTool(
        "clockify_project_custom_fields_list",
        {
            title: "List project custom fields",
            description: "List custom field associations on a project.",
            inputSchema: {
                projectId: z.string().min(1),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.customFields.listForProject({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                } as never)) as unknown[];
                return successResult("clockify_project_custom_fields_list", items, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_project_custom_fields_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_project_custom_fields_update",
        {
            title: "Update a project custom field",
            description: "Update a custom field association on a project (status, defaults, allowed values).",
            inputSchema: {
                projectId: z.string().min(1),
                customFieldId: z.string().min(1),
                status: z.string().optional(),
                defaultValue: z.string().optional(),
                allowedValues: z.array(z.string()).optional(),
            },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.status) body.status = args.status;
                if (args.defaultValue !== undefined) body.defaultValue = args.defaultValue;
                if (args.allowedValues) body.allowedValues = args.allowedValues;
                const updated = await ctx.client.customFields.updateForProject({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    customFieldId: args.customFieldId,
                    body,
                } as never);
                return successResult("clockify_project_custom_fields_update", updated, {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    customFieldId: args.customFieldId,
                });
            } catch (err) {
                return errorResult("clockify_project_custom_fields_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_project_custom_fields_remove",
        {
            title: "Remove a custom field from a project",
            description: "Detach a custom field from a project.",
            inputSchema: {
                projectId: z.string().min(1),
                customFieldId: z.string().min(1),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.customFields.removeFromProject({
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    customFieldId: args.customFieldId,
                });
                return successResult(
                    "clockify_project_custom_fields_remove",
                    {
                        removed: true,
                        projectId: args.projectId,
                        customFieldId: args.customFieldId,
                    },
                    {
                        workspaceId: ctx.workspaceId,
                        projectId: args.projectId,
                        customFieldId: args.customFieldId,
                    },
                );
            } catch (err) {
                return errorResult("clockify_project_custom_fields_remove", err);
            }
        },
    );
}
