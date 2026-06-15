import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { errorResult, successResult } from "../result.js";

export function registerClientsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
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
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.name) req.name = args.name;
                if (args.archived !== undefined) req.archived = args.archived;
                const clients = (await ctx.client.clients.list(req as never)) as unknown[];
                return successResult("clockify_clients_list", clients, {
                    workspaceId: ctx.workspaceId,
                    count: clients.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                    hasMore: clients.length === (args.pageSize ?? 50),
                });
            } catch (err) {
                return errorResult("clockify_clients_list", err);
            }
        },
    );

    server.registerTool(
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
            try {
                const body: Record<string, unknown> = { name: args.name };
                if (args.note) body.note = args.note;
                const client = await ctx.client.clients.create({ workspaceId: ctx.workspaceId, body } as never);
                return successResult("clockify_clients_create", client);
            } catch (err) {
                return errorResult("clockify_clients_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_clients_get",
        {
            title: "Get a client",
            description: "Fetch one client by ID from the pinned Clockify workspace.",
            inputSchema: { clientId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const client = await ctx.client.clients.get({
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                });
                return successResult("clockify_clients_get", client, {
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                });
            } catch (err) {
                return errorResult("clockify_clients_get", err);
            }
        },
    );

    server.registerTool(
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
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.note !== undefined) body.note = args.note;
                if (args.address !== undefined) body.address = args.address;
                if (args.archived !== undefined) body.archived = args.archived;
                const updated = await ctx.client.clients.update({
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                    body,
                } as never);
                return successResult("clockify_clients_update", updated, {
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                });
            } catch (err) {
                return errorResult("clockify_clients_update", err);
            }
        },
    );

    server.registerTool(
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
            try {
                const preview = { action: "delete", entity: "client", id: args.clientId };
                const confirmation = requireConfirmation(ctx, "clockify_clients_delete", "client_delete", args, preview);
                if (confirmation) return confirmation;
                // NOTE: unlike projects/tasks, this is NOT archive-then-delete.
                // Clockify rejects DELETE of an ACTIVE client, but the generated
                // `clients.update` whitelist drops `archived` and `clients.archive`
                // 404s — so the typed SDK exposes no client-archive path (a
                // generator/spec defect; see spec/evidence/discrepancies.md
                // `deletes.archive-first.clients-blocked`). The bare DELETE 400s on
                // an active client with a clear API message until the spec is fixed.
                await ctx.client.clients.delete({
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                });
                return successResult(
                    "clockify_clients_delete",
                    { deleted: true, clientId: args.clientId },
                    { workspaceId: ctx.workspaceId, clientId: args.clientId },
                );
            } catch (err) {
                return errorResult("clockify_clients_delete", err);
            }
        },
    );
}
