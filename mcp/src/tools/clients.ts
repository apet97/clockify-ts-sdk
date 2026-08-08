import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import {
    defineGuardedTool,
    defineTool,
    entityId,
    successResult,
    type Warning,
    writeReceipt,
} from "../result.js";

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
        // Live-probed 2026-08-08: Clockify ignores `currencyCode` on both POST and
        // PUT — only `currencyId` sets a client's currency, and the request types
        // do not declare it. Re-sending this field is inert, and the currency is
        // sticky when omitted, so nothing is lost. Kept because the guard above is
        // real and removing the field would be a surface change for no gain. See
        // spec/evidence/discrepancies.md `clients.write.currency-code-is-inert`.
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

/**
 * A client update is a PUT that replaces the record, and `ccEmails` is the one
 * field this tool cannot carry across it: the GET returns it, but no client
 * request type declares it, so `clientUpdateBody` cannot re-send it and the
 * update clears it. Live-probed 2026-08-08 — a note-only update turned two
 * addresses into `null` while reporting `ok: true`.
 *
 * Preserving it needs a spec fix in GOCLMCP, not a change here. Until then the
 * loss is at least visible. The warning fires only when there is something to
 * lose, so an update on a client with no CC addresses stays quiet.
 */
function droppedCcEmailsWarning(current: unknown): { warnings?: Warning[] } {
    const ccEmails = (current as Record<string, unknown> | undefined)?.ccEmails;
    if (!Array.isArray(ccEmails) || ccEmails.length === 0) return {};
    return {
        warnings: [
            {
                code: "cc_emails_cleared",
                message: `This update cleared ${ccEmails.length} CC email address(es); Clockify's client update replaces the record and the API exposes no way to re-send them. Restore them in the Clockify UI if they are still needed.`,
            },
        ],
    };
}

export function registerClientsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_clients_list",
        {
            title: "List clients",
            description: "List clients in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                name: z.string().optional(),
                archived: z.boolean().optional(),
            },
            idempotent: true,
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
            idempotent: true,
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
            idempotent: true,
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
                throw new TypeError("Client update is a no-op; provide at least one changed field.");
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
                writeReceipt("updated", "client", args.clientId, droppedCcEmailsWarning(current)),
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_clients_delete",
        {
            title: "Delete a client",
            description:
                "Permanently delete one client by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: { clientId: z.string().min(1) },
        },
        {
            preview: async (args) => {
                const deleteRequest = {
                    workspaceId: ctx.workspaceId,
                    clientId: args.clientId,
                };
                const current = await ctx.client.clients.get(deleteRequest);
                const body = clientUpdateBody(current);
                const archiveRequest =
                    body.archived === true
                        ? undefined
                        : ({
                              ...deleteRequest,
                              body: { ...body, archived: true },
                          } satisfies ClockifyApi.UpdateClientsRequest);
                return {
                    action: "delete",
                    entity: "client",
                    id: args.clientId,
                    deleteRequest,
                    ...(archiveRequest ? { archiveRequest } : {}),
                };
            },
            execute: async (preview) => {
                if (preview.archiveRequest) {
                    await ctx.client.clients.update(preview.archiveRequest);
                }
                await ctx.client.clients.delete(preview.deleteRequest);
                return successResult(
                    "clockify_clients_delete",
                    { deleted: true, clientId: preview.id },
                    { workspaceId: preview.deleteRequest.workspaceId, clientId: preview.id },
                    writeReceipt("deleted", "client", preview.id, {
                        next: [
                            {
                                tool: "clockify_clients_list",
                                reason: "Verify the client no longer appears.",
                            },
                        ],
                    }),
                );
            },
        },
    );
}
