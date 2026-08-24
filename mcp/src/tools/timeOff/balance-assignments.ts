/**
 * Balance-assignment tools — the per-(user, policy) balance record. Wraps
 * `client.balanceAssignment.*`.
 *
 * Live-verified 2026-08-05 against the sandbox: create is additive (it adds to
 * an existing assignment and creates one only when absent), update applies a
 * delta, and delete requires a note.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike, zStringList } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../../result.js";
import { clarifyResult } from "../resolve-clarify.js";
import { userRefHelpers } from "../user-refs.js";
import { resolvePolicyId } from "../workflows/resolve.js";

/** Build the optional balance-assignment `dateRange` from the window args. */
function balanceDateRange(args: {
    start?: string | undefined;
    end?: string | undefined;
}): ClockifyApi.DateRangeV1Request | undefined {
    if (args.start === undefined && args.end === undefined) return undefined;
    const range: ClockifyApi.DateRangeV1Request = {};
    if (args.start !== undefined) range.start = args.start;
    if (args.end !== undefined) range.end = args.end;
    return range;
}

export function registerTimeOffBalanceAssignmentsTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);

    defineTool(
        server,
        "clockify_time_off_balance_assignments_list",
        {
            title: "List balance assignments",
            description:
                "List one user's time-off balance assignments for a single policy. Returns the assignment id needed by the update and delete tools.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                userId: z.string().min(1).describe("Workspace user id, exact name, email, or `me`."),
            },
            idempotent: true,
        },
        async (args) => {
            const policyId = await resolvePolicyId(ctx, args.policyId);
            const users = await resolveUserRefs([args.userId], {
                verb: "list balance assignments for",
                meUserId: await meUserId(),
                listUsers,
                verifyIds: true,
            });
            if (!users.ok) {
                return clarifyResult(
                    "clockify_time_off_balance_assignments_list",
                    "userId",
                    "user",
                    users.clarify,
                );
            }
            const userId = users.userIds[0] ?? "";
            const assignments = await ctx.client.balanceAssignment.getBalanceAssignmentsForUserAndPolicy(
                { workspaceId: ctx.workspaceId, userId, policyId },
            );
            return successResult(
                "clockify_time_off_balance_assignments_list",
                assignments,
                { workspaceId: ctx.workspaceId, policyId, userId, count: assignments.length },
            );
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_balance_assignments_create",
        {
            title: "Add a time-off balance assignment",
            description:
                "Add `balance` to the selected users' balance for one policy, in the policy's configured unit. The amount is additive: if a user already has an assignment for the policy, the API adds to it and keeps the same assignment id; if not, the API creates one. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                userIds: zStringList(z.array(z.string().min(1)).min(1)).describe(
                    "One or more workspace user ids, exact names, emails, or `me`.",
                ),
                balance: zNumberLike(z.number()).describe(
                    "Amount to add in the policy's configured unit; this is a delta, not a replacement value. A negative amount withdraws balance.",
                ),
                note: z.string().min(1).describe("Audit explanation for the balance change."),
                start: z.string().min(1).optional().describe("Balance window start (YYYY-MM-DD)."),
                end: z.string().min(1).optional().describe("Balance window end (YYYY-MM-DD)."),
            },
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const users = await resolveUserRefs(args.userIds, {
                    verb: "add a time-off balance for",
                    meUserId: await meUserId(),
                    listUsers,
                    verifyIds: true,
                });
                if (!users.ok) {
                    return clarifyResult(
                        "clockify_time_off_balance_assignments_create",
                        "userIds",
                        "user",
                        users.clarify,
                    );
                }
                const body: ClockifyRequestBody<ClockifyApi.CreateBalanceAssignmentBalanceAssignmentRequest> =
                    {
                        balance: args.balance,
                        policyId,
                        userIds: users.userIds,
                        note: args.note,
                    };
                const dateRange = balanceDateRange(args);
                if (dateRange !== undefined) body.dateRange = dateRange;
                return {
                    action: "create",
                    entity: "time_off_balance_assignment",
                    policyId,
                    userIds: users.userIds,
                    balance: args.balance,
                    request: { workspaceId: ctx.workspaceId, body },
                };
            },
            execute: async (preview) => {
                await ctx.client.balanceAssignment.createBalanceAssignment(preview.request);
                const { policyId, userIds, balance } = preview;
                return successResult(
                    "clockify_time_off_balance_assignments_create",
                    // The API answers 201 with an empty body and the operation is
                    // additive: each user can be a create or an update.
                    { applied: true, policyId, userIds, balance },
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId,
                        affectedUserCount: userIds.length,
                    },
                    {
                        entity: "time_off_balance_assignment",
                        ids: { workspaceId: preview.request.workspaceId, policyId },
                        warnings: [
                            {
                                code: "balance_assignment_ids_unavailable",
                                message:
                                    "The balance change was applied, but the API does not say which assignments were created or updated and returns no assignment ids. Read back each affected user before a later update or delete.",
                            },
                        ],
                        next: [
                            {
                                tool: "clockify_time_off_balance_assignments_list",
                                args: { policyId, userId: userIds[0] },
                                reason:
                                    "Read back one affected user. Repeat for the other user ids in data before a later update or delete.",
                            },
                        ],
                    },
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_balance_assignments_update",
        {
            title: "Adjust a balance assignment",
            description:
                "Apply `balanceChange` to one existing balance assignment. The change is a delta added to the current balance, not a replacement value; a negative value withdraws balance. Get the assignment id from clockify_time_off_balance_assignments_list. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                balanceAssignmentId: z.string().min(1),
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                userId: z.string().min(1).describe("Workspace user id, exact name, email, or `me`."),
                balanceChange: zNumberLike(z.number()).describe(
                    "Delta applied to the current balance, in the policy's configured unit. A negative value withdraws balance.",
                ),
                note: z.string().min(1).describe("Audit explanation for the balance change."),
                start: z.string().min(1).optional().describe("Balance window start (YYYY-MM-DD)."),
                end: z.string().min(1).optional().describe("Balance window end (YYYY-MM-DD)."),
            },
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const users = await resolveUserRefs([args.userId], {
                    verb: "adjust a balance assignment for",
                    meUserId: await meUserId(),
                    listUsers,
                    verifyIds: true,
                });
                if (!users.ok) {
                    return clarifyResult(
                        "clockify_time_off_balance_assignments_update",
                        "userId",
                        "user",
                        users.clarify,
                    );
                }
                const userId = users.userIds[0] ?? "";
                const body: ClockifyRequestBody<ClockifyApi.UpdateBalanceAssignmentBalanceAssignmentRequest> =
                    { balanceChange: args.balanceChange, note: args.note };
                const dateRange = balanceDateRange(args);
                if (dateRange !== undefined) body.dateRange = dateRange;
                return {
                    action: "update",
                    entity: "time_off_balance_assignment",
                    id: args.balanceAssignmentId,
                    policyId,
                    userId,
                    balanceChange: args.balanceChange,
                    request: {
                        workspaceId: ctx.workspaceId,
                        userId,
                        policyId,
                        balanceAssignmentId: args.balanceAssignmentId,
                        body,
                    },
                };
            },
            execute: async (preview) => {
                await ctx.client.balanceAssignment.updateBalanceAssignment(preview.request);
                return successResult(
                    "clockify_time_off_balance_assignments_update",
                    { updated: true, id: preview.id, balanceChange: preview.balanceChange },
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                        userId: preview.userId,
                    },
                    writeReceipt("updated", "time_off_balance_assignment", preview.id, {
                        next: [
                            {
                                tool: "clockify_time_off_balance_assignments_list",
                                args: { policyId: preview.policyId, userId: preview.userId },
                                reason: "Verify the resulting balance.",
                            },
                        ],
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_balance_assignments_delete",
        {
            title: "Delete a balance assignment",
            description:
                "Permanently delete one balance assignment. The whole accrued balance for that user and policy is removed. The API requires a note and rejects an empty one. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                balanceAssignmentId: z.string().min(1),
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                userId: z.string().min(1).describe("Workspace user id, exact name, email, or `me`."),
                note: z.string().min(1).describe("Required audit explanation for the deletion."),
            },
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const users = await resolveUserRefs([args.userId], {
                    verb: "delete a balance assignment for",
                    meUserId: await meUserId(),
                    listUsers,
                    verifyIds: true,
                });
                if (!users.ok) {
                    return clarifyResult(
                        "clockify_time_off_balance_assignments_delete",
                        "userId",
                        "user",
                        users.clarify,
                    );
                }
                const userId = users.userIds[0] ?? "";
                return {
                    action: "delete",
                    entity: "time_off_balance_assignment",
                    id: args.balanceAssignmentId,
                    policyId,
                    userId,
                    request: {
                        workspaceId: ctx.workspaceId,
                        userId,
                        policyId,
                        balanceAssignmentId: args.balanceAssignmentId,
                        body: { note: args.note },
                    } satisfies ClockifyApi.DeleteBalanceAssignmentBalanceAssignmentRequest,
                };
            },
            execute: async (preview) => {
                await ctx.client.balanceAssignment.deleteBalanceAssignment(preview.request);
                return successResult(
                    "clockify_time_off_balance_assignments_delete",
                    { deleted: true, id: preview.id },
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                        userId: preview.userId,
                    },
                    writeReceipt("deleted", "time_off_balance_assignment", preview.id),
                );
            },
        },
    );
}
