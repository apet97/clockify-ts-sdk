/**
 * `clk115 clients {list,create,get,update,delete}`.
 */
import { archiveThenDeleteClient } from "clockify-sdk-ts-115/ensure";
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

type ClientUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>;

function requireClientName(value: unknown, source: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${source} is missing the required client name; refusing to mutate.`);
    }
    return value;
}

function optionalClientString(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
        throw new Error(`Current client has invalid ${field}; refusing to mutate.`);
    }
    return value;
}

function optionalNullableClientString(value: unknown, field: string): string | undefined {
    if (value === null) return undefined;
    return optionalClientString(value, field);
}

function requiredClientArchived(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new Error("Current client has invalid or missing archived state; refusing to mutate.");
    }
    return value;
}

function reconstructClientBody(
    current: Partial<ClockifyApi.Client>,
    suppliedName?: unknown,
): ClientUpdateBody {
    const body: ClientUpdateBody = {
        name:
            suppliedName !== undefined
                ? requireClientName(suppliedName, "Client update request")
                : requireClientName(current.name, "Current client"),
    };
    const address = optionalNullableClientString(current.address, "address");
    if (address !== undefined) body.address = address;
    const currencyCode = optionalClientString(current.currencyCode, "currencyCode");
    if (currencyCode !== undefined) body.currencyCode = currencyCode;
    const email = optionalNullableClientString(current.email, "email");
    if (email !== undefined) body.email = email;
    const note = optionalNullableClientString(current.note, "note");
    if (note !== undefined) body.note = note;
    body.archived = requiredClientArchived(current.archived);
    return body;
}

export const registerClientsCommand: Registrar = (program, services) => {
    const clients = program.command("clients").description("Manage clients.");

    leafCommand(clients, "list", "read")
        .description("List clients in the workspace.")
        .option(
            "--limit <n>",
            "Items per page (default 25, max 200).",
            parseIntArg,
            25,
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by client name substring.")
        .option("--archived", "Show only archived clients (default lists both archived and active).", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListClientsRequest = {
                workspaceId,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            const items = await client.clients.list(req);
            const rows = items.map((raw) => {
                const c = raw as {
                    id?: string;
                    name?: string;
                    note?: string;
                    archived?: boolean;
                };
                return {
                    id: c.id ?? "",
                    name: c.name ?? "",
                    note: c.note ?? "",
                    archived: c.archived === true,
                };
            });
            printRecords(rows, output);
        });

    leafCommand(clients, "create", "write")
        .argument("<name>", "Client name.")
        .option("--note <text>", "Client note.")
        .description("Create a client in the workspace.")
        .action(async function (this: Command, name: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ClientCreate = {
                workspaceId,
                body: { name, ...(opts.note !== undefined ? { note: opts.note } : {}) },
            };
            const created = (await client.clients.create(req)) as {
                id?: string;
                name?: string;
            };
            const data = { id: created.id ?? "", name: created.name ?? "" };
            printReceipt(
                {
                    ok: true,
                    action: "clients.create",
                    entity: "client",
                    ids: { clientId: data.id },
                    data,
                    changed: { created: [{ type: "client", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 projects create <name> --client ${data.id}`,
                            reason: "Create a project for this client.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(clients, "get", "read")
        .argument("<id>", "Client ID.")
        .description("Get one client by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const result = await client.clients.get({ workspaceId, clientId: id });
            printObject(result, output);
        });

    leafCommand(clients, "update", "write")
        .argument("<id>", "Client ID.")
        .option("--name <text>", "Client name.")
        .option("--note <text>", "Client note.")
        .option("--address <text>", "Client address.")
        .option("--archived", "Archive the client.")
        .option("--no-archived", "Unarchive the client.")
        .description("Update a client by ID.")
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const hasChanges =
                opts.name !== undefined ||
                opts.note !== undefined ||
                opts.address !== undefined ||
                opts.archived !== undefined;
            if (!hasChanges) {
                throw new Error("clients.update requires at least one client field to change.");
            }
            const current = (await client.clients.get({
                workspaceId,
                clientId: id,
            })) as Partial<ClockifyApi.Client>;
            const body = reconstructClientBody(current, opts.name);
            let changed = opts.name !== undefined && opts.name !== current.name;
            if (opts.note !== undefined) {
                changed = changed || opts.note !== body.note;
                body.note = opts.note;
            }
            if (opts.address !== undefined) {
                changed = changed || opts.address !== body.address;
                body.address = opts.address;
            }
            if (opts.archived !== undefined) {
                changed = changed || opts.archived !== body.archived;
                body.archived = opts.archived;
            }
            if (!changed) {
                throw new Error("clients.update values are unchanged; refusing to mutate.");
            }
            const req: ClockifyApi.UpdateClientsRequest = {
                workspaceId,
                clientId: id,
                body,
            };
            const updated = (await client.clients.update(req)) as {
                id?: string;
                name?: string;
            };
            const data = { id: updated.id ?? id, name: updated.name ?? body.name };
            printReceipt(
                {
                    ok: true,
                    action: "clients.update",
                    entity: "client",
                    ids: { clientId: data.id },
                    data,
                    changed: { updated: [{ type: "client", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: `clk115 clients get ${data.id} --json`,
                            reason: "Verify the update.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(clients, "delete", "destructive")
        .argument("<id>", "Client ID.")
        .description("Delete a client by ID (archives first; an active client cannot be deleted).")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await archiveThenDeleteClient({
                workspaceId,
                id,
                adapter: {
                    getCurrent: ({ workspaceId: currentWorkspaceId, id: clientId }) =>
                        client.clients.get({ workspaceId: currentWorkspaceId, clientId }),
                    archive: async ({ workspaceId: currentWorkspaceId, id: clientId, current }) => {
                        await client.clients.update({
                            workspaceId: currentWorkspaceId,
                            clientId,
                            body: reconstructClientBody({ ...current, archived: true }),
                        });
                    },
                    delete: async ({ workspaceId: currentWorkspaceId, id: clientId }) => {
                        await client.clients.delete({ workspaceId: currentWorkspaceId, clientId });
                    },
                },
            });
            printReceipt(
                {
                    ok: true,
                    action: "clients.delete",
                    entity: "client",
                    ids: { clientId: id },
                    data: { id, deleted: true, message: `deleted client ${id}` },
                    changed: { deleted: [{ type: "client", id }] },
                    next: [
                        {
                            command: "clk115 clients list --json",
                            reason: "Verify the client no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
