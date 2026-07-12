/**
 * Time-off requests, policies, and balances. Three distinct SDK
 * resource groups grouped here because they share a workflow:
 * policies define the rules, balances expose what's available, and
 * requests are the actual time-off events.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveGroupRefs, resolveUserFilter, resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike, zStringList } from "../arg-shapes.js";
import type { Context } from "../client.js";
import {
    defineGuardedTool,
    defineTool,
    entityId,
    errorResult,
    successResult,
    writeReceipt,
} from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";
import { userRefHelpers } from "./user-refs.js";
import { resolvePolicyId } from "./workflows/resolve.js";

// The POST-search `statuses` filter accepts only [ALL, PENDING, APPROVED,
// REJECTED]. It 400s on WITHDRAWN (code 501, live-verified 2026-06-15; see
// discrepancies.md `time-off.requests.get.dead-route`). WITHDRAWN is a
// per-request response status, not a valid search filter.
const REQUEST_SEARCH_STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

type PolicyUpdateBody = ClockifyRequestBody<ClockifyApi.UpdateTimeOffPoliciesRequest>;

function policyIcon(value: unknown): NonNullable<PolicyUpdateBody["icon"]> {
    switch (value) {
        case "UMBRELLA":
        case "SNOWFLAKE":
        case "FAMILY":
        case "PLANE":
        case "STETHOSCOPE":
        case "HEALTH_METRICS":
        case "CHILDCARE":
        case "LUGGAGE":
        case "MONETIZATION":
        case "CALENDAR":
            return value;
        default:
            throw new Error("cannot replace time-off policy: current icon is invalid");
    }
}

function record(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`cannot replace time-off policy: current ${field} is missing or invalid`);
    }
    return value as Record<string, unknown>;
}

function requiredPolicyBoolean(
    current: Record<string, unknown>,
    field:
        | "allowHalfDay"
        | "allowNegativeBalance"
        | "archived"
        | "everyoneIncludingNew"
        | "hasExpiration",
): boolean {
    const value = current[field];
    if (typeof value !== "boolean") {
        throw new Error(`cannot replace time-off policy: current ${field} is missing or invalid`);
    }
    return value;
}

function requiredPolicyStrings(
    current: Record<string, unknown>,
    field: "userIds" | "userGroupIds",
): string[] {
    const value = current[field];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`cannot replace time-off policy: current ${field} is missing or invalid`);
    }
    return [...value];
}

function policyScope(ids: string[]): ClockifyApi.PoliciesUserIdsSchema {
    return { contains: "CONTAINS", ids: [...ids], status: "ACTIVE" };
}

function policyApproval(value: unknown): ClockifyApi.PolicyApprovalDto {
    const source = record(value, "approve");
    const approval: ClockifyApi.PolicyApprovalDto = {};
    for (const field of ["requiresApproval", "specificMembers", "teamManagers"] as const) {
        if (source[field] !== undefined) {
            if (typeof source[field] !== "boolean") {
                throw new Error(
                    `cannot replace time-off policy: current approve.${field} is invalid`,
                );
            }
            approval[field] = source[field];
        }
    }
    if (source.userIds !== undefined) {
        if (
            !Array.isArray(source.userIds) ||
            source.userIds.some((item) => typeof item !== "string")
        ) {
            throw new Error("cannot replace time-off policy: current approve.userIds is invalid");
        }
        approval.userIds = [...source.userIds];
    }
    return approval;
}

function policyAutomaticAccrual(value: unknown): ClockifyApi.AutomaticAccrualRequest {
    const source = record(value, "automaticAccrual");
    if (typeof source.amount !== "number" || !Number.isFinite(source.amount)) {
        throw new Error(
            "cannot replace time-off policy: current automaticAccrual.amount is missing or invalid",
        );
    }
    const accrual: ClockifyApi.AutomaticAccrualRequest = { amount: source.amount };
    if (source.period !== undefined) {
        if (source.period !== "MONTH" && source.period !== "YEAR") {
            throw new Error(
                "cannot replace time-off policy: current automaticAccrual.period is invalid",
            );
        }
        accrual.period = source.period;
    }
    if (source.timeUnit !== undefined) {
        if (source.timeUnit !== "DAYS" && source.timeUnit !== "HOURS") {
            throw new Error(
                "cannot replace time-off policy: current automaticAccrual.timeUnit is invalid",
            );
        }
        accrual.timeUnit = source.timeUnit;
    }
    return accrual;
}

function policyAutomaticTimeEntry(value: unknown): ClockifyApi.AutomaticTimeEntryCreationRequest {
    const source = record(value, "automaticTimeEntryCreation");
    const defaults = record(source.defaultEntities, "automaticTimeEntryCreation.defaultEntities");
    const defaultEntities: ClockifyApi.PoliciesDefaultEntitiesRequest = {};
    for (const field of ["projectId", "taskId"] as const) {
        if (defaults[field] !== undefined) {
            if (typeof defaults[field] !== "string") {
                throw new Error(
                    `cannot replace time-off policy: current automaticTimeEntryCreation.defaultEntities.${field} is invalid`,
                );
            }
            defaultEntities[field] = defaults[field];
        }
    }
    const result: ClockifyApi.AutomaticTimeEntryCreationRequest = { defaultEntities };
    if (source.enabled !== undefined) {
        if (typeof source.enabled !== "boolean") {
            throw new Error(
                "cannot replace time-off policy: current automaticTimeEntryCreation.enabled is invalid",
            );
        }
        result.enabled = source.enabled;
    }
    return result;
}

function policyNegativeBalance(value: unknown): ClockifyApi.NegativeBalanceRequest {
    const source = record(value, "negativeBalance");
    const result: ClockifyApi.NegativeBalanceRequest = {};
    if (source.amount !== undefined) {
        if (typeof source.amount !== "number" || !Number.isFinite(source.amount)) {
            throw new Error(
                "cannot replace time-off policy: current negativeBalance.amount is invalid",
            );
        }
        result.amount = source.amount;
    }
    if (source.amountValidForTimeUnit !== undefined) {
        if (typeof source.amountValidForTimeUnit !== "boolean") {
            throw new Error(
                "cannot replace time-off policy: current negativeBalance.amountValidForTimeUnit is invalid",
            );
        }
        result.amountValidForTimeUnit = source.amountValidForTimeUnit;
    }
    if (source.period !== undefined) {
        if (source.period !== "MONTH" && source.period !== "YEAR") {
            throw new Error(
                "cannot replace time-off policy: current negativeBalance.period is invalid",
            );
        }
        result.period = source.period;
    }
    if (source.shouldReset !== undefined) {
        if (typeof source.shouldReset !== "boolean") {
            throw new Error(
                "cannot replace time-off policy: current negativeBalance.shouldReset is invalid",
            );
        }
        result.shouldReset = source.shouldReset;
    }
    if (source.timeUnit !== undefined) {
        if (source.timeUnit !== "DAYS" && source.timeUnit !== "HOURS") {
            throw new Error(
                "cannot replace time-off policy: current negativeBalance.timeUnit is invalid",
            );
        }
        result.timeUnit = source.timeUnit;
    }
    return result;
}

function policyUpdateBody(value: unknown): PolicyUpdateBody {
    const current = record(value, "policy");
    if (typeof current.name !== "string" || current.name.length === 0) {
        throw new Error("cannot replace time-off policy: current name is missing or invalid");
    }
    const body: PolicyUpdateBody = {
        allowHalfDay: requiredPolicyBoolean(current, "allowHalfDay"),
        allowNegativeBalance: requiredPolicyBoolean(current, "allowNegativeBalance"),
        approve: policyApproval(current.approve),
        archived: requiredPolicyBoolean(current, "archived"),
        everyoneIncludingNew: requiredPolicyBoolean(current, "everyoneIncludingNew"),
        hasExpiration: requiredPolicyBoolean(current, "hasExpiration"),
        name: current.name,
        userGroups: policyScope(requiredPolicyStrings(current, "userGroupIds")),
        users: policyScope(requiredPolicyStrings(current, "userIds")),
    };
    if (current.automaticAccrual !== undefined) {
        body.automaticAccrual = policyAutomaticAccrual(current.automaticAccrual);
    }
    if (current.automaticTimeEntryCreation !== undefined) {
        body.automaticTimeEntryCreation = policyAutomaticTimeEntry(
            current.automaticTimeEntryCreation,
        );
    }
    if (current.color !== undefined) {
        if (typeof current.color !== "string") {
            throw new Error("cannot replace time-off policy: current color is invalid");
        }
        body.color = current.color;
    }
    if (current.icon !== undefined) {
        body.icon = policyIcon(current.icon);
    }
    if (current.negativeBalance !== undefined) {
        body.negativeBalance = policyNegativeBalance(current.negativeBalance);
    }
    return body;
}

export function registerTimeOffTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);
    const listGroups = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.userGroups.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };

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
                found = requests.find((r) => String(r.id ?? "") === args.requestId);
                if (found || requests.length < pageSize) break;
            }
            if (!found) {
                return errorResult(
                    "clockify_time_off_requests_get",
                    new Error(
                        `no time-off request with id ${JSON.stringify(args.requestId)} found in the workspace search`,
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
                const policyId = await resolvePolicyId(ctx, args.policyId);
                const period: ClockifyApi.PeriodV1Request = { start: args.start };
                if (args.end !== undefined) period.end = args.end;
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

    // ---- policies ----

    defineTool(
        server,
        "clockify_time_off_policies_list",
        {
            title: "List time-off policies",
            description: "List time-off policies in the workspace with bounded pagination.",
            inputSchema: {
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(200).default(50)).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            // The generated ListTimeOffPolicies type declares `page` as a string
            // (the GET serializes page/page-size to the query string, NOT a body
            // whitelist, so kebab `page-size` is correct and the wire form is
            // identical). Live-verified 200 honoring page-size (2026-06-18).
            const req: ClockifyApi.ListTimeOffPoliciesRequest = {
                workspaceId: ctx.workspaceId,
                page: String(args.page ?? 1),
                "page-size": args.pageSize ?? 50,
            };
            const items = await ctx.client.timeOffPolicies.list(req);
            return successResult("clockify_time_off_policies_list", items, {
                workspaceId: ctx.workspaceId,
                count: items.length,
            });
        },
    );

    defineTool(
        server,
        "clockify_time_off_policies_get",
        {
            title: "Get a time-off policy",
            description: "Fetch one time-off policy by ID from the pinned workspace.",
            inputSchema: { policyId: z.string().min(1) },
            idempotent: true,
        },
        async (args) => {
            const policy = await ctx.client.timeOffPolicies.get({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
            });
            return successResult("clockify_time_off_policies_get", policy, {
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
            });
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_policies_create",
        {
            title: "Create a time-off policy",
            description:
                "Create a new time-off policy with optional approval and balance settings.",
            inputSchema: {
                name: z.string().min(1),
                timeUnit: z.enum(["DAYS", "HOURS"]).optional(),
                negativeBalanceAllowed: z.boolean().optional(),
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Apply to these users (sent as a CONTAINS filter)."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Apply to these user groups (sent as a CONTAINS filter)."),
            },
        },
        {
            preview: async (args) => {
                let resolvedUserIds = args.userIds;
                let resolvedGroupIds = args.userGroupIds;
                if (args.userIds?.length) {
                    const r = await resolveUserRefs(args.userIds, {
                        verb: "apply the policy to",
                        meUserId: await meUserId(),
                        listUsers,
                        verifyIds: true,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_time_off_policies_create",
                            "userIds",
                            "user",
                            r.clarify,
                        );
                    resolvedUserIds = r.userIds;
                }
                if (args.userGroupIds?.length) {
                    const r = await resolveGroupRefs(args.userGroupIds, {
                        verb: "apply the policy to",
                        listGroups,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_time_off_policies_create",
                            "userGroupIds",
                            "group",
                            r.clarify,
                        );
                    resolvedGroupIds = r.groupIds;
                }
                const request: ClockifyApi.CreateTimeOffPolicyRequest = {
                    name: args.name,
                    workspaceId: ctx.workspaceId,
                };
                if (args.timeUnit !== undefined) request.timeUnit = args.timeUnit;
                if (args.negativeBalanceAllowed !== undefined)
                    request.allowNegativeBalance = args.negativeBalanceAllowed;
                if (resolvedUserIds !== undefined) request.users = policyScope(resolvedUserIds);
                if (resolvedGroupIds !== undefined)
                    request.userGroups = policyScope(resolvedGroupIds);
                return {
                    action: "create",
                    entity: "time_off_policy",
                    name: args.name,
                    request,
                };
            },
            execute: async (preview) => {
                const created = await ctx.client.timeOffPolicies.create(preview.request);
                return successResult(
                    "clockify_time_off_policies_create",
                    created,
                    { workspaceId: preview.request.workspaceId },
                    writeReceipt("created", "time_off_policy", {
                        id: entityId(created),
                        name: preview.name,
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_policies_update",
        {
            title: "Update a time-off policy",
            description:
                "Update one time-off policy by ID. Reads the policy then replaces it (PUT semantics), preserving untouched fields and the user/group scope.",
            inputSchema: {
                policyId: z.string().min(1),
                name: z.string().min(1).optional(),
                negativeBalanceAllowed: z.boolean().optional(),
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the scope with these users."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the scope with these user groups."),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                // Resolve the EXPLICIT replacement scope before reconstructing
                // the replacement request. Stored execution does no resolution.
                let resolvedUserIds = args.userIds;
                let resolvedGroupIds = args.userGroupIds;
                if (args.userIds?.length) {
                    const r = await resolveUserRefs(args.userIds, {
                        verb: "apply the policy to",
                        meUserId: await meUserId(),
                        listUsers,
                        verifyIds: true,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_time_off_policies_update",
                            "userIds",
                            "user",
                            r.clarify,
                        );
                    resolvedUserIds = r.userIds;
                }
                if (args.userGroupIds?.length) {
                    const r = await resolveGroupRefs(args.userGroupIds, {
                        verb: "apply the policy to",
                        listGroups,
                    });
                    if (!r.ok)
                        return clarifyResult(
                            "clockify_time_off_policies_update",
                            "userGroupIds",
                            "group",
                            r.clarify,
                        );
                    resolvedGroupIds = r.groupIds;
                }
                const getRequest = {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                } satisfies ClockifyApi.GetTimeOffPoliciesRequest;
                const existing = await ctx.client.timeOffPolicies.get(getRequest);
                const currentBody = policyUpdateBody(existing);
                const body = policyUpdateBody(existing);
                if (args.name !== undefined) body.name = args.name;
                if (args.negativeBalanceAllowed !== undefined)
                    body.allowNegativeBalance = args.negativeBalanceAllowed;
                if (resolvedUserIds !== undefined) body.users = policyScope(resolvedUserIds);
                if (resolvedGroupIds !== undefined) body.userGroups = policyScope(resolvedGroupIds);
                if (JSON.stringify(body) === JSON.stringify(currentBody)) {
                    throw new Error("time-off policy update has no changes");
                }
                return {
                    action: "update",
                    entity: "time_off_policy",
                    id: args.policyId,
                    request: {
                        ...body,
                        workspaceId: ctx.workspaceId,
                        policyId: args.policyId,
                    } satisfies ClockifyApi.UpdateTimeOffPoliciesRequest,
                };
            },
            execute: async (preview) => {
                const updated = await ctx.client.timeOffPolicies.update(preview.request);
                return successResult(
                    "clockify_time_off_policies_update",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.id,
                    },
                    writeReceipt("updated", "time_off_policy", preview.id),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_time_off_policies_archive",
        {
            title: "Archive or reactivate a time-off policy",
            description: "Toggle the archived state of a time-off policy.",
            inputSchema: {
                policyId: z.string().min(1),
                archived: z.boolean(),
            },
            idempotent: true,
        },
        {
            preview: (args) => ({
                action: args.archived ? "archive" : "reactivate",
                entity: "time_off_policy",
                id: args.policyId,
                request: {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                    body: { status: args.archived ? "ARCHIVED" : "ACTIVE" },
                } satisfies ClockifyApi.UpdateStatusTimeOffPoliciesRequest,
            }),
            execute: async (preview) => {
                const updated = await ctx.client.timeOffPolicies.updateStatus(preview.request);
                return successResult(
                    "clockify_time_off_policies_archive",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        policyId: preview.id,
                    },
                    writeReceipt("updated", "time_off_policy", preview.id),
                );
            },
        },
    );

    // ---- balances ----

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
}
