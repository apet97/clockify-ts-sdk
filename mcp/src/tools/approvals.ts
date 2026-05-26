/**
 * Timesheet approval workflow tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

const APPROVAL_STATES = ["APPROVED", "PENDING", "REJECTED", "WITHDRAWN"] as const;
const APPROVAL_PERIODS = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const;

export function registerApprovalsTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_approvals_list",
        {
            title: "List approval requests",
            description: "List timesheet approval requests in the workspace.",
            inputSchema: {
                status: z.enum(APPROVAL_STATES).optional(),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                };
                if (args.status) req.status = args.status;
                const items = (await ctx.client.approvals.list(req as never)) as unknown[];
                return successResult("clockify_approvals_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_approvals_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_approvals_submit",
        {
            title: "Submit a timesheet for approval",
            description: "Submit the current user's timesheet for approval.",
            inputSchema: {
                period: z.enum(APPROVAL_PERIODS),
                periodStart: z.string().min(1).describe("RFC3339 timestamp for the start of the period."),
            },
        },
        async (args) => {
            try {
                const submitted = await ctx.client.approvals.submit({
                    workspaceId: ctx.workspaceId,
                    body: { period: args.period, periodStart: args.periodStart },
                } as never);
                return successResult("clockify_approvals_submit", submitted, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_approvals_submit", err);
            }
        },
    );

    server.registerTool(
        "clockify_approvals_update_state",
        {
            title: "Update an approval request state",
            description: "Approve, reject, or change the state of a timesheet approval request.",
            inputSchema: {
                approvalRequestId: z.string().min(1),
                state: z.enum(APPROVAL_STATES),
                note: z.string().optional(),
            },
        },
        async (args) => {
            try {
                const updated = await ctx.client.approvals.updateStatus({
                    workspaceId: ctx.workspaceId,
                    approvalRequestId: args.approvalRequestId,
                    state: args.state,
                    note: args.note,
                } as never);
                return successResult("clockify_approvals_update_state", updated, {
                    workspaceId: ctx.workspaceId,
                    approvalRequestId: args.approvalRequestId,
                });
            } catch (err) {
                return errorResult("clockify_approvals_update_state", err);
            }
        },
    );
}
