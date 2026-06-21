/**
 * `clk115 timeoff list` / `clk115 timeoff submit`.
 *
 * v0.2 ships list + submit; the more complex policy/balance management
 * tools stay behind the broader `clockify-sdk-ts-115` surface until enough
 * demand surfaces to justify the CLI ergonomics work.
 */
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

interface TimeOffListRequest {
    workspaceId: string;
    page: number;
    pageSize: number;
    start?: string;
    end?: string;
    statuses?: string[];
    users?: string[];
}

export const registerTimeOffCommand: Registrar = (program, services) => {
    const timeoff = program.command("timeoff").description("Time-off requests.");

    timeoff
        .command("list")
        .description("List time-off requests in the workspace.")
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option(
            "--limit <n>",
            "Items per page (default 50, max 200).",
            (v) => Number.parseInt(v, 10),
            50,
        )
        .option("--start <date>", "Window start (YYYY-MM-DD or RFC3339).")
        .option("--end <date>", "Window end (YYYY-MM-DD or RFC3339).")
        .option(
            "--status <statuses>",
            "Comma-separated statuses (APPROVED, PENDING, REJECTED, WITHDRAWN).",
        )
        .option("--user <ids>", "Comma-separated user IDs to scope the search.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: TimeOffListRequest = {
                workspaceId,
                page: opts.page,
                pageSize: Math.min(Math.max(1, opts.limit), 200),
            };
            if (opts.start) req.start = opts.start;
            if (opts.end) req.end = opts.end;
            if (opts.status) req.statuses = splitList(opts.status);
            if (opts.user) req.users = splitList(opts.user);
            // wireBody bridges the narrower generated `statuses` (a RequestStatusType
            // literal union) since the CLI accepts free-form --status filter values.
            const items = (await client.timeOff.list(
                wireBody<ClockifyApi.ListTimeOffRequest>(req),
            )) as unknown[];
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

    timeoff
        .command("submit")
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
            (v) => Number.parseInt(v, 10),
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
            const { client, workspaceId, output } = await resolveContext(this, services);
            const period: ClockifyApi.PeriodV1Request = { start: opts.start };
            if (opts.end !== undefined) period.end = opts.end;
            if (Number.isFinite(opts.days)) period.days = opts.days;
            const body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest> = {
                note: opts.note ?? "",
                timeOffPeriod: {
                    isHalfDay: opts.halfDay === true,
                    halfDayPeriod: opts.halfDayPeriod ?? "NOT_DEFINED",
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

function splitList(value: string): string[] {
    return String(value)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
