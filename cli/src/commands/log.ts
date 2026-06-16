/**
 * `clk115 log <duration> <description>` — record a finished work item
 * with an explicit duration ending now (or at --end). The most-
 * common after-the-fact entry pattern.
 */
import type { Command } from "commander";

import { parseDuration } from "../duration.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

interface LogOpts {
    project?: string;
    task?: string;
    tag?: string[];
    billable?: boolean;
    end?: string;
}

export const registerLogCommand: Registrar = (program, services) => {
    program
        .command("log")
        .description("Log a finished time entry. Duration accepts 1h30m / 90m / PT1H30M.")
        .argument("<duration>", "Duration like '1h30m', '45m', or ISO 8601 'PT1H30M'.")
        .argument("<description>", "What you worked on.")
        .option("-p, --project <id>", "Project ID (use clk115 projects list to find one).")
        .option("-t, --task <id>", "Task ID.")
        .option("--tag <id...>", "Tag ID(s).")
        .option("--billable", "Mark the entry as billable.", false)
        .option("--end <iso>", "End timestamp (ISO 8601). Defaults to now.")
        .action(async function (this: Command, duration: string, description: string, opts: LogOpts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            if (opts.task && !opts.project) {
                throw new Error("--task requires --project: a task entry must be scoped to its project.");
            }
            const seconds = parseDuration(duration);
            const endIso = opts.end ?? new Date().toISOString();
            const endMs = Date.parse(endIso);
            if (Number.isNaN(endMs)) {
                throw new Error(`--end ${JSON.stringify(opts.end)} is not a valid ISO 8601 timestamp`);
            }
            const startIso = new Date(endMs - seconds * 1000).toISOString();

            const body: Record<string, unknown> = {
                start: startIso,
                end: endIso,
                description,
            };
            if (opts.project) body.projectId = opts.project;
            if (opts.task) body.taskId = opts.task;
            if (opts.tag && Array.isArray(opts.tag) && opts.tag.length > 0) body.tagIds = opts.tag;
            if (opts.billable) body.billable = true;

            const created = await client.timeEntries.create({ workspaceId, ...body } as never);
            const entry = created as { id?: string; description?: string; timeInterval?: { duration?: string } };
            const data = {
                id: entry.id ?? "",
                description: entry.description ?? "",
                duration: entry.timeInterval?.duration ?? "",
                start: startIso,
                end: endIso,
            };
            printReceipt(
                {
                    ok: true,
                    action: "entries.log",
                    entity: "time_entry",
                    ids: { entryId: data.id },
                    data,
                    changed: { created: [{ type: "time_entry", id: data.id }] },
                    next: [
                        {
                            command: "clk115 entries list --json",
                            reason: "Verify the entry appears in the expected date range.",
                        },
                    ],
                },
                output,
            );
        });
};
