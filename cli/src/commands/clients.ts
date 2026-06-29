/**
 * `clk115 clients {list,create,get,update,delete}`.
 */
import { archiveThenDeleteClient } from "clockify-sdk-ts-115/ensure";
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerClientsCommand: Registrar = (program, services) => {
    const clients = program.command("clients").description("Manage clients.");

    clients
        .command("list")
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

    clients
        .command("create")
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

    clients
        .command("get")
        .argument("<id>", "Client ID.")
        .description("Get one client by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const result = await client.clients.get({ workspaceId, clientId: id });
            printObject(result, output);
        });

    clients
        .command("update")
        .argument("<id>", "Client ID.")
        .option("--name <text>", "New client name.")
        .option("--note <text>", "Client note.")
        .option("--address <text>", "Client address.")
        .option("--archived", "Archive the client.")
        .option("--no-archived", "Unarchive the client.")
        .description("Update a client by ID.")
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: Partial<ClockifyRequestBody<ClockifyApi.UpdateClientsRequest>> & {
                archived?: boolean;
            } = {};
            if (opts.name) body.name = opts.name;
            if (opts.note !== undefined) body.note = opts.note;
            if (opts.address !== undefined) body.address = opts.address;
            if (opts.archived !== undefined) body.archived = opts.archived;
            const req = wireBody<ClockifyApi.UpdateClientsRequest>({
                workspaceId,
                clientId: id,
                body,
            });
            const updated = (await client.clients.update(req)) as {
                id?: string;
                name?: string;
            };
            const data = { id: updated.id ?? id, name: updated.name ?? "" };
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

    clients
        .command("delete")
        .argument("<id>", "Client ID.")
        .description("Delete a client by ID (archives first; an active client cannot be deleted).")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            // archiveThenDeleteClient owns the live-verified sequence (GET name →
            // archive via the BODY-ENVELOPE PUT that bypasses the clients.update
            // field whitelist → DELETE) and the empty-name guard: bare DELETE of an
            // ACTIVE client 400s and clients.archive 404s.
            await archiveThenDeleteClient({ workspaceId, id, resource: client.clients });
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
