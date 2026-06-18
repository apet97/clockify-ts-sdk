import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi } from "clockify-sdk-ts-115";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, errorResult, successResult, writeReceipt } from "../result.js";

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
            const body: Record<string, unknown> = { name: args.name };
            if (args.note) body.note = args.note;
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            const client = await ctx.client.clients.create({ workspaceId: ctx.workspaceId, body } as never);
            return successResult("clockify_clients_create", client, undefined, writeReceipt("created", "client", { id: entityId(client), name: args.name }));
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
            const body: Record<string, unknown> = {};
            if (args.name) body.name = args.name;
            if (args.note !== undefined) body.note = args.note;
            if (args.address !== undefined) body.address = args.address;
            if (args.archived !== undefined) body.archived = args.archived;
            const updated = await ctx.client.clients.update({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
                body,
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            } as never);
            return successResult("clockify_clients_update", updated, {
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            }, writeReceipt("updated", "client", args.clientId));
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
            const confirmation = requireConfirmation(ctx, "clockify_clients_delete", "client_delete", args, preview);
            if (confirmation) return confirmation;
            // Clockify rejects DELETE of an ACTIVE client (400, live-verified
            // 2026-06-15) and the dedicated `clients.archive` route 404s. The
            // generated `clients.update` FLATTENED form drops `archived`
            // (whitelist [address, currencyCode, email, name, note]), but the
            // BODY-ENVELOPE form bypasses the whitelist via core.bodyFromRequest
            // (wrapper request.ts), landing `archived:true` on the wire. So
            // archive first via GET-then-PUT (body envelope) — carrying the name
            // the replace-PUT requires — then DELETE, mirroring
            // clockify_projects_delete. See spec/evidence/discrepancies.md
            // `deletes.archive-first.clients-blocked`.
            const current = (await ctx.client.clients.get({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            })) as { name?: string };
            const name = String(current.name ?? "");
            if (!name) {
                return errorResult(
                    "clockify_clients_delete",
                    new Error("Cannot archive client before delete: the client has no name to carry through the replace-PUT."),
                );
            }
            await ctx.client.clients.update({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
                body: { name, archived: true },
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            } as never);
            await ctx.client.clients.delete({
                workspaceId: ctx.workspaceId,
                clientId: args.clientId,
            });
            return successResult(
                "clockify_clients_delete",
                { deleted: true, clientId: args.clientId },
                { workspaceId: ctx.workspaceId, clientId: args.clientId },
                writeReceipt("deleted", "client", args.clientId),
            );
        },
    );
}
