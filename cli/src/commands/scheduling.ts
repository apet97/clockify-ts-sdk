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
    resolveContext,
} from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerSchedulingCommand: Registrar = (program, services) => {
    const scheduling = program
        .command("scheduling")
        .description("Capacity scheduling assignments.");

    scheduling
        .command("list")
        .description(
            "List scheduling assignments over a date range. --from/--to are required (the endpoint 400s without them).",
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

    scheduling
        .command("create")
        .description(
            "Create a scheduling assignment (defaults to draft; pass --publish to publish).",
        )
        .requiredOption("--user <id>", "User ID to assign.")
        .requiredOption("--project <id>", "Project ID.")
        .requiredOption("--start <date>", "Period start (YYYY-MM-DD or RFC3339).")
        .requiredOption("--end <date>", "Period end (YYYY-MM-DD or RFC3339).")
        .requiredOption("--hours-per-day <n>", "Daily hour load (e.g. 6).", parseFloatArg)
        .option("--task <id>", "Task ID.")
        .option("--note <text>", "Assignment note.")
        .option("--billable", "Mark assignment as billable.", false)
        .option("--include-non-working-days", "Include weekends/non-working days.", false)
        .option("--publish", "Publish immediately (default is draft).", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            // Live Clockify has no single-assignment create (POST /scheduling/assignments
            // 404s); the real create path is the recurring endpoint, which models a one-off
            // when recurringAssignment is omitted. --publish maps to the separate range-based
            // publish op for the assignment window.
            const body: ClockifyRequestBody<ClockifyApi.CreateRecurringSchedulingRequest> = {
                userId: opts.user,
                projectId: opts.project,
                hoursPerDay: opts.hoursPerDay,
                start: opts.start,
                end: opts.end,
            };
            if (opts.task) body.taskId = opts.task;
            if (opts.note) body.note = opts.note;
            if (opts.billable) body.billable = true;
            if (opts.includeNonWorkingDays) body.includeNonWorkingDays = true;
            const req: ClockifyApi.CreateRecurringSchedulingRequest = { workspaceId, body };
            const created = (await client.scheduling.createRecurring(req)) as {
                id?: string;
                userId?: string;
                projectId?: string;
                hoursPerDay?: number;
                start?: string;
                end?: string;
                period?: { start?: string; end?: string };
            };
            if (opts.publish === true) {
                await client.scheduling.publish({ workspaceId, start: opts.start, end: opts.end });
            }
            const data = {
                id: created.id ?? "",
                user: created.userId ?? "",
                project: created.projectId ?? "",
                hoursPerDay: created.hoursPerDay ?? 0,
                start: created.start ?? created.period?.start ?? opts.start ?? "",
                end: created.end ?? created.period?.end ?? opts.end ?? "",
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
                            command: "clk115 scheduling list --json",
                            reason: "Verify the assignment appears.",
                        },
                    ],
                },
                output,
            );
        });
};
