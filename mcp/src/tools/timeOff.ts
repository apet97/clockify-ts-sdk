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
import { requireConfirmation } from "../orchestration/confirm-guard.js";
import { defineTool, entityId, errorResult, successResult, writeReceipt } from "../result.js";
import { scopeFilter } from "../scope-filter.js";

import { clarifyResult } from "./resolve-clarify.js";

// The POST-search `statuses` filter accepts only [ALL, PENDING, APPROVED,
// REJECTED]. It 400s on WITHDRAWN (code 501, live-verified 2026-06-15; see
// discrepancies.md `time-off.requests.get.dead-route`). WITHDRAWN is a
// per-request response status, not a valid search filter.
const REQUEST_SEARCH_STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

// Policy fields the generated PUT accepts and we carry forward from the GET on a
// replace-style update (everything except the users/userGroups scope, which is
// reconstructed from the flat GET via scopeFilter).
const POLICY_CARRY_FIELDS = [
    "allowHalfDay",
    "allowNegativeBalance",
    "approve",
    "archived",
    "automaticAccrual",
    "automaticTimeEntryCreation",
    "color",
    "everyoneIncludingNew",
    "hasExpiration",
    "icon",
    "name",
    "negativeBalance",
] as const;
type TimeOffPolicyObject = Record<string, unknown>;

