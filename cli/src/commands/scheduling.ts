/**
 * `clk115 scheduling list` / `clk115 scheduling create`.
 *
 * Live Clockify scheduling has strict role gating (workspace owner +
 * scheduling addon enabled). `create` therefore defaults to draft mode
 * (`published: false`) and surfaces the upstream 403 verbatim so the
 * caller can route the failure to an admin.
 */
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerSchedulingCommand: Registrar = (program, services) => {
    const scheduling = program.command("scheduling").description("Capacity scheduling assignments.");

    scheduling
        .command("list")
        .description("List scheduling assignments in the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", (v) => Number.parseInt(v, 10), 25)
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--name <text>", "Filter by assignment name substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.name) req.name = opts.name;
            const items = (await client.scheduling.list(req as never)) as unknown[];
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
        .description("Create a scheduling assignment (defaults to draft; pass --publish to publish).")
        .requiredOption("--user <id>", "User ID to assign.")
        .requiredOption("--project <id>", "Project ID.")
        .requiredOption("--start <date>", "Period start (YYYY-MM-DD or RFC3339).")
        .requiredOption("--end <date>", "Period end (YYYY-MM-DD or RFC3339).")
        .requiredOption(
            "--hours-per-day <n>",
            "Daily hour load (e.g. 6).",
            (v) => Number.parseFloat(v),
        )
        .option("--task <id>", "Task ID.")
        .option("--note <text>", "Assignment note.")
        .option("--billable", "Mark assignment as billable.", false)
        .option("--include-non-working-days", "Include weekends/non-working days.", false)
        .option("--publish", "Publish immediately (default is draft).", false)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const body: Record<string, unknown> = {
                workspaceId,
                userId: opts.user,
                projectId: opts.project,
                hoursPerDay: opts.hoursPerDay,
                period: { start: opts.start, end: opts.end },
                published: opts.publish === true,
            };
            if (opts.task) body.taskId = opts.task;
            if (opts.note) body.note = opts.note;
            if (opts.billable) body.billable = true;
            if (opts.includeNonWorkingDays) body.includeNonWorkingDays = true;
            const created = (await client.scheduling.create(body as never)) as {
                id?: string;
                userId?: string;
                projectId?: string;
                hoursPerDay?: number;
                period?: { start?: string; end?: string };
                published?: boolean;
            };
            const data = {
                id: created.id ?? "",
                user: created.userId ?? "",
                project: created.projectId ?? "",
                hoursPerDay: created.hoursPerDay ?? 0,
                start: created.period?.start ?? "",
                end: created.period?.end ?? "",
                published: created.published === true,
            };
            printReceipt(
                {
                    ok: true,
                    action: "scheduling.create",
                    entity: "scheduling_assignment",
                    ids: { assignmentId: data.id },
                    data,
                    changed: { created: [{ type: "scheduling_assignment", id: data.id }] },
                    next: [{ command: "clk115 scheduling list --json", reason: "Verify the assignment appears." }],
                },
                output,
            );
        });
};
