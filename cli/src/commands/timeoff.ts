/**
 * `clk115 timeoff list` / `clk115 timeoff submit`, plus the
 * `balance-assignment` subgroup from ./balanceAssignment.ts.
 *
 * Policy management stays behind the broader `clockify-sdk-ts-115`
 * surface until demand justifies the CLI ergonomics work.
 */
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { registerBalanceAssignmentCommands } from "./balanceAssignment.js";
import { clampPageSize, parseIntArg, resolveContext, splitList } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

interface TimeOffListRequest {
    workspaceId: string;
    page: number;
    pageSize: number;
    start?: string;
    end?: string;
    statuses?: ClockifyApi.RequestStatusType[];
    users?: string[];
}

export const registerTimeOffCommand: Registrar = (program, services) => {
    const timeoff = program.command("timeoff").description("Time-off requests.");

    registerBalanceAssignmentCommands(timeoff, services);

    leafCommand(timeoff, "list", "read")
        .description("List time-off requests in the workspace.")
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option(
            "--limit <n>",
            "Items per page (default 50, max 200).",
            parseIntArg,
            50,
        )
        .option("--start <date>", "Window start (YYYY-MM-DD or RFC3339).")
        .option("--end <date>", "Window end (YYYY-MM-DD or RFC3339).")
        .option(
            "--status <statuses>",
            "Comma-separated statuses (PENDING, APPROVED, REJECTED, ALL).",
        )
        .option("--user <ids>", "Comma-separated user IDs to scope the search.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: TimeOffListRequest = {
                workspaceId,
                page: opts.page,
                pageSize: clampPageSize(opts.limit, 200),
            };
            if (opts.start) req.start = opts.start;
            if (opts.end) req.end = opts.end;
            if (opts.status) {
                const statuses = splitList(opts.status).map((s) => s.toUpperCase());
                const known = new Set(["PENDING", "APPROVED", "REJECTED", "ALL"]);
                const invalid = statuses.filter((status) => !known.has(status));
                if (invalid.length > 0) throw new Error(`Unknown time-off status: ${invalid.join(", ")}; provide PENDING, APPROVED, REJECTED, or ALL`);
                req.statuses = statuses as ClockifyApi.RequestStatusType[];
            }
            if (opts.user) req.users = splitList(opts.user);
            const response = await client.timeOff.list(req);
            const items = response.requests ?? [];
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
                        ? (r.status.statusType ?? "")
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

    leafCommand(timeoff, "submit", "write")
        .description("Submit a time-off request against a policy.")
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .requiredOption(
            "--start <date>",
            "Period start (date-only YYYY-MM-DD for DAYS-unit policies, RFC3339 for HOURS-unit).",
        )
        .option(
            "--end <date>",
            "Period end (RFC3339); HOURS-unit policies need it, DAYS-unit use --days. Provide --end or --days.",
        )
        .option(
            "--days <n>",
            "Days requested; DAYS-unit policies need it. Provide --end or --days.",
            parseIntArg,
        )
        .option("--note <text>", "Optional request note.")
        .option("--half-day", "Mark as a half-day request.", false)
        .option(
            "--half-day-period <period>",
            "Half-day period (FIRST_HALF, SECOND_HALF, NOT_DEFINED).",
        )
        .action(async function (this: Command, opts) {
            // The submit period shape is policy-unit dependent (DAYS-unit wants
            // start+days, HOURS-unit wants start+end, live-verified 2026-06-21);
            // the CLI can't see the unit, so require one of --end / --days.
            if (opts.end === undefined && !Number.isFinite(opts.days)) {
                throw new Error(
                    "provide --end (date-range / HOURS-unit policies) or --days (DAYS-unit policies)",
                );
            }
            const halfDayPeriod =
                opts.halfDayPeriod === undefined ? "NOT_DEFINED" : String(opts.halfDayPeriod).toUpperCase();
            if (!["FIRST_HALF", "SECOND_HALF", "NOT_DEFINED"].includes(halfDayPeriod)) {
                throw new Error(
                    `--half-day-period must be FIRST_HALF, SECOND_HALF, or NOT_DEFINED (got "${String(opts.halfDayPeriod)}").`,
                );
            }
            const { client, workspaceId, output } = await resolveContext(this, services);
            const period: ClockifyApi.PeriodV1Request = { start: opts.start };
            if (opts.end !== undefined) period.end = opts.end;
            if (Number.isFinite(opts.days)) period.days = opts.days;
            const body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest> = {
                note: opts.note ?? "",
                timeOffPeriod: {
                    isHalfDay: opts.halfDay === true,
                    halfDayPeriod: halfDayPeriod as ClockifyApi.HalfDayPeriod,
                    period,
                },
            };
            const req: ClockifyApi.SubmitTimeOffRequest = {
                workspaceId,
                policyId: opts.policy,
                body,
            };
            const created = (await client.timeOff.submit(req)) as {
                id?: string;
                status?: { statusType?: string };
                userId?: string;
            };
            const data = {
                id: created.id ?? "",
                user: created.userId ?? "",
                status: created.status?.statusType ?? "",
            };
            printReceipt(
                {
                    ok: true,
                    action: "timeoff.submit",
                    entity: "time_off_request",
                    ids: { timeOffRequestId: data.id },
                    data,
                    changed: { created: [{ type: "time_off_request", id: data.id }] },
                    next: [
                        { command: "clk115 timeoff list --json", reason: "Review request status." },
                    ],
                },
                output,
            );
        });
};
