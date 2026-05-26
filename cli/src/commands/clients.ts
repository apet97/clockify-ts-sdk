/**
 * `clk clients list` / `clk clients create <name>`.
 */
import { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerClientsCommand: Registrar = (program, services) => {
    const clients = program.command("clients").description("Manage clients.");

    clients
        .command("list")
        .description("List clients in the workspace.")
        .option("--limit <n>", "Items per page.", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by client name substring.")
        .option("--archived", "Include archived clients.", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            const items = (await client.clients.list(req as never)) as unknown[];
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
            const created = (await client.clients.create(body as never)) as {
                id?: string;
                name?: string;
            };
            printObject({ id: created.id ?? "", name: created.name ?? "" }, output);
        });
};
