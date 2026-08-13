/**
 * `clk115 timeoff balance-assignment list|create|update|delete`.
 *
 * A balance assignment is the per-(user, policy) time-off balance record.
 * Live-verified 2026-08-05 against the sandbox workspace:
 *
 * - `create` is additive, not idempotent. If the user already has an
 *   assignment for the policy, the API adds `--balance` to the existing
 *   accrued amount and keeps the same assignment ID. If no assignment
 *   exists, the API creates one.
 * - `update` applies `--change` as a delta, not a replacement value. A
 *   negative delta withdraws balance.
 * - `delete` requires a note in the request body.
 */
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import {
    parseSignedFloatArg,
    requireCalendarDate,
    resolveContext,
    splitList,
} from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Services } from "./types.js";

/** Build the optional `dateRange` body field from the two window flags. */
function dateRange(opts: {
    start?: string;
    end?: string;
}): ClockifyApi.DateRangeV1Request | undefined {
    if (opts.start === undefined && opts.end === undefined) return undefined;
    const range: ClockifyApi.DateRangeV1Request = {};
    if (opts.start !== undefined) range.start = requireCalendarDate(opts.start, "start");
    if (opts.end !== undefined) range.end = requireCalendarDate(opts.end, "end");
    return range;
}

/**
 * Register the balance-assignment leaves under an existing `timeoff`
 * group. The commands live in their own module because the balance
 * lifecycle is a distinct resource, but they stay in the time-off
 * vocabulary that the SDK and MCP surfaces already use.
 */
