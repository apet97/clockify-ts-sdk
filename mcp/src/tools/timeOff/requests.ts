/**
 * Time-off request tools — the actual time-off events. Wraps
 * `client.timeOff.{list, submit, submitForUser, changeTimeOffRequestStatus,
 * withdraw}`. Requests are policy-scoped on every write path, so each write
 * resolves a policy id first.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike, zStringList } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import {
    defineGuardedTool,
    defineTool,
    entityId,
    errorResult,
    successResult,
    writeReceipt,
} from "../../result.js";
import { clarifyResult } from "../resolve-clarify.js";
import { userRefHelpers } from "../user-refs.js";
import { resolvePolicyId, validateDatePrefix } from "../workflows/resolve.js";

// The POST-search `statuses` filter accepts only [ALL, PENDING, APPROVED,
// REJECTED]. It 400s on WITHDRAWN (code 501, live-verified 2026-06-15; see
// discrepancies.md `time-off.requests.get.dead-route`). WITHDRAWN is a
// per-request response status, not a valid search filter.
const REQUEST_SEARCH_STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

export function registerTimeOffRequestsTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);

    defineTool(
        server,
        "clockify_time_off_requests_list",
        {
            title: "List time-off requests",
            description: "List time-off requests in the workspace with filters and pagination.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
                start: z.string().optional(),
                end: z.string().optional(),
                statuses: zStringList(z.array(z.enum(REQUEST_SEARCH_STATUSES))).optional(),
                users: zStringList(z.array(z.string())).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            let users = args.users;
            if (args.users?.length) {
                const r = await resolveUserRefs(args.users, {
                    verb: "filter time-off requests by",
                    meUserId: await meUserId(),
                    listUsers,
                    verifyIds: false, // read filter — a 24-hex id is trusted, no list call
                });
                if (!r.ok)
                    return clarifyResult(
                        "clockify_time_off_requests_list",
                        "users",
                        "user",
                        r.clarify,
                    );
                users = r.userIds;
            }
            const req: ClockifyApi.ListTimeOffRequest = {
                workspaceId: ctx.workspaceId,
                page: args.page ?? 1,
                pageSize: args.pageSize ?? 50,
            };
            if (args.start) req.start = args.start;
            if (args.end) req.end = args.end;
            // Input was validated against REQUEST_SEARCH_STATUSES: the exact set
            // the search filter accepts.
            if (args.statuses) req.statuses = args.statuses;
            if (users) req.users = users;
            // timeOff.list returns the TimeOffRequestsResponse envelope
            // ({ count, requests }), NOT a bare array (live-verified 2026-06-18);
            // unwrap `requests` and report the server-side `count`.
            const res = await ctx.client.timeOff.list(req);
            const items = res.requests ?? [];
            return successResult("clockify_time_off_requests_list", items, {
                workspaceId: ctx.workspaceId,
                count: res.count ?? items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_time_off_requests_get",
        {
            title: "Get a time-off request",
            description: "Fetch one time-off request by ID from the pinned workspace.",
            inputSchema: { requestId: z.string().min(1) },
            idempotent: true,
        },
        async (args) => {
            // GET /time-off/requests/{id} is a dead 404 route ("No static
            // resource", live-verified 2026-06-15). The requests live behind
            // the POST search (`timeOff.list`, an envelope {count, requests}).
            // The search `statuses` filter accepts only [PENDING, APPROVED,
            // REJECTED, ALL] (NOT the per-request WITHDRAWN status), so use
            // ALL and walk pages (bounded) scanning by id.
            const pageSize = 200;
            let found: { id?: string } | undefined;
            for (let page = 1; page <= 50; page++) {
                const searchReq: ClockifyApi.ListTimeOffRequest = {
                    workspaceId: ctx.workspaceId,
                    page,
                    pageSize,
                    statuses: ["ALL"],
                };
                const res = await ctx.client.timeOff.list(searchReq);
                const requests: Array<{ id?: string }> = res.requests ?? [];
                found = requests.find((r) => (r.id ?? "") === args.requestId);
                if (found || requests.length < pageSize) break;
            }
            if (!found) {
                return errorResult(
                    "clockify_time_off_requests_get",
                    new Error(
                        `time-off request ${JSON.stringify(args.requestId)} not found in the workspace search`,
                    ),
                );
            }
            return successResult("clockify_time_off_requests_get", found, {
                workspaceId: ctx.workspaceId,
                requestId: args.requestId,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_requests_submit",
        {
            title: "Submit a time-off request",
            description: "Submit a time-off request against a policy.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                start: z
                    .string()
                    .min(1)
                    .describe(
                        "Start date. DAYS-unit policies want a date-only start (yyyy-MM-dd); HOURS-unit policies want a full RFC3339 datetime (yyyy-MM-ddThh:mm:ssZ).",
                    ),
                end: z
                    .string()
                    .min(1)
                    .optional()
                    .describe(
                        "Range end (RFC3339). Required by HOURS-unit (date-range) policies; omit for DAYS-unit policies and pass `days`. Provide `end` OR `days`.",
                    ),
                days: zNumberLike(z.number().int())
                    .optional()
                    .describe(
                        "Number of days. Required by DAYS-unit policies; omit for HOURS-unit policies and pass `end`. Provide `end` OR `days`.",
                    ),
                note: z.string().optional(),
                isHalfDay: z.boolean().optional(),
                halfDayPeriod: z
                    .enum(["FIRST_HALF", "SECOND_HALF", "NOT_DEFINED"])
                    .optional()
                    .describe("FIRST_HALF | SECOND_HALF | NOT_DEFINED."),
            },
        },
        {
            preview: async (args) => {
                // The submit period shape is policy-unit dependent: DAYS-unit policies
                // reject {start,end} and want {start,days}; HOURS-unit policies want
                // {start,end} and reject days (live-verified 2026-06-21). The tool
                // can't see the policy unit, so require at least one of end / days.
                if ((args.end === undefined) === (args.days === undefined)) {
                    return errorResult(
                        "clockify_time_off_requests_submit",
                        new Error(
                            "provide exactly one of `end` (date-range / HOURS-unit policies) or `days` (DAYS-unit policies)",
                        ),
                    );
                }
                const start = validateDatePrefix(args.start);
                const end =
                    args.end === undefined ? undefined : validateDatePrefix(args.end);
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const period: ClockifyApi.PeriodV1Request = { start };
                if (end !== undefined) period.end = end;
                if (args.days !== undefined) period.days = args.days;
                const body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest> = {
                    note: args.note ?? "",
                    timeOffPeriod: {
                        isHalfDay: args.isHalfDay === true,
                        halfDayPeriod: args.halfDayPeriod ?? "NOT_DEFINED",
                        period,
                    },
                };
                return {
                    action: "create",
                    entity: "time_off_request",
                    policyId,
                    request: {
                        workspaceId: ctx.workspaceId,
                        policyId,
                        body,
                    } satisfies ClockifyApi.SubmitTimeOffRequest,
                };
            },
            execute: async (preview) => {
                const created = await ctx.client.timeOff.submit(preview.request);
                return successResult(
                    "clockify_time_off_requests_submit",
                    created,
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                    },
                    writeReceipt("created", "time_off_request", { id: entityId(created) }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_requests_update_status",
        {
            title: "Update a time-off request status",
            description:
                "Approve, reject, or change the status of a time-off request. Requires policyId — the status endpoint is policy-scoped.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                requestId: z.string().min(1),
                // The wire `status` target accepts only APPROVED / REJECTED;
                // PENDING and WITHDRAWN are read-only request states it rejects
                // (live-verified 2026-06-18).
                statusType: z.enum(["APPROVED", "REJECTED"]),
                note: z.string().optional(),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                // The live status endpoint is policy-scoped and the wire field is
                // `status` (`statusType` only appears in responses).
                const body: ClockifyRequestBody<ClockifyApi.ChangeTimeOffRequestStatusTimeOffRequest> =
                    { status: args.statusType };
                if (args.note) body.note = args.note;
                return {
                    action: "update",
                    entity: "time_off_request",
                    id: args.requestId,
                    policyId,
                    request: {
                        workspaceId: ctx.workspaceId,
                        policyId,
                        requestId: args.requestId,
                        body,
                    } satisfies ClockifyApi.ChangeTimeOffRequestStatusTimeOffRequest,
                };
            },
            execute: async (preview) => {
                const updated = await ctx.client.timeOff.changeTimeOffRequestStatus(
                    preview.request,
                );
                return successResult(
                    "clockify_time_off_requests_update_status",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                        requestId: preview.id,
                    },
                    writeReceipt("updated", "time_off_request", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_requests_delete",
        {
            title: "Delete a time-off request",
            description:
                "Permanently delete one PENDING time-off request. Requires policyId — the delete endpoint is policy-scoped (the flat /time-off/requests/{id} route 404s). Only PENDING requests are deletable; terminal APPROVED/REJECTED requests have no delete path. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                requestId: z.string().min(1),
            },
        },
        {
            preview: async (args) => {
                const policyId = await resolvePolicyId(ctx, args.policyId);
                return {
                    action: "delete",
                    entity: "time_off_request",
                    id: args.requestId,
                    policyId,
                    request: {
                        workspaceId: ctx.workspaceId,
                        policyId,
                        requestId: args.requestId,
                    } satisfies ClockifyApi.WithdrawTimeOffRequest,
                };
            },
            execute: async (preview) => {
                // The working delete route is policy-scoped; token execution uses
                // the exact policy id resolved during preview.
                await ctx.client.timeOff.withdraw(preview.request);
                return successResult(
                    "clockify_time_off_requests_delete",
                    { deleted: true, requestId: preview.id },
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                        requestId: preview.id,
                    },
                    writeReceipt("deleted", "time_off_request", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_requests_create_for_user",
        {
            title: "Request time off for another user",
            description:
                "Submit a time-off request on behalf of another workspace user. Use clockify_request_time_off for your own request. The period shape is policy-unit dependent: a DAYS-unit policy wants start plus days, an HOURS-unit policy wants start plus end. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                policyId: z.string().min(1).describe("Policy id (24-hex) or exact policy name."),
                userId: z.string().min(1).describe("Workspace user id, exact name, email, or `me`."),
                start: z
                    .string()
                    .min(1)
                    .describe("Period start: YYYY-MM-DD for a DAYS-unit policy, RFC3339 for HOURS."),
                end: z.string().min(1).optional().describe("Period end (RFC3339); HOURS-unit policies need it."),
                days: zNumberLike(z.number().int().positive())
                    .optional()
                    .describe("Days requested; DAYS-unit policies need it."),
                note: z.string().optional(),
            },
        },
        {
            preview: async (args) => {
                if (args.end === undefined && args.days === undefined) {
                    throw new Error(
                        "provide end (date-range / HOURS-unit policies) or days (DAYS-unit policies)",
                    );
                }
                const start = validateDatePrefix(args.start);
                const end =
                    args.end === undefined ? undefined : validateDatePrefix(args.end);
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const users = await resolveUserRefs([args.userId], {
                    verb: "request time off for",
                    meUserId: await meUserId(),
                    listUsers,
                    verifyIds: true,
                });
                if (!users.ok) {
                    return clarifyResult(
                        "clockify_time_off_requests_create_for_user",
                        "userId",
                        "user",
                        users.clarify,
                    );
                }
                const userId = users.userIds[0] ?? "";
                const period: ClockifyApi.PeriodV1Request = { start };
                if (end !== undefined) period.end = end;
                if (args.days !== undefined) period.days = args.days;
                return {
                    action: "create",
                    entity: "time_off_request",
                    policyId,
                    userId,
                    request: {
                        workspaceId: ctx.workspaceId,
                        policyId,
                        userId,
                        body: {
                            note: args.note ?? "",
                            timeOffPeriod: {
                                isHalfDay: false,
                                halfDayPeriod: "NOT_DEFINED",
                                period,
                            },
                        },
                    } satisfies ClockifyApi.SubmitForUserTimeOffRequest,
                };
            },
            execute: async (preview) => {
                const created = await ctx.client.timeOff.submitForUser(preview.request);
                return successResult(
                    "clockify_time_off_requests_create_for_user",
                    created,
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.policyId,
                        userId: preview.userId,
                    },
                    writeReceipt("created", "time_off_request", { id: entityId(created) }, {
                        next: [
                            {
                                tool: "clockify_time_off_requests_list",
                                reason: "Check the request status after submitting.",
                            },
                        ],
                    }),
                );
            },
        },
    );
}
