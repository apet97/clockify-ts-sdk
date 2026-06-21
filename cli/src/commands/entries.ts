/**
 * `clk115 entries list` and `clk115 entries delete <id>`.
 */
import type { ClockifyApi } from "clockify-sdk-ts-115";
import { entityId } from "clockify-sdk-ts-115/operation-receipt";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { parseIntArg, promoteDateBoundary, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerEntriesCommand: Registrar = (program, services) => {
    const entries = program.command("entries").description("Manage time entries.");

    entries
        .command("list")
        .description("List the current user's time entries.")
        .option("--limit <n>", "Items per page (default 25, max 200).", parseIntArg, 25)
        .option("--page <n>", "Page number (default 1).", parseIntArg, 1)
        .option("--from <date>", "ISO 8601 start cutoff (inclusive).")
        .option("--to <date>", "ISO 8601 end cutoff (inclusive).")
        .option("--description <text>", "Filter by description substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = entityId(user);
            if (!userId) {
                throw new Error("could not determine user ID");
            }
            const req: ClockifyApi.ListForUserTimeEntriesRequest = {
                workspaceId,
                userId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            // Clockify's time-entry range filter needs a full RFC3339 instant, but
            // CLI users naturally type `--from 2026-06-01`. Promote a bare date to
            // the day's start/end edge (mirroring reports/invoices); a full RFC3339
            // value passes through unchanged. An unparseable value errors locally
            // rather than 400ing on the wire (mirrors log.ts's --end guard).
            if (opts.from) req.start = promoteDateBoundary(opts.from, "from", "start");
            if (opts.to) req.end = promoteDateBoundary(opts.to, "to", "end");
            if (opts.description) req.description = opts.description;
            const items = await client.timeEntries.listForUser(req);
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
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.timeEntries.delete({ workspaceId, timeEntryId: id });
            printReceipt(
                {
                    ok: true,
                    action: "entries.delete",
                    entity: "time_entry",
                    ids: { entryId: id },
                    data: { id, deleted: true, message: `deleted time entry ${id}` },
                    changed: { deleted: [{ type: "time_entry", id }] },
                    next: [{ command: "clk115 entries list --json", reason: "Verify the entry no longer appears." }],
                },
                output,
            );
        });
};