export function registerBalanceAssignmentCommands(timeoff: Command, services: Services): void {
    const group = timeoff
        .command("balance-assignment")
        .description("Per-user, per-policy time-off balance assignments.");

    leafCommand(group, "list", "read")
        .description("List a user's balance assignments for one policy.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 timeoff balance-assignment list --user user_123 --policy policy_456\n",
        )
        .requiredOption("--user <id>", "User ID.")
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const assignments = await client.balanceAssignment.getBalanceAssignmentsForUserAndPolicy({
                workspaceId,
                userId: opts.user,
                policyId: opts.policy,
            });
            const rows = assignments.map((assignment) => ({
                id: assignment.id ?? "",
                user: assignment.userId ?? "",
                policy: assignment.policyId ?? "",
                balance: assignment.balance ?? 0,
                accrued: assignment.accrued ?? 0,
            }));
            printRecords(rows, output);
        });

    leafCommand(group, "create", "write")
        .description(
            "Add balance for one or more users on a policy. Adds to an existing assignment; creates one when absent.",
        )
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 timeoff balance-assignment create --policy policy_456 \\\n" +
                "      --user user_123 --balance 5\n",
        )
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .requiredOption("--user <ids>", "Comma-separated user IDs.")
        .requiredOption("--balance <amount>", "Balance to add (may be negative).", parseSignedFloatArg)
        .option("--note <text>", "Note explaining the balance change.")
        .option("--start <date>", "Balance window start (YYYY-MM-DD).")
        .option("--end <date>", "Balance window end (YYYY-MM-DD).")
        .action(async function (this: Command, opts) {
            const range = dateRange(opts);
            const { client, workspaceId, output } = await resolveContext(this, services);
            const userIds = splitList(opts.user);
            if (userIds.length === 0) throw new Error("--user needs at least one user ID");
            const body: ClockifyRequestBody<ClockifyApi.CreateBalanceAssignmentBalanceAssignmentRequest> =
                {
                    balance: opts.balance,
                    policyId: opts.policy,
                    userIds,
                };
            if (opts.note !== undefined) body.note = opts.note;
            if (range !== undefined) body.dateRange = range;
            await client.balanceAssignment.createBalanceAssignment({ workspaceId, body });
            printReceipt(
                {
                    ok: true,
                    action: "timeoff.balance-assignment.create",
                    entity: "balance_assignment",
                    ids: { policyId: opts.policy },
                    data: { policyId: opts.policy, userIds, balance: opts.balance },
                    // The API answers 201 with an empty body, so no assignment
                    // ID is known here. Report the change through the read-back
                    // instead of inventing IDs in `changed`.
                    warnings: [
                        "The API returns no assignment ID. Run the listed read-back to see the resulting balance.",
                    ],
                    next: [
                        {
                            command: `clk115 timeoff balance-assignment list --user ${userIds[0]} --policy ${opts.policy} --json`,
                            reason: "Read back the resulting balance.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(group, "update", "write")
        .description("Apply a balance delta to one assignment. The change adds to the current balance.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 timeoff balance-assignment update --id ba_123 --user user_123 \\\n" +
                "      --policy policy_456 --change -2\n",
        )
        .requiredOption("--id <id>", "Balance assignment ID.")
        .requiredOption("--user <id>", "User ID.")
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .requiredOption(
            "--change <amount>",
            "Balance delta; negative withdraws balance.",
            parseSignedFloatArg,
        )
        .option("--note <text>", "Note explaining the balance change.")
        .option("--start <date>", "Balance window start (YYYY-MM-DD).")
        .option("--end <date>", "Balance window end (YYYY-MM-DD).")
        .action(async function (this: Command, opts) {
            const range = dateRange(opts);
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.UpdateBalanceAssignmentBalanceAssignmentRequest> =
                { balanceChange: opts.change };
            if (opts.note !== undefined) body.note = opts.note;
            if (range !== undefined) body.dateRange = range;
            await client.balanceAssignment.updateBalanceAssignment({
                workspaceId,
                userId: opts.user,
                policyId: opts.policy,
                balanceAssignmentId: opts.id,
                body,
            });
            printReceipt(
                {
                    ok: true,
                    action: "timeoff.balance-assignment.update",
                    entity: "balance_assignment",
                    ids: { balanceAssignmentId: opts.id, userId: opts.user, policyId: opts.policy },
                    data: { id: opts.id, balanceChange: opts.change },
                    changed: { updated: [{ type: "balance_assignment", id: opts.id }] },
                    next: [
                        {
                            command: `clk115 timeoff balance-assignment list --user ${opts.user} --policy ${opts.policy} --json`,
                            reason: "Read back the resulting balance.",
                        },
                    ],
                },
                output,
            );
        });

    leafCommand(group, "delete", "destructive")
        .description("Delete a balance assignment. The API requires a note.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 timeoff balance-assignment delete --id ba_123 --user user_123 \\\n" +
                "      --policy policy_456 --note \"Correcting overage\"\n",
        )
        .requiredOption("--id <id>", "Balance assignment ID.")
        .requiredOption("--user <id>", "User ID.")
        .requiredOption("--policy <id>", "Time-off policy ID.")
        .requiredOption("--note <text>", "Note explaining the deletion. The API rejects an empty note.")
        .action(async function (this: Command, opts) {
            // CLI-6: the help promises the API rejects an empty note; enforce
            // it locally so the failure is immediate and clearly attributed.
            if (typeof opts.note !== "string" || opts.note.trim() === "") {
                throw new Error(
                    "--note must be a non-empty note: the API rejects an empty note on balance-assignment delete.",
                );
            }
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.balanceAssignment.deleteBalanceAssignment({
                workspaceId,
                userId: opts.user,
                policyId: opts.policy,
                balanceAssignmentId: opts.id,
                body: { note: opts.note },
            });
            printReceipt(
                {
                    ok: true,
                    action: "timeoff.balance-assignment.delete",
                    entity: "balance_assignment",
                    ids: { balanceAssignmentId: opts.id, userId: opts.user, policyId: opts.policy },
                    data: { id: opts.id, deleted: true, message: `deleted balance assignment ${opts.id}` },
                    changed: { deleted: [{ type: "balance_assignment", id: opts.id }] },
                    next: [
                        {
                            command: `clk115 timeoff balance-assignment list --user ${opts.user} --policy ${opts.policy} --json`,
                            reason: "Verify the assignment no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
}
