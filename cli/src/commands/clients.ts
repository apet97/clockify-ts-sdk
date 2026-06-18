/**
 * `clk115 clients {list,create,get,update,delete}`.
 */
import type { ClockifyApi } from "clockify-sdk-ts-115";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerClientsCommand: Registrar = (program, services) => {
    const clients = program.command("clients").description("Manage clients.");

    clients
        .command("list")
        .description("List clients in the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by client name substring.")
        .option("--archived", "Include archived clients.", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: ClockifyApi.ListClientsRequest = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = { workspaceId, name };
            if (opts.note) body.note = opts.note;
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            const created = (await client.clients.create(body as never)) as {
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const result = await client.clients.get({ workspaceId, clientId: id });
            printObject(result as Record<string, unknown>, output);
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
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = {};
            if (opts.name) body.name = opts.name;
            if (opts.note !== undefined) body.note = opts.note;
            if (opts.address !== undefined) body.address = opts.address;
            if (opts.archived !== undefined) body.archived = opts.archived;
            // KEEP as never: runtime body object is validated locally but rejected by the generated flattened request type.
            const updated = (await client.clients.update({ workspaceId, clientId: id, body } as never)) as {
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
                    next: [{ command: `clk115 clients get ${data.id} --json`, reason: "Verify the update." }],
                },
                output,
            );
        });

    clients
        .command("delete")
        .argument("<id>", "Client ID.")
        .description("Delete a client by ID (archives first; an active client cannot be deleted).")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            // Clockify rejects DELETE of an ACTIVE client (400) and the
            // dedicated `clients.archive` route 404s. The flattened
            // `clients.update` drops `archived` (field whitelist), but the
            // body-envelope form bypasses it via core.bodyFromRequest — so
            // archive first via GET-then-PUT (body envelope), carrying the
            // name the replace-PUT requires, then DELETE. Mirrors the MCP tool.
            const current = (await client.clients.get({ workspaceId, clientId: id })) as { name?: string };
            const name = String(current.name ?? "");
            if (!name) {
                throw new Error("Cannot archive client before delete: the client has no name to carry through the replace-PUT.");
            }
            // KEEP as never: UpdateClientsRequestBody omits archived; only the body envelope reaches the wire.
            await client.clients.update({ workspaceId, clientId: id, body: { name, archived: true } } as never);
            await client.clients.delete({ workspaceId, clientId: id });
            printReceipt(
                {
                    ok: true,
                    action: "clients.delete",
                    entity: "client",
                    ids: { clientId: id },
                    data: { id, deleted: true, message: `deleted client ${id}` },
                    changed: { deleted: [{ type: "client", id }] },
                    next: [{ command: "clk115 clients list --json", reason: "Verify the client no longer appears." }],
                },
                output,
            );
        });
};
