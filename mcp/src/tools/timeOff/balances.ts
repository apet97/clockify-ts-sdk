/**
 * Time-off balance tools — what each user has available under a policy.
 * Wraps `client.balances.{listForPolicy, getForUser, update}`.
 *
 * `balances.update` REPLACES the selected users' balance. The per-(user,
 * policy) assignment record and its additive/delta writes live in
 * `./balance-assignments.ts`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import { resolveUserFilter, resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike, zStringList } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../../result.js";
import { clarifyResult } from "../resolve-clarify.js";
import { userRefHelpers } from "../user-refs.js";
import { resolvePolicyId } from "../workflows/resolve.js";

export function registerTimeOffBalancesTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);

    defineTool(
        server,
        "clockify_time_off_balances_list",
        {
            title: "List balances for a policy",
            description: "List user balances for a time-off policy.",
            inputSchema: { policyId: z.string().min(1) },
            idempotent: true,
        },
        async (args) => {
            const balances = await ctx.client.balances.listForPolicy({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
            });
            return successResult("clockify_time_off_balances_list", balances, {
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
            });
        },
    );

    defineTool(
        server,
        "clockify_time_off_balance_for_user",
        {
            title: "Get a user's time-off balance",
            description: "Fetch a single user's time-off balance across policies.",
            inputSchema: {
                userId: z.string().min(1),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const filter = await resolveUserFilter(args.userId, {
                verb: "fetch the time-off balance for",
                meUserId: await meUserId(),
                listUsers,
            });
            if (!filter.ok)
                return clarifyResult(
                    "clockify_time_off_balance_for_user",
                    "userId",
                    "user",
                    filter.clarify,
                );
            const userId = filter.userId ?? args.userId;
            const balance = await ctx.client.balances.getForUser({
                workspaceId: ctx.workspaceId,
                userId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            });
            return successResult("clockify_time_off_balance_for_user", balance, {
                workspaceId: ctx.workspaceId,
                userId,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_balances_update",
        {
            title: "Adjust time-off balances",
            description:
                "Replace the selected users' balance with `value` in the time-off policy's configured unit. Read the policy and current balances first when the unit is uncertain.",
            inputSchema: {
                policyId: z
                    .string()
                    .min(1)
                    .describe("Policy id (24-hex) or exact policy name."),
                userIds: zStringList(z.array(z.string().min(1)).min(1)).describe(
                    "One or more workspace user ids, exact names, emails, or `me`.",
                ),
                value: zNumberLike(z.number()).describe(
                    "Replacement balance value in the selected policy's configured unit; this is not a delta.",
                ),
                note: z.string().min(1).describe("Required audit explanation for the adjustment."),
            },
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const requestedEmails = new Set(
                    args.userIds.map((value) => value.trim().toLowerCase()),
                );
                const users = await resolveUserRefs(args.userIds, {
                    verb: "adjust time-off balances for",
                    meUserId: await meUserId(),
                    listUsers: async () =>
                        (await listUsers()).map((user) =>
                            user.email && requestedEmails.has(user.email.trim().toLowerCase())
                                ? { ...user, name: user.email }
                                : user,
                        ),
                    verifyIds: true,
                });
                if (!users.ok) {
                    return clarifyResult(
                        "clockify_time_off_balances_update",
                        "userIds",
                        "user",
                        users.clarify,
                    );
                }
                const request = {
                    workspaceId: ctx.workspaceId,
                    policyId,
                    note: args.note,
                    userIds: users.userIds,
                    value: args.value,
                } satisfies ClockifyApi.UpdateBalancesRequest;
                return {
                    action: "update",
                    entity: "time_off_balance_adjustment",
                    policyId,
                    userIds: users.userIds,
                    value: args.value,
                    request,
                };
            },
            execute: async (preview) => {
                await ctx.client.balances.update(preview.request);
                const { policyId, userIds, value } = preview;
                return successResult(
                    "clockify_time_off_balances_update",
                    { updated: true, policyId, userIds, value },
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId,
                        affectedUserCount: userIds.length,
                    },
                    writeReceipt("updated", "time_off_balance_adjustment", policyId, {
                        ids: { workspaceId: preview.request.workspaceId, policyId },
                        next: [
                            {
                                tool: "clockify_time_off_balances_list",
                                args: { policyId },
                                reason: "Verify the resulting balances for this policy.",
                            },
                        ],
                    }),
                );
            },
        },
    );
}
