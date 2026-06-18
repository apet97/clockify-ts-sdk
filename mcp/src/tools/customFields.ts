/**
 * Workspace + project custom fields. Clockify splits the surface in
 * two: workspace-level definitions (list/create/update/delete) and
 * project-scoped associations (list/update/remove).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, successResult, writeReceipt } from "../result.js";

export function registerCustomFieldsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
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
            const items = (await ctx.client.customFields.listForWorkspace({
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            })) as unknown[];
            return successResult("clockify_custom_fields_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
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
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
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
            }, writeReceipt("created", "custom_field", { id: (created as { id?: string }).id, name: args.name }));
        },
    );

    defineTool(
        server,
        "clockify_custom_fields_update",
        {
            title: "Update a workspace custom field",
            description: "Update a workspace custom field definition and its allowed values.",
            inputSchema: {
                customFieldId: z.string().min(1),
                name: z.string().optional(),
                allowedValues: z.array(z.string()).optional(),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                description: z.string().optional(),
                status: z.string().optional().describe("ACTIVE | INACTIVE."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
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
            }, writeReceipt("updated", "custom_field", args.customFieldId));
        },
    );

    defineTool(
        server,
        "clockify_custom_fields_delete",
        {
            title: "Delete a workspace custom field",
            description:
                "Permanently delete a workspace custom field definition. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                customFieldId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "custom_field", id: args.customFieldId };
            const confirmation = requireConfirmation(ctx, "clockify_custom_fields_delete", "custom_field_delete", args, preview);
            if (confirmation) return confirmation;
            await ctx.client.customFields.deleteForWorkspace({
                workspaceId: ctx.workspaceId,
                customFieldId: args.customFieldId,
            });
            return successResult(
                "clockify_custom_fields_delete",
                { deleted: true, customFieldId: args.customFieldId },
                { workspaceId: ctx.workspaceId, customFieldId: args.customFieldId },
                writeReceipt("deleted", "custom_field", args.customFieldId),
            );
        },
    );

    defineTool(
        server,
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
            const items = (await ctx.client.customFields.listForProject({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            })) as unknown[];
            return successResult("clockify_project_custom_fields_list", items, {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
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
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: Record<string, unknown> = {};
            if (args.status) body.status = args.status;
            if (args.defaultValue !== undefined) body.defaultValue = args.defaultValue;
            if (args.allowedValues) body.allowedValues = args.allowedValues;
            const updated = await ctx.client.customFields.updateForProject({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                customFieldId: args.customFieldId,
                body,
            });
            return successResult("clockify_project_custom_fields_update", updated, {
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                customFieldId: args.customFieldId,
            }, writeReceipt("updated", "project_custom_field", args.customFieldId));
        },
    );

    defineTool(
        server,
        "clockify_project_custom_fields_remove",
        {
            title: "Remove a custom field from a project",
            description:
                "Detach one custom field association from a project by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                projectId: z.string().min(1),
                customFieldId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = {
                action: "remove",
                entity: "project_custom_field",
                projectId: args.projectId,
                customFieldId: args.customFieldId,
            };
            const confirmation = requireConfirmation(ctx, "clockify_project_custom_fields_remove", "project_custom_field_remove", args, preview);
            if (confirmation) return confirmation;
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
                writeReceipt("deleted", "project_custom_field", args.customFieldId),
            );
        },
    );
}
