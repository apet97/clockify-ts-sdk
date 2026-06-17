/**
 * `clk115 tasks list <projectId>`.
 */
import type { Command } from "commander";

import { printRecords } from "../output.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerTasksCommand: Registrar = (program, services) => {
    const tasks = program.command("tasks").description("Manage tasks.");

    tasks
        .command("list")
        .argument("<projectId>", "Project ID.")
        .description("List tasks for a project.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by task name substring.")
        .action(async function (this: Command, projectId: string, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                projectId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            const items = (await client.tasks.list(req as never)) as unknown[];
            const rows = items.map((raw) => {
                const t = raw as { id?: string; name?: string; status?: string; billable?: boolean };
                return {
                    id: t.id ?? "",
                    name: t.name ?? "",
                    status: t.status ?? "",
                    billable: t.billable === true,
                };
            });
            printRecords(rows, output);
        });
};
