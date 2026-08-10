/**
 * `clk115 scheduling list` / `clk115 scheduling create`.
 *
 * Live Clockify scheduling has strict role gating (workspace owner +
 * scheduling addon enabled). `create` therefore defaults to draft mode
 * (`published: false`) and surfaces the upstream 403 verbatim so the
 * caller can route the failure to an admin.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import {
    clampPageSize,
    parseFloatArg,
    parseIntArg,
    promoteDateBoundary,
    requireRfc3339Timestamp,
    resolveContext,
} from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

export const registerSchedulingCommand: Registrar = (program, services) => {
    const scheduling = program
        .command("scheduling")
        .description("Capacity scheduling assignments.");

    leafCommand(scheduling, "list", "read")
        .description(
            "List scheduling assignments over a date range. --from/--to are required (the endpoint 400s without them).",
        )
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 scheduling list --from 2026-06-01 --to 2026-06-30\n",
        )
        .requiredOption("--from <date>", "Range start (YYYY-MM-DD or RFC3339). Required.")
        .requiredOption("--to <date>", "Range end (YYYY-MM-DD or RFC3339). Required.")
        .option(
            "--limit <n>",
            "Items per page (default 25, max 200).",
            parseIntArg,
            25,
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by assignment name substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListSchedulingRequest = {
                workspaceId,
                start: promoteDateBoundary(opts.from, "from", "start"),
                end: promoteDateBoundary(opts.to, "to", "end"),
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
            };
            if (opts.name) req.name = opts.name;
            const items = await client.scheduling.list(req);
            const rows = items.map((raw) => {
                const a = raw as {
                    id?: string;
                    userId?: string;
                    projectId?: string;
                    taskId?: string;
                    hoursPerDay?: number;
                    period?: { start?: string; end?: string };
                    note?: string;
                    billable?: boolean;
                };
                return {
                    id: a.id ?? "",
                    user: a.userId ?? "",
                    project: a.projectId ?? "",
                    task: a.taskId ?? "",
                    hoursPerDay: a.hoursPerDay ?? 0,
                    start: a.period?.start ?? "",
                    end: a.period?.end ?? "",
                    billable: a.billable === true,
                    note: a.note ?? "",
                };
            });
            printRecords(rows, output);
        });

    leafCommand(scheduling, "create", "write")
        .description(
            "Create a scheduling assignment (defaults to draft; pass --publish to publish).",
        )
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 scheduling create --user user_123 --project project_456 \\\n" +
                "      --start 2026-06-01T00:00:00Z --end 2026-06-05T00:00:00Z --hours-per-day 6\n",
        )
        .requiredOption("--user <id>", "User ID to assign.")
        .requiredOption("--project <id>", "Project ID.")
        // RFC3339 only, deliberately: these values are forwarded to the wire
        // verbatim (no promoteDateBoundary), and the generated request body
        // documents `yyyy-MM-ddThh:mm:ssZ` — a bare date would reach Clockify
        // unpromoted, so the help must not promise it.
        .requiredOption("--start <date>", "Period start (RFC3339, e.g. 2026-05-01T00:00:00Z).")
        .requiredOption("--end <date>", "Period end (RFC3339, e.g. 2026-05-05T00:00:00Z).")
        .requiredOption("--hours-per-day <n>", "Daily hour load (e.g. 6).", parseFloatArg)
        .option("--task <id>", "Task ID.")
        .option("--note <text>", "Assignment note.")
        .option("--billable", "Mark assignment as billable.", false)
        .option("--include-non-working-days", "Include weekends/non-working days.", false)
        .option("--publish", "Publish immediately (default is draft).", false)
        .action(async function (this: Command, opts) {
            const start = requireRfc3339Timestamp(opts.start, "start");
            const end = requireRfc3339Timestamp(opts.end, "end");
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Live Clockify has no single-assignment create (POST /scheduling/assignments
            // 404s); the real create path is the recurring endpoint, which models a one-off
            // when recurringAssignment is omitted. --publish maps to the separate range-based
            // publish op for the assignment window.
            const body: ClockifyRequestBody<ClockifyApi.CreateRecurringSchedulingRequest> = {
                userId: opts.user,
                projectId: opts.project,
                hoursPerDay: opts.hoursPerDay,
                start,
                end,
            };
            if (opts.task) body.taskId = opts.task;
            if (opts.note) body.note = opts.note;
            if (opts.billable) body.billable = true;
            if (opts.includeNonWorkingDays) body.includeNonWorkingDays = true;
            const req: ClockifyApi.CreateRecurringSchedulingRequest = { workspaceId, body };
            // createRecurring returns an ARRAY (one entry per occurrence; a one-off has one).
            const createdList = (await client.scheduling.createRecurring(req)) as Array<{
                id?: string;
                userId?: string;
                projectId?: string;
                hoursPerDay?: number;
                start?: string;
                end?: string;
                period?: { start?: string; end?: string };
            }>;
            const created = createdList[0] ?? {};
            if (opts.publish === true) {
                // publish is range-scoped; narrow to the just-assigned user to limit blast radius.
                await client.scheduling.publish({
                    workspaceId,
                    start,
                    end,
                    userFilter: { contains: "CONTAINS", ids: [opts.user] },
                });
            }
            const data = {
                id: created.id ?? "",
                user: created.userId ?? "",
                project: created.projectId ?? "",
                hoursPerDay: created.hoursPerDay ?? 0,
                start: created.start ?? created.period?.start ?? start,
                end: created.end ?? created.period?.end ?? end,
                published: opts.publish === true,
            };
            printReceipt(
                {
                    ok: true,
                    action: "scheduling.create",
                    entity: "scheduling_assignment",
                    ids: { assignmentId: data.id },
                    data,
                    changed: { created: [{ type: "scheduling_assignment", id: data.id }] },
                    next: [
                        {
                            // CLI-8: `scheduling list` exits 2 without
                            // --from/--to, so the pasted command must carry
                            // the assignment's own window.
                            command: `clk115 scheduling list --from ${data.start} --to ${data.end} --json`,
                            reason: "Verify the assignment appears.",
                        },
                    ],
                },
                output,
            );
        });
};
