/**
 * Timesheet approval workflow tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, successResult } from "../result.js";

// Each value-set is pinned to the generated SDK enum via `satisfies` so it
// cannot drift from the live Clockify contract: the three differ deliberately.
//   - period (submit/resubmit): no BIWEEKLY exists on the wire.
//   - update state: the two real withdrawn states, never a bare WITHDRAWN.
//   - list filter: only these three are listable (see discrepancies.md
//     `approvals.requests.list`); REJECTED/WITHDRAWN_SUBMISSION are not.
const APPROVAL_PERIODS = [
    "WEEKLY",
    "SEMI_MONTHLY",
    "MONTHLY",
] as const satisfies readonly ClockifyApi.ApprovalPeriod[];
const APPROVAL_UPDATE_STATES = [
    "PENDING",
    "APPROVED",
    "WITHDRAWN_SUBMISSION",
    "WITHDRAWN_APPROVAL",
    "REJECTED",
] as const satisfies readonly ClockifyApi.ApprovalRequestState[];
const APPROVAL_LIST_STATES = [
    "PENDING",
    "APPROVED",
    "WITHDRAWN_APPROVAL",
] as const satisfies readonly ClockifyApi.ApprovalRequestFilterState[];

export function registerApprovalsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_approvals_list",
        {
            title: "List approval requests",
            description: "List timesheet approval requests in the workspace.",
            inputSchema: {
                status: z.enum(APPROVAL_LIST_STATES).optional(),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            const req: ClockifyApi.ListApprovalsRequest = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            if (args.status) req.status = args.status;
            const items = await ctx.client.approvals.list(req);
            return successResult("clockify_approvals_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_approvals_submit",
        {
            title: "Submit a timesheet for approval",
            description: "Submit the current user's timesheet for approval.",
            inputSchema: {
                period: z.enum(APPROVAL_PERIODS),
                periodStart: z
                    .string()
                    .min(1)
                    .describe("RFC3339 timestamp for the start of the period."),
            },
        },
        {
            preview: (args) =>
                ({
                    workspaceId: ctx.workspaceId,
                    body: { period: args.period, periodStart: args.periodStart },
                }) satisfies ClockifyApi.SubmitApprovalsRequest,
            execute: async (request) => {
                const submitted = await ctx.client.approvals.submit(request);
                return successResult("clockify_approvals_submit", submitted, {
                    workspaceId: request.workspaceId,
                });
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_approvals_update_state",
        {
            title: "Update an approval request state",
            description: "Approve, reject, or change the state of a timesheet approval request.",
            inputSchema: {
                approvalRequestId: z.string().min(1),
                state: z.enum(APPROVAL_UPDATE_STATES),
                note: z.string().optional(),
            },
            idempotent: true,
        },
        {
            preview: (args) =>
                ({
                    workspaceId: ctx.workspaceId,
                    approvalRequestId: args.approvalRequestId,
                    body: {
                        state: args.state,
                        ...(args.note !== undefined ? { note: args.note } : {}),
                    },
                }) satisfies ClockifyApi.UpdateStatusApprovalsRequest,
            execute: async (request) => {
                const updated = await ctx.client.approvals.updateStatus(request);
                return successResult("clockify_approvals_update_state", updated, {
                    workspaceId: request.workspaceId,
                    approvalRequestId: request.approvalRequestId,
                });
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_approvals_resubmit",
        {
            title: "Resubmit entries for approval",
            description:
                "Resubmit the current user's time entries for approval for a given period and start date.",
            inputSchema: {
                period: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY"]),
                periodStart: z
                    .string()
                    .min(1)
                    .describe("RFC3339 timestamp for the start of the period."),
            },
        },
        {
            preview: (args) =>
                ({
                    workspaceId: ctx.workspaceId,
                    period: args.period,
                    periodStart: args.periodStart,
                }) satisfies ClockifyApi.ResubmitApprovalsRequest,
            execute: async (request) => {
                const resubmitted = await ctx.client.approvals.resubmit(request);
                return successResult("clockify_approvals_resubmit", resubmitted, {
                    workspaceId: request.workspaceId,
                });
            },
        },
    );
}
