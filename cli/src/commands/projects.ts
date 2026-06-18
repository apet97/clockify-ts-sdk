/**
 * `clk115 projects list` / `clk115 projects create <name>`.
 */
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerProjectsCommand: Registrar = (program, services) => {
    const projects = program.command("projects").description("Manage projects.");

    projects
        .command("list")
        .description("List projects in the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by project name substring.")
        .option("--archived", "Include archived projects.", false)
        .option("--client <id>", "Filter by client ID.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            if (opts.client) req.clients = [opts.client];
            const items = (await client.projects.list(req as never)) as unknown[];
            const rows = items.map((raw) => {
                const p = raw as {
                    id?: string;
                    name?: string;
                    clientId?: string;
                    color?: string;
                    archived?: boolean;
                    billable?: boolean;
                };
                return {
                    id: p.id ?? "",
                    name: p.name ?? "",
                    clientId: p.clientId ?? "",
                    color: p.color ?? "",
                    archived: p.archived === true,
                    billable: p.billable === true,
                };
            });
            printRecords(rows, output);
        });

    projects
        .command("create")
        .argument("<name>", "Project name.")
        .option("--client <id>", "Client ID.")
        .option("--color <hex>", "Hex color (e.g. #4caf50).")
        .option("--billable", "Mark as billable.", false)
        .description("Create a project in the workspace.")
        .action(async function (this: Command, name: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = { workspaceId, name };
            if (opts.client) body.clientId = opts.client;
            if (opts.color) body.color = opts.color;
            if (opts.billable) body.billable = true;
            const created = (await client.projects.create(body as never)) as {
                id?: string;
                name?: string;
                clientId?: string;
                color?: string;
            };
            const data = {
                id: created.id ?? "",
                name: created.name ?? "",
                clientId: created.clientId ?? "",
                color: created.color ?? "",
            };
            printReceipt(
                {
                    ok: true,
                    action: "projects.create",
                    entity: "project",
                    ids: { projectId: data.id },
                    data,
                    changed: { created: [{ type: "project", id: data.id, name: data.name }] },
                    next: [{ command: `clk115 tasks list ${data.id} --json`, reason: "Review tasks for this project." }],
                },
                output,
            );
        });
};
