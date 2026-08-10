/**
 * `clk115 approvals submit-with-type` and
 * `clk115 approvals submit-for-user-with-type`.
 *
 * The group ships only the two typed submit variants. The untyped
 * `submit`/`resubmit`/`list` operations stay on the broader
 * `clockify-sdk-ts-115` surface until CLI demand justifies them.
 */
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

type ApprovalPeriod = "WEEKLY" | "SEMI_MONTHLY" | "MONTHLY";

const PERIODS: readonly ApprovalPeriod[] = ["WEEKLY", "SEMI_MONTHLY", "MONTHLY"];
const SELF_TYPES = ["TIMESHEET", "EXPENSE"] as const;
const OTHER_TYPES = ["TIMESHEET", "EXPENSE", "TIMESHEET_AND_EXPENSE"] as const;

/**
 * Validate a `--type` / `--period` flag against the enum the operation
 * accepts. Both flags are case-insensitive; an unknown value errors
 * locally instead of 400ing on the wire.
 */
function requireEnum<T extends string>(
    value: string,
    allowed: readonly T[],
    flag: string,
): T {
    const upper = value.toUpperCase();
    const match = allowed.find((candidate) => candidate === upper);
    if (!match) {
        throw new Error(`--${flag} must be one of: ${allowed.join(", ")} (got ${JSON.stringify(value)}).`);
    }
    return match;
}

function approvalReceiptData(created: ClockifyApi.ApprovalRequestDtoV1): {
    id: string;
    user: string;
    type: string;
    status: string;
} {
    return {
        id: created.id ?? "",
        user: created.owner?.userId ?? "",
        type: created.type ?? "",
        status: created.status?.state ?? "",
    };
}

export const registerApprovalsCommand: Registrar = (program, services) => {
    const approvals = program.command("approvals").description("Approval requests.");

    leafCommand(approvals, "submit-with-type", "write")
        // The path position is named approvalRequestId in the generated SDK
        // because Clockify routes it against PATCH .../{approvalRequestId};
        // it carries the request TYPE, so the CLI flag is --type.
        .description("Submit the current user's approval request with an explicit type.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 approvals submit-with-type --type TIMESHEET --period-start 2026-06-01T00:00:00Z\n",
        )
        .requiredOption("--type <type>", "Approval request type: TIMESHEET or EXPENSE.")
        .requiredOption("--period-start <date>", "Approval period start (RFC3339).")
        .option("--period <period>", "Approval period: WEEKLY, SEMI_MONTHLY, or MONTHLY.")
        .action(async function (this: Command, opts) {
            const type = requireEnum(opts.type, SELF_TYPES, "type");
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.SubmitWithTypeApprovalsRequest> = {
                periodStart: opts.periodStart,
            };
            if (opts.period) body.period = requireEnum(opts.period, PERIODS, "period");
            const created = await client.approvals.submitWithType({
                workspaceId,
                approvalRequestId: type,
                body,
            });
            const data = approvalReceiptData(created);
            printReceipt(
                {
                    ok: true,
                    action: "approvals.submit-with-type",
                    entity: "approval_request",
                    ids: { approvalRequestId: data.id },
                    data,
                    changed: { created: [{ type: "approval_request", id: data.id }] },
                    next: [
                        {
                            command: "clk115 api GET /workspaces/{workspaceId}/approval-requests --json",
                            reason: "Review the submitted request.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(approvals, "submit-for-user-with-type", "write")
        .description("Submit another user's approval request with an explicit type.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 approvals submit-for-user-with-type --user user_123 --type TIMESHEET \\\n" +
                "      --period-start 2026-06-01T00:00:00Z\n",
        )
        .requiredOption("--user <id>", "User ID whose approval request is submitted.")
        .requiredOption(
            "--type <type>",
            "Approval request type: TIMESHEET, EXPENSE, or TIMESHEET_AND_EXPENSE.",
        )
        .requiredOption("--period-start <date>", "Approval period start (RFC3339).")
        .option("--period <period>", "Approval period: WEEKLY, SEMI_MONTHLY, or MONTHLY.")
        .action(async function (this: Command, opts) {
            const type = requireEnum(opts.type, OTHER_TYPES, "type");
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.SubmitForUserWithTypeApprovalsRequest> = {
                periodStart: opts.periodStart,
            };
            if (opts.period) body.period = requireEnum(opts.period, PERIODS, "period");
            const created = await client.approvals.submitForUserWithType({
                workspaceId,
                userId: opts.user,
                type,
                body,
            });
            const data = approvalReceiptData(created);
            printReceipt(
                {
                    ok: true,
                    action: "approvals.submit-for-user-with-type",
                    entity: "approval_request",
                    ids: { approvalRequestId: data.id, userId: opts.user },
                    data,
                    changed: { created: [{ type: "approval_request", id: data.id }] },
                    next: [
                        {
                            command: "clk115 api GET /workspaces/{workspaceId}/approval-requests --json",
                            reason: "Review the submitted request.",
                        },
                    ],
                },
                output,
            );
        });
};
