/**
 * `clk115 log <duration> <description>` — record a finished work item
 * with an explicit duration ending now (or at --end). The most-
 * common after-the-fact entry pattern.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { parseDuration } from "../duration.js";
import { printReceipt } from "../receipt.js";

import { requireRfc3339Timestamp, resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import { resolveProjectId, resolveTaskId, resolveTagIds } from "./resolve-refs.js";
import type { Registrar } from "./types.js";

interface LogOpts {
    project?: string;
    task?: string;
    tag?: string[];
    billable?: boolean;
    end?: string;
}

export const registerLogCommand: Registrar = (program, services) => {
    leafCommand(program, "log", "write")
        .description("Log a finished time entry. Duration accepts 1h30m / 90m / PT1H30M.")
        .argument("<duration>", "Duration like '1h30m', '45m', or ISO 8601 'PT1H30M'.")
        .argument("<description>", "What you worked on.")
        .option("-p, --project <name|id>", "Project name or ID.")
        .option("-t, --task <name|id>", "Task name or ID.")
        .option("--tag <name|id...>", "Tag name(s) or ID(s). Repeat the flag for multiple tags.")
        .option("--billable", "Mark the entry as billable.", false)
        .option("--end <iso>", "End timestamp (ISO 8601). Defaults to now.")
        .action(async function (
            this: Command,
            duration: string,
            description: string,
            opts: LogOpts,
        ) {
            if (opts.task && !opts.project) {
                throw new Error(
                    "--task requires --project: a task entry must be scoped to its project.",
                );
            }
            const seconds = parseDuration(duration);
            const endInput = requireRfc3339Timestamp(
                opts.end ?? new Date().toISOString(),
                "end",
            );
            const endMs = Date.parse(endInput);
            const endIso = new Date(endMs).toISOString();
            const startIso = new Date(endMs - seconds * 1000).toISOString();
            const { client, workspaceId, output } = await resolveContext(this, services);
            const projectId = opts.project
                ? await resolveProjectId(client, workspaceId, opts.project)
                : undefined;
            const taskId =
                opts.task && projectId
                    ? await resolveTaskId(client, workspaceId, projectId, opts.task)
                    : undefined;
            const tagIds =
                opts.tag && opts.tag.length > 0
                    ? await resolveTagIds(client, workspaceId, opts.tag)
                    : undefined;

            const body: ClockifyRequestBody<ClockifyApi.CreateTimeEntryRequest> = {
                start: startIso,
                end: endIso,
                description,
            };
            if (projectId) body.projectId = projectId;
            if (taskId) body.taskId = taskId;
            if (tagIds && tagIds.length > 0) body.tagIds = tagIds;
            if (opts.billable) body.billable = true;

            const req: ClockifyApi.CreateTimeEntryRequest = { workspaceId, body };
            const created = await client.timeEntries.create(req);
            const entry = created as {
                id?: string;
                description?: string;
                timeInterval?: { duration?: string };
            };
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
