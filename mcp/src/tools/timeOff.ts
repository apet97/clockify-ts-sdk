/**
 * Time-off requests, policies, and balances. Three distinct SDK
 * resource groups grouped here because they share a workflow:
 * policies define the rules, balances expose what's available, and
 * requests are the actual time-off events.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

const REQUEST_STATUSES = ["APPROVED", "PENDING", "REJECTED", "WITHDRAWN"] as const;

export function registerTimeOffTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_time_off_requests_list",
        {
            title: "List time-off requests",
            description: "List time-off requests in the workspace with filters and pagination.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                start: z.string().optional(),
                end: z.string().optional(),
                statuses: z.array(z.enum(REQUEST_STATUSES)).optional(),
                users: z.array(z.string()).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                };
                if (args.start) req.start = args.start;
                if (args.end) req.end = args.end;
                if (args.statuses) req.statuses = args.statuses;
                if (args.users) req.users = args.users;
                const items = (await ctx.client.timeOff.list(req as never)) as unknown[];
                return successResult("clockify_time_off_requests_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_time_off_requests_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_requests_get",
        {
            title: "Get a time-off request",
            description: "Fetch one time-off request by ID from the pinned workspace.",
            inputSchema: { requestId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req = await ctx.client.timeOff.get({
                    workspaceId: ctx.workspaceId,
                    requestId: args.requestId,
                });
                return successResult("clockify_time_off_requests_get", req, {
                    workspaceId: ctx.workspaceId,
                    requestId: args.requestId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_requests_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_requests_submit",
        {
            title: "Submit a time-off request",
            description: "Submit a time-off request against a policy.",
            inputSchema: {
                policyId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
                days: z.number().int().optional(),
                note: z.string().optional(),
                isHalfDay: z.boolean().optional(),
                halfDayPeriod: z.string().optional().describe("FIRST_HALF | SECOND_HALF | NOT_DEFINED."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const period: Record<string, unknown> = { start: args.start, end: args.end };
                if (args.days !== undefined) period.days = args.days;
                const body: Record<string, unknown> = {
                    timeOffPeriod: {
                        isHalfDay: args.isHalfDay === true,
                        halfDayPeriod: args.halfDayPeriod ?? "NOT_DEFINED",
                        period,
                    },
                };
                if (args.note) body.note = args.note;
                const created = await ctx.client.timeOff.submit({
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                    body,
                } as never);
                return successResult("clockify_time_off_requests_submit", created, {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_requests_submit", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_requests_update_status",
        {
            title: "Update a time-off request status",
            description: "Approve, reject, or change the status of a time-off request.",
            inputSchema: {
                requestId: z.string().min(1),
                statusType: z.enum(REQUEST_STATUSES),
                note: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { statusType: args.statusType };
                if (args.note) body.note = args.note;
                const updated = await ctx.client.timeOff.updateStatus({
                    workspaceId: ctx.workspaceId,
                    requestId: args.requestId,
                    body,
                } as never);
                return successResult("clockify_time_off_requests_update_status", updated, {
                    workspaceId: ctx.workspaceId,
                    requestId: args.requestId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_requests_update_status", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_requests_delete",
        {
            title: "Delete a time-off request",
            description: "Permanently delete one time-off request by ID.",
            inputSchema: { requestId: z.string().min(1) },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            try {
                await ctx.client.timeOff.delete({
                    workspaceId: ctx.workspaceId,
                    requestId: args.requestId,
                });
                return successResult(
                    "clockify_time_off_requests_delete",
                    { deleted: true, requestId: args.requestId },
                    { workspaceId: ctx.workspaceId, requestId: args.requestId },
                );
            } catch (err) {
                return errorResult("clockify_time_off_requests_delete", err);
            }
        },
    );

    // ---- policies ----

    server.registerTool(
        "clockify_time_off_policies_list",
        {
            title: "List time-off policies",
            description: "List time-off policies in the workspace with bounded pagination.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const items = (await ctx.client.timeOffPolicies.list({
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                } as never)) as unknown[];
                return successResult("clockify_time_off_policies_list", items, {
                    workspaceId: ctx.workspaceId,
                    count: items.length,
                });
            } catch (err) {
                return errorResult("clockify_time_off_policies_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_policies_get",
        {
            title: "Get a time-off policy",
            description: "Fetch one time-off policy by ID from the pinned workspace.",
            inputSchema: { policyId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const policy = await ctx.client.timeOffPolicies.get({
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
                return successResult("clockify_time_off_policies_get", policy, {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_policies_get", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_policies_create",
        {
            title: "Create a time-off policy",
            description: "Create a new time-off policy with optional approval and balance settings.",
            inputSchema: {
                name: z.string().min(1),
                timeUnit: z.string().optional().describe("DAYS | HOURS."),
                daysPerYear: z.number().optional(),
                negativeBalanceAllowed: z.boolean().optional(),
                requiresApproval: z.boolean().optional(),
                automaticApproval: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = { name: args.name };
                if (args.timeUnit) body.timeUnit = args.timeUnit;
                if (args.daysPerYear !== undefined) body.daysPerYear = args.daysPerYear;
                if (args.negativeBalanceAllowed !== undefined) body.negativeBalance = args.negativeBalanceAllowed;
                if (args.requiresApproval !== undefined) body.requiresApproval = args.requiresApproval;
                if (args.automaticApproval !== undefined) body.automaticApproval = args.automaticApproval;
                const created = await ctx.client.timeOffPolicies.create({
                    workspaceId: ctx.workspaceId,
                    body,
                } as never);
                return successResult("clockify_time_off_policies_create", created, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_policies_create", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_policies_update",
        {
            title: "Update a time-off policy",
            description: "Update one time-off policy's yearly balance and approval rules by ID.",
            inputSchema: {
                policyId: z.string().min(1),
                name: z.string().optional(),
                daysPerYear: z.number().optional(),
                negativeBalanceAllowed: z.boolean().optional(),
                requiresApproval: z.boolean().optional(),
                automaticApproval: z.boolean().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const body: Record<string, unknown> = {};
                if (args.name) body.name = args.name;
                if (args.daysPerYear !== undefined) body.daysPerYear = args.daysPerYear;
                if (args.negativeBalanceAllowed !== undefined) body.negativeBalance = args.negativeBalanceAllowed;
                if (args.requiresApproval !== undefined) body.requiresApproval = args.requiresApproval;
                if (args.automaticApproval !== undefined) body.automaticApproval = args.automaticApproval;
                const updated = await ctx.client.timeOffPolicies.update({
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                    body,
                } as never);
                return successResult("clockify_time_off_policies_update", updated, {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_policies_update", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_policies_archive",
        {
            title: "Archive or reactivate a time-off policy",
            description: "Toggle the archived state of a time-off policy.",
            inputSchema: {
                policyId: z.string().min(1),
                archived: z.boolean(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const updated = await ctx.client.timeOffPolicies.updateStatus({
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                    body: { archived: args.archived },
                } as never);
                return successResult("clockify_time_off_policies_archive", updated, {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_policies_archive", err);
            }
        },
    );

    // ---- balances ----

    server.registerTool(
        "clockify_time_off_balances_list",
        {
            title: "List balances for a policy",
            description: "List user balances for a time-off policy.",
            inputSchema: { policyId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const balances = await ctx.client.balances.listForPolicy({
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
                return successResult("clockify_time_off_balances_list", balances, {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_balances_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_time_off_balance_for_user",
        {
            title: "Get a user's time-off balance",
            description: "Fetch a single user's time-off balance across policies.",
            inputSchema: {
                userId: z.string().min(1),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const balance = await ctx.client.balances.getForUser({
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                });
                return successResult("clockify_time_off_balance_for_user", balance, {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                });
            } catch (err) {
                return errorResult("clockify_time_off_balance_for_user", err);
            }
        },
    );
}
