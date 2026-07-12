/**
 * Workspace + project custom fields. Clockify splits the surface in
 * two: workspace-level definitions (list/create/update/delete) and
 * project-scoped associations (list/update/remove).
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

const CUSTOM_FIELD_TYPES = [
    "TXT",
    "NUMBER",
    "DROPDOWN_SINGLE",
    "DROPDOWN_MULTIPLE",
    "CHECKBOX",
    "LINK",
] as const;
const CUSTOM_FIELD_STATUSES = ["INACTIVE", "VISIBLE", "INVISIBLE"] as const;
type CustomFieldUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateForWorkspaceCustomFieldsRequest>;

function customFieldType(value: unknown): ClockifyApi.CustomFieldType {
    const match = CUSTOM_FIELD_TYPES.find((candidate) => candidate === value);
    if (match === undefined) {
        throw new TypeError("Cannot update custom field: current type is missing or invalid.");
    }
    return match;
}

function customFieldStatus(value: unknown): ClockifyApi.CustomFieldStatus {
    const match = CUSTOM_FIELD_STATUSES.find((candidate) => candidate === value);
    if (match === undefined) {
        throw new TypeError("Cannot update custom field: current status is invalid.");
    }
    return match;
}

function customFieldValue(value: unknown): ClockifyApi.CustomFieldValue {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return value;
    }
    if (Array.isArray(value)) {
        if (value.some((item) => typeof item !== "string")) {
            throw new TypeError(
                "Cannot update custom field: current workspaceDefaultValue is invalid.",
            );
        }
        return [...value];
    }
    if (typeof value === "object") {
        return { ...(value as Record<string, unknown>) };
    }
    throw new TypeError("Cannot update custom field: current workspaceDefaultValue is invalid.");
}

function customFieldUpdateBody(current: unknown): CustomFieldUpdateBody {
    if (current == null || typeof current !== "object") {
        throw new TypeError("Cannot update custom field: current state is unavailable.");
    }
    const value = current as Record<string, unknown>;
    if (typeof value.name !== "string" || value.name.length === 0) {
        throw new TypeError("Cannot update custom field: current name is missing.");
    }
    const body: CustomFieldUpdateBody = {
        name: value.name,
        type: customFieldType(value.type),
    };
    if (value.allowedValues !== undefined) {
        if (
            !Array.isArray(value.allowedValues) ||
            value.allowedValues.some((v) => typeof v !== "string")
        ) {
            throw new TypeError("Cannot update custom field: current allowedValues are invalid.");
        }
        body.allowedValues = [...value.allowedValues];
    }
    for (const field of ["description", "placeholder"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`Cannot update custom field: current ${field} is invalid.`);
        }
        body[field] = fieldValue;
    }
    for (const field of ["onlyAdminCanEdit", "required"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined) continue;
        if (typeof fieldValue !== "boolean") {
            throw new TypeError(`Cannot update custom field: current ${field} is invalid.`);
        }
        body[field] = fieldValue;
    }
    if (value.status !== undefined) {
        body.status = customFieldStatus(value.status);
    }
    if (value.workspaceDefaultValue !== undefined) {
        body.workspaceDefaultValue = customFieldValue(value.workspaceDefaultValue);
    }
    return body;
}

function sameCustomFieldValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

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
                type: z
                    .enum(CUSTOM_FIELD_TYPES)
                    .describe("Clockify field type, e.g. TXT, NUMBER, DROPDOWN_SINGLE."),
                allowedValues: z.array(z.string()).optional(),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                description: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.CreateForWorkspaceCustomFieldsRequest> = {
                name: args.name,
                type: args.type,
            };
            if (args.allowedValues) body.allowedValues = args.allowedValues;
            if (args.required !== undefined) body.required = args.required;
            if (args.placeholder) body.placeholder = args.placeholder;
            if (args.description) body.description = args.description;
            const request: ClockifyApi.CreateForWorkspaceCustomFieldsRequest = {
                body,
                workspaceId: ctx.workspaceId,
            };
            const created = await ctx.client.customFields.createForWorkspace(request);
            return successResult(
                "clockify_custom_fields_create",
                created,
                {
                    workspaceId: ctx.workspaceId,
                },
                writeReceipt("created", "custom_field", { id: entityId(created), name: args.name }),
            );
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
                name: z.string().min(1).optional(),
                allowedValues: z.array(z.string()).optional(),
                required: z.boolean().optional(),
                placeholder: z.string().optional(),
                description: z.string().optional(),
                status: z.enum(CUSTOM_FIELD_STATUSES).optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            let current: unknown;
            const seenPages = new Set<string>();
            for (let page = 1; current === undefined; page += 1) {
                const listed = (await ctx.client.customFields.listForWorkspace({
                    workspaceId: ctx.workspaceId,
                    page,
                    "page-size": 200,
                })) as unknown;
                if (!Array.isArray(listed)) {
                    throw new TypeError(
                        "Cannot update custom field: workspace field list is invalid.",
                    );
                }
                const fingerprint = JSON.stringify(
                    listed.map((item) =>
                        item != null && typeof item === "object"
                            ? ((item as { id?: unknown }).id ?? null)
                            : null,
                    ),
                );
                if (seenPages.has(fingerprint)) {
                    throw new TypeError(
                        "Cannot update custom field: workspace field pagination repeated a page.",
                    );
                }
                seenPages.add(fingerprint);
                current = listed.find(
                    (item) =>
                        item != null &&
                        typeof item === "object" &&
                        (item as { id?: unknown }).id === args.customFieldId,
                );
                if (current !== undefined || listed.length < 200) break;
            }
            if (current === undefined) {
                throw new TypeError("Cannot update custom field: current field was not found.");
            }
            const body = customFieldUpdateBody(current);
            let changed = false;
            if (args.name !== undefined) {
                changed ||= !sameCustomFieldValue(body.name, args.name);
                body.name = args.name;
            }
            if (args.allowedValues !== undefined) {
                changed ||= !sameCustomFieldValue(body.allowedValues, args.allowedValues);
                body.allowedValues = args.allowedValues;
            }
            if (args.required !== undefined) {
                changed ||= !sameCustomFieldValue(body.required, args.required);
                body.required = args.required;
            }
            if (args.placeholder !== undefined) {
                changed ||= !sameCustomFieldValue(body.placeholder, args.placeholder);
                body.placeholder = args.placeholder;
            }
            if (args.description !== undefined) {
                changed ||= !sameCustomFieldValue(body.description, args.description);
                body.description = args.description;
            }
            if (args.status !== undefined) {
                changed ||= !sameCustomFieldValue(body.status, args.status);
                body.status = args.status;
            }
            if (!changed) {
                throw new TypeError("Custom field update is a no-op; supply a changed field.");
            }
            const request: ClockifyApi.UpdateForWorkspaceCustomFieldsRequest = {
                body,
                workspaceId: ctx.workspaceId,
                customFieldId: args.customFieldId,
            };
            const updated = await ctx.client.customFields.updateForWorkspace(request);
            return successResult(
                "clockify_custom_fields_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    customFieldId: args.customFieldId,
                },
                writeReceipt("updated", "custom_field", args.customFieldId),
            );
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
            const confirmation = requireConfirmation(
                ctx,
                "clockify_custom_fields_delete",
                "custom_field_delete",
                args,
                preview,
            );
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
            description:
                "Update a custom field association on a project (status and/or default value). Allowed values are defined on the workspace-level definition, not the project association.",
            inputSchema: {
                projectId: z.string().min(1),
                customFieldId: z.string().min(1),
                status: z.enum(CUSTOM_FIELD_STATUSES).optional(),
                defaultValue: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            // editProjectCustomFieldDefaultValue (PATCH project custom field) accepts ONLY
            // defaultValue + status (CustomFieldProjectDefaultValuesRequest). allowedValues is
            // not part of that body — it belongs to the workspace-level definition — so it is
            // never sent here.
            if (args.status === undefined && args.defaultValue === undefined) {
                throw new TypeError(
                    "Project custom field update is a no-op; supply a changed field.",
                );
            }
            const body: ClockifyRequestBody<ClockifyApi.UpdateForProjectCustomFieldsRequest> = {};
            if (args.status !== undefined) body.status = args.status;
            if (args.defaultValue !== undefined) body.defaultValue = args.defaultValue;
            const updated = await ctx.client.customFields.updateForProject({
                workspaceId: ctx.workspaceId,
                projectId: args.projectId,
                customFieldId: args.customFieldId,
                body,
            });
            return successResult(
                "clockify_project_custom_fields_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    projectId: args.projectId,
                    customFieldId: args.customFieldId,
                },
                writeReceipt("updated", "project_custom_field", args.customFieldId),
            );
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
            const confirmation = requireConfirmation(
                ctx,
                "clockify_project_custom_fields_remove",
                "project_custom_field_remove",
                args,
                preview,
            );
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