export function registerTimeOffTools(server: McpServer, ctx: Context): void {
    const listUsers = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.users.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            "include-roles": false,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };
    const listGroups = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.userGroups.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };
    const meUserId = async (): Promise<string> =>
        entityId(await ctx.client.users.getCurrentUser()) ?? "";

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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
                const res = (await ctx.client.timeOff.list({
                    workspaceId: ctx.workspaceId,
                    page,
                    pageSize,
                    statuses: ["ALL"],
                    // KEEP as never: request search route uses live envelope shape.
                } as never)) as { requests?: Array<{ id?: string }> } | Array<{ id?: string }>;
                const requests = Array.isArray(res) ? res : (res.requests ?? []);
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

    defineTool(
        server,
        "clockify_time_off_requests_submit",
        {
            title: "Submit a time-off request",
            description: "Submit a time-off request against a policy.",
            inputSchema: {
                policyId: z.string().min(1),
                start: z.string().min(1),
                end: z.string().min(1),
                days: zNumberLike(z.number().int()).optional(),
                note: z.string().optional(),
                isHalfDay: z.boolean().optional(),
                halfDayPeriod: z
                    .string()
                    .optional()
                    .describe("FIRST_HALF | SECOND_HALF | NOT_DEFINED."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const period: ClockifyApi.PeriodV1Request = { start: args.start, end: args.end };
            if (args.days !== undefined) period.days = args.days;
            const body: ClockifyRequestBody<ClockifyApi.SubmitTimeOffRequest> = {
                note: args.note ?? "",
                timeOffPeriod: {
                    isHalfDay: args.isHalfDay === true,
                    halfDayPeriod: (args.halfDayPeriod ??
                        "NOT_DEFINED") as ClockifyApi.HalfDayPeriod,
                    period,
                },
            };
            const req: ClockifyApi.SubmitTimeOffRequest = {
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                body,
            };
            const created = await ctx.client.timeOff.submit(req);
            return successResult(
                "clockify_time_off_requests_submit",
                created,
                {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                },
                writeReceipt("created", "time_off_request", { id: entityId(created) }),
            );
        },
    );

    defineTool(
        server,
        "clockify_time_off_requests_update_status",
        {
            title: "Update a time-off request status",
            description:
                "Approve, reject, or change the status of a time-off request. Requires policyId — the status endpoint is policy-scoped.",
            inputSchema: {
                policyId: z.string().min(1),
                requestId: z.string().min(1),
                // The wire `status` target accepts only APPROVED / REJECTED;
                // PENDING and WITHDRAWN are read-only request states it rejects
                // (live-verified 2026-06-18).
                statusType: z.enum(["APPROVED", "REJECTED"]),
                note: z.string().optional(),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            // The live status endpoint is PATCH
            // /time-off/policies/{policyId}/requests/{requestId} and the WIRE
            // field is `status` (`statusType` only appears in responses). The
            // flat /requests/{id}/status route 404s, so use
            // changeTimeOffRequestStatus, not updateStatus.
            const req: Partial<
                ClockifyRequestBody<ClockifyApi.ChangeTimeOffRequestStatusTimeOffRequest>
            > &
                Pick<
                    ClockifyRequestBody<ClockifyApi.ChangeTimeOffRequestStatusTimeOffRequest>,
                    "status"
                > & {
                    workspaceId: string;
                    policyId: string;
                    requestId: string;
                } = {
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                requestId: args.requestId,
                status: args.statusType,
            };
            if (args.note) req.note = args.note;
            // The generated ChangeTimeOffRequestStatus type marks `note` required,
            // but it is only set when args.note is present. The note-required
            // branch is probe-deferred (creating a PENDING request to PATCH is a
            // risky multi-step sandbox mutation), so leave note conditional.
            // See discrepancies.md (time-off.change-status.union-and-note).
            // KEEP as never: ChangeTimeOffRequestStatus has a generated status/note mismatch.
            const updated = await ctx.client.timeOff.changeTimeOffRequestStatus(req as never);
            return successResult(
                "clockify_time_off_requests_update_status",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                    requestId: args.requestId,
                },
                writeReceipt("updated", "time_off_request", args.requestId),
            );
        },
    );

    defineTool(
        server,
        "clockify_time_off_requests_delete",
        {
            title: "Delete a time-off request",
            description:
                "Permanently delete one time-off request by ID. Run dry_run first, then retry with the returned confirm_token.",
            inputSchema: {
                requestId: z.string().min(1),
                dry_run: z.boolean().optional(),
                confirm_token: z.string().optional(),
            },
            annotations: { destructiveHint: true },
        },
        async (args) => {
            const preview = { action: "delete", entity: "time_off_request", id: args.requestId };
            const confirmation = requireConfirmation(
                ctx,
                "clockify_time_off_requests_delete",
                "time_off_request_delete",
                args,
                preview,
            );
            if (confirmation) return confirmation;
            await ctx.client.timeOff.delete({
                workspaceId: ctx.workspaceId,
                requestId: args.requestId,
            });
            return successResult(
                "clockify_time_off_requests_delete",
                { deleted: true, requestId: args.requestId },
                { workspaceId: ctx.workspaceId, requestId: args.requestId },
                writeReceipt("deleted", "time_off_request", args.requestId),
            );
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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

    defineTool(
        server,
        "clockify_time_off_policies_create",
        {
            title: "Create a time-off policy",
            description:
                "Create a new time-off policy with optional approval and balance settings.",
            inputSchema: {
                name: z.string().min(1),
                timeUnit: z.string().optional().describe("DAYS | HOURS."),
                negativeBalanceAllowed: z.boolean().optional(),
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Apply to these users (sent as a CONTAINS filter)."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Apply to these user groups (sent as a CONTAINS filter)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
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
            // The generated create reads the policy fields FLAT off the request
            // (not a nested `body`), so spread them; a nested body is silently
            // dropped.
            const body: Partial<ClockifyRequestBody<ClockifyApi.CreateTimeOffPolicyRequest>> &
                Pick<ClockifyRequestBody<ClockifyApi.CreateTimeOffPolicyRequest>, "name"> = {
                name: args.name,
            };
            if (args.timeUnit) body.timeUnit = args.timeUnit as "DAYS" | "HOURS";
            if (args.negativeBalanceAllowed !== undefined)
                body.allowNegativeBalance = args.negativeBalanceAllowed;
            if (resolvedUserIds?.length) body.users = scopeFilter(resolvedUserIds, "ACTIVE");
            if (resolvedGroupIds?.length) body.userGroups = scopeFilter(resolvedGroupIds, "ACTIVE");
            const created = await ctx.client.timeOffPolicies.create({
                workspaceId: ctx.workspaceId,
                ...body,
                // KEEP as never: policy create reads fields flat, not via generated body envelope.
            } as never);
            return successResult(
                "clockify_time_off_policies_create",
                created,
                {
                    workspaceId: ctx.workspaceId,
                },
                writeReceipt("created", "time_off_policy", {
                    id: entityId(created),
                    name: args.name,
                }),
            );
        },
    );

    defineTool(
        server,
        "clockify_time_off_policies_update",
        {
            title: "Update a time-off policy",
            description:
                "Update one time-off policy by ID. Reads the policy then replaces it (PUT semantics), preserving untouched fields and the user/group scope.",
            inputSchema: {
                policyId: z.string().min(1),
                name: z.string().optional(),
                negativeBalanceAllowed: z.boolean().optional(),
                userIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the scope with these users."),
                userGroupIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Replace the scope with these user groups."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            // Resolve the EXPLICIT replacement scope (a name in an id slot) before
            // reconstructing scope; carried-forward existing ids are not re-resolved.
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
            // PUT /time-off/policies/{id} REPLACES the policy, the generated
            // method reads body fields FLAT (a nested `body` is dropped), and the
            // GET echoes the scope FLAT as userIds/userGroupIds. So read the
            // policy, carry forward its editable fields, overlay the patch, and
            // reconstruct the scope into the {contains,ids,status} filter form.
            const existing = (await ctx.client.timeOffPolicies.get({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
            })) as TimeOffPolicyObject;
            const body: TimeOffPolicyObject = {};
            for (const k of POLICY_CARRY_FIELDS) {
                if (existing[k] !== undefined) body[k] = existing[k];
            }
            if (args.name) body.name = args.name;
            if (args.negativeBalanceAllowed !== undefined)
                body.allowNegativeBalance = args.negativeBalanceAllowed;
            const existingUserIds = Array.isArray(existing.userIds)
                ? (existing.userIds as string[])
                : [];
            const existingGroupIds = Array.isArray(existing.userGroupIds)
                ? (existing.userGroupIds as string[])
                : [];
            if (resolvedUserIds?.length) body.users = scopeFilter(resolvedUserIds, "ACTIVE");
            else if (existingUserIds.length) body.users = scopeFilter(existingUserIds, "ACTIVE");
            if (resolvedGroupIds?.length) body.userGroups = scopeFilter(resolvedGroupIds, "ACTIVE");
            else if (existingGroupIds.length)
                body.userGroups = scopeFilter(existingGroupIds, "ACTIVE");
            const updated = await ctx.client.timeOffPolicies.update({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                ...body,
                // KEEP as never: policy replace carries forward live fields and reconstructed scope filters.
            } as never);
            return successResult(
                "clockify_time_off_policies_update",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                },
                writeReceipt("updated", "time_off_policy", args.policyId),
            );
        },
    );

    defineTool(
        server,
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
            const updated = await ctx.client.timeOffPolicies.updateStatus({
                workspaceId: ctx.workspaceId,
                policyId: args.policyId,
                body: { archived: args.archived },
                // KEEP as never: policy archive uses live archived body despite generated status naming.
            } as never);
            return successResult(
                "clockify_time_off_policies_archive",
                updated,
                {
                    workspaceId: ctx.workspaceId,
                    policyId: args.policyId,
                },
                writeReceipt("updated", "time_off_policy", args.policyId),
            );
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
            annotations: { readOnlyHint: true, idempotentHint: true },
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
