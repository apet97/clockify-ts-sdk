import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { pageWithMeta } from "./paging.js";

type ClientUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>;

function clientUpdateBody(current: unknown): ClientUpdateBody {
    if (current == null || typeof current !== "object") {
        throw new TypeError("Cannot update client: current client state is unavailable.");
    }
    const value = current as Record<string, unknown>;
    if (typeof value.name !== "string" || value.name.length === 0) {
        throw new TypeError("Cannot update client: current client name is missing.");
    }
    const body: ClientUpdateBody = { name: value.name };
    for (const field of ["address", "email", "note"] as const) {
        const fieldValue = value[field];
        if (fieldValue === undefined || fieldValue === null) continue;
        if (typeof fieldValue !== "string") {
            throw new TypeError(`Cannot update client: current ${field} is invalid.`);
        }
        body[field] = fieldValue;
    }
    if (value.currencyCode !== undefined && value.currencyCode !== null) {
        if (typeof value.currencyCode !== "string") {
            throw new TypeError("Cannot update client: current currencyCode is invalid.");
        }
        body.currencyCode = value.currencyCode;
    }
    if (value.archived !== undefined) {
        if (typeof value.archived !== "boolean") {
            throw new TypeError("Cannot update client: current archived state is invalid.");
        }
        body.archived = value.archived;
    }
    return body;
}

function sameClientField(left: unknown, right: unknown): boolean {
    return left === right;
}

export function registerClientsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_clients_list",
        {
            title: "List clients",
            description: "List clients in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const page = args.page ?? 1;
            const pageSize = args.pageSize ?? 50;
            const req: ClockifyApi.ListClientsRequest = {
                workspaceId: ctx.workspaceId,
                page,
                "page-size": pageSize,
            };
            if (args.name) req.name = args.name;
            if (args.archived !== undefined) req.archived = args.archived;
            const { items: clients, meta } = await pageWithMeta(ctx.client.clients.list(req), {
                workspaceId: ctx.workspaceId,
                page,
                pageSize,
            });
            return successResult("clockify_clients_list", clients, {
                ...meta,
            });
        },
    );

    defineTool(
        server,
        "clockify_clients_create",
        {
            title: "Create a client",
            description: "Create a client record in the pinned workspace with optional notes.",
            inputSchema: {
                name: z.string().min(1),
                note: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const req: ClockifyApi.ClientCreate = {
                workspaceId: ctx.workspaceId,
                body: {
                    name: args.name,
                    ...(args.note !== undefined ? { note: args.note } : {}),
                },
            };
            const client = await ctx.client.clients.create(req);
            const clientId = entityId(client);
            return successResult(
                "clockify_clients_create",
                client,
                undefined,
                writeReceipt(
                    "created",
                    "client",
                    { id: clientId, name: args.name },
                    {
                        next: [
                            {
                                tool: "clockify_projects_create",
                                ...(clientId ? { args: { clientId } } : {}),
                                reason: "Create a project for the new client.",
                            },
                        ],
                    },
                ),
            );
        },
    );

    defineTool(
        server,
        "clockify_clients_get",
        {
            title: "Get a client",
            description: "Fetch one client by ID from the pinned Clockify workspace.",
            inputSchema: { clientId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const client = await ctx.client.clients.get({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
            return successResult("clockify_clients_get", client, {
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
        },
    );

    defineTool(
        server,
        "clockify_clients_update",
        {
            title: "Update a client",
            description: "Update client metadata such as name, note, address, or archived state.",
            inputSchema: {
                clientId: z.string().min(1),
                name: z.string().min(1).optional(),
                note: z.string().optional(),
                address: z.string().optional(),
                archived: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const current = await ctx.client.clients.get({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
            const body = clientUpdateBody(current);
            let changed = false;
            if (args.name !== undefined) {
                changed ||= !sameClientField(body.name, args.name);
                body.name = args.name;
            }
            if (args.note !== undefined) {
                changed ||= !sameClientField(body.note, args.note);
                body.note = args.note;
            }
            if (args.address !== undefined) {
                changed ||= !sameClientField(body.address, args.address);
                body.address = args.address;
            }
            if (args.archived !== undefined) {
                changed ||= !sameClientField(body.archived, args.archived);
                body.archived = args.archived;
            }
            if (!changed) {
                throw new TypeError("Client update is a no-op; supply at least one changed field.");
            }
            const req: ClockifyApi.UpdateClientsRequest = {
                body,
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            };
            const updated = await ctx.client.clients.update(req);
            return successResult(
                "clockify_clients_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                },
                writeReceipt("updated", "client", args.clientId),
            );
        },
    );

    defineTool(
        server,
        "clockify_clients_delete",
        {
            title: "Delete a client",
            description:
                "Permanently delete one client by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                clientId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "client", id: args.clientId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_clients_delete",
                "client_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            const current = await ctx.client.clients.get({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
            const body = clientUpdateBody(current);
            if (body.archived !== true) {
                body.archived = true;
                const request: ClockifyApi.UpdateClientsRequest = {
                    body,
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                };
                await ctx.client.clients.update(request);
            }
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
            return successResult(
                "clockify_clients_delete",
                { deleted: true, clientId: args.clientId },
                { workspaceId: ctx.workspaceId, clientId: args.clientId },
                writeReceipt("deleted", "client", args.clientId, {
                    next: [
                        {
                            tool: "clockify_clients_list",
                            reason: "Verify the client no longer appears.",
                        },
                    ],
                }),
            );
        },
    );
}
