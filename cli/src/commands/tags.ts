/**
 * `clk115 tags list` / `clk115 tags create <name>`.
 */
import { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerTagsCommand: Registrar = (program, services) => {
    const tags = program.command("tags").description("Manage tags.");

    tags
        .command("list")
        .description("List tags in the workspace.")
        .option("--limit <n>", "Items per page.", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by tag name substring.")
        .option("--archived", "Include archived tags.", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            if (opts.archived) req.archived = true;
            const items = (await client.tags.list(req as never)) as unknown[];
            const rows = items.map((raw) => {
                const t = raw as { id?: string; name?: string; archived?: boolean };
                return {
                    id: t.id ?? "",
                    name: t.name ?? "",
                    archived: t.archived === true,
                };
            });
            printRecords(rows, output);
        });

    tags
        .command("create")
        .argument("<name>", "Tag name.")
        .description("Create a tag in the workspace.")
        .action(async function (this: Command, name: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const created = (await client.tags.create({ workspaceId, name })) as {
                id?: string;
                name?: string;
            };
            printObject({ id: created.id ?? "", name: created.name ?? "" }, output);
        });
};
