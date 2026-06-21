import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { archiveThenDeleteClient } from "clockify-sdk-ts-115/ensure";
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

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
            const req: ClockifyApi.ListClientsRequest = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.name) req.name = args.name;
            if (args.archived !== undefined) req.archived = args.archived;
            const clients = await ctx.client.clients.list(req);
            return successResult("clockify_clients_list", clients, {
                workspaceId: ctx.workspaceId,
                count: clients.length,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
                hasMore: clients.length === (args.pageSize ?? 50),
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
                name: z.string().optional(),
                note: z.string().optional(),
                address: z.string().optional(),
                archived: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: Partial<ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>> & {
                archived?: boolean;
            } = {};
            if (args.name) body.name = args.name;
            if (args.note !== undefined) body.note = args.note;
            if (args.address !== undefined) body.address = args.address;
            if (args.archived !== undefined) body.archived = args.archived;
            const req = wireBody<ClockifyApi.UpdateClientsRequest>({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
                body,
            });
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
            // archiveThenDeleteClient owns the live-verified sequence (GET name →
            // archive via the BODY-ENVELOPE PUT that bypasses the clients.update
            // field whitelist [address, currencyCode, email, name, note] via
            // core.bodyFromRequest, landing archived:true on the wire → DELETE)
            // AND the empty-name guard (throws → errorResult via defineTool's
            // catch). Bare DELETE of an ACTIVE client 400s (live-verified
            // 2026-06-15) and clients.archive 404s. See
            // spec/evidence/discrepancies.md `deletes.archive-first.clients-blocked`.
            await archiveThenDeleteClient({
                workspaceId: ctx.workspaceId,
                id: args.clientId,
                resource: ctx.client.clients,
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
