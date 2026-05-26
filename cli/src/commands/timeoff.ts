/**
 * `clk timeoff list` / `clk timeoff submit`.
 *
 * v0.2 ships list + submit; the more complex policy/balance management
 * tools stay behind the broader `clockify-sdk-ts` surface until enough
 * demand surfaces to justify the CLI ergonomics work.
 */
import { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerTimeOffCommand: Registrar = (program, services) => {
    const timeoff = program.command("timeoff").description("Time-off requests.");

    timeoff
        .command("list")
        .description("List time-off requests in the workspace.")
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--limit <n>", "Page size.", (v) => Number.parseInt(v, 10), 50)
        .option("--start <date>", "Window start (YYYY-MM-DD or RFC3339).")
        .option("--end <date>", "Window end (YYYY-MM-DD or RFC3339).")
        .option(
            "--status <statuses>",
            "Comma-separated statuses (APPROVED, PENDING, REJECTED, WITHDRAWN).",
        )
        .option("--user <ids>", "Comma-separated user IDs to scope the search.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                pageSize: Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.start) req.start = opts.start;
            if (opts.end) req.end = opts.end;
            if (opts.status) req.statuses = splitList(opts.status);
            if (opts.user) req.users = splitList(opts.user);
            const items = (await client.timeOff.list(req as never)) as unknown[];
            const rows = items.map((raw) => {
                const r = raw as {
                    id?: string;
                    userId?: string;
                    policyId?: string;
                    status?: { statusType?: string } | string;
                    timeOffPeriod?: { period?: { start?: string; end?: string } };
                    note?: string;
                };
                const statusValue =
                    typeof r.status === "object" && r.status !== null
                        ? (r.status as { statusType?: string }).statusType ?? ""
                        : typeof r.status === "string"
                          ? r.status
                          : "";
                return {
                    id: r.id ?? "",
                    user: r.userId ?? "",
                    policy: r.policyId ?? "",
                    status: statusValue,
                    start: r.timeOffPeriod?.period?.start ?? "",
                    end: r.timeOffPeriod?.period?.end ?? "",
                    note: r.note ?? "",
                };
            });
            printRecords(rows, output);
        });

    timeoff
        .command("submit")
        .description("Submit a time-off request against a policy.")
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .requiredOption("--start <date>", "Period start (YYYY-MM-DD).")
        .requiredOption("--end <date>", "Period end (YYYY-MM-DD).")
        .option("--days <n>", "Days requested.", (v) => Number.parseInt(v, 10))
        .option("--note <text>", "Optional request note.")
        .option("--half-day", "Mark as a half-day request.", false)
        .option(
            "--half-day-period <period>",
            "Half-day period (FIRST_HALF, SECOND_HALF, NOT_DEFINED).",
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const period: Record<string, unknown> = {
                start: opts.start,
                end: opts.end,
            };
            if (Number.isFinite(opts.days)) period.days = opts.days;
            const body: Record<string, unknown> = {
                timeOffPeriod: {
                    isHalfDay: opts.halfDay === true,
                    halfDayPeriod: opts.halfDayPeriod ?? "NOT_DEFINED",
                    period,
                },
            };
            if (opts.note) body.note = opts.note;
            const created = (await client.timeOff.submit({
                workspaceId,
                policyId: opts.policy,
                body,
            } as never)) as {
                id?: string;
                status?: { statusType?: string };
                userId?: string;
            };
            printObject(
                {
                    id: created.id ?? "",
                    user: created.userId ?? "",
                    status: created.status?.statusType ?? "",
                },
                output,
            );
        });
};

function splitList(value: string): string[] {
    return String(value)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
