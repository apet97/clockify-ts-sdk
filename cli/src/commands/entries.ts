/**
 * `clk115 entries list` and `clk115 entries delete <id>`.
 */
import type { Command } from "commander";

import { printRecords, printSuccess } from "../output.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerEntriesCommand: Registrar = (program, services) => {
    const entries = program.command("entries").description("Manage time entries.");

    entries
        .command("list")
        .description("List the current user's time entries.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number (default 1).", (v) => Number.parseInt(v, 10), 1)
        .option("--from <date>", "ISO 8601 start cutoff (inclusive).")
        .option("--to <date>", "ISO 8601 end cutoff (inclusive).")
        .option("--description <text>", "Filter by description substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = (user as { id?: string }).id;
            if (!userId) {
                throw new Error("could not determine user ID");
            }
            const req: Record<string, unknown> = {
                workspaceId,
                userId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.from) req.start = opts.from;
            if (opts.to) req.end = opts.to;
            if (opts.description) req.description = opts.description;
            const items = (await client.timeEntries.listForUser(req as never)) as unknown[];
            const rows = items.map((raw) => {
                const e = raw as {
                    id?: string;
                    description?: string;
                    projectId?: string | null;
                    taskId?: string | null;
                    billable?: boolean;
                    timeInterval?: { start?: string; end?: string; duration?: string };
                };
                return {
                    id: e.id ?? "",
                    description: e.description ?? "",
                    project: e.projectId ?? "",
                    task: e.taskId ?? "",
                    billable: e.billable === true,
                    start: e.timeInterval?.start ?? "",
                    end: e.timeInterval?.end ?? "",
                    duration: e.timeInterval?.duration ?? "",
                };
            });
            printRecords(rows, output);
        });

    entries
        .command("delete")
        .argument("<id>", "Time-entry ID.")
        .description("Delete a time entry by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = resolveContext(this, services);
            await client.timeEntries.delete({ workspaceId, timeEntryId: id });
            printSuccess(`deleted time entry ${id}`, output);
        });
};
