/**
 * Timesheet approval workflow tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineTool, successResult } from "../result.js";

const APPROVAL_STATES = ["APPROVED", "PENDING", "REJECTED", "WITHDRAWN"] as const;
const APPROVAL_PERIODS = ["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY"] as const;

export function registerApprovalsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
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
        },
    );

    defineTool(
        server,
        "clockify_approvals_submit",
        {
            title: "Submit a timesheet for approval",
            description: "Submit the current user's timesheet for approval.",
            inputSchema: {
                period: z.enum(APPROVAL_PERIODS),
                periodStart: z.string().min(1).describe("RFC3339 timestamp for the start of the period."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const submitted = await ctx.client.approvals.submit({
                workspaceId: ctx.workspaceId,
                body: { period: args.period, periodStart: args.periodStart },
            } as never);
            return successResult("clockify_approvals_submit", submitted, {
                workspaceId: ctx.workspaceId,
            });
        },
    );

    defineTool(
        server,
        "clockify_approvals_update_state",
        {
            title: "Update an approval request state",
            description: "Approve, reject, or change the state of a timesheet approval request.",
            inputSchema: {
                approvalRequestId: z.string().min(1),
                state: z.enum(APPROVAL_STATES),
                note: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
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
        },
    );

    defineTool(
        server,
        "clockify_approvals_resubmit",
        {
            title: "Resubmit entries for approval",
            description: "Resubmit the current user's time entries for approval for a given period and start date.",
            inputSchema: {
                period: z.enum(["WEEKLY", "SEMI_MONTHLY", "MONTHLY"]),
                periodStart: z.string().min(1).describe("RFC3339 timestamp for the start of the period."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const resubmitted = await ctx.client.approvals.resubmit({
                workspaceId: ctx.workspaceId,
                period: args.period,
                periodStart: args.periodStart,
            });
            return successResult("clockify_approvals_resubmit", resubmitted, {
                workspaceId: ctx.workspaceId,
            });
        },
    );
}
