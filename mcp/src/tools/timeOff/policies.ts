/**
 * Time-off policy tools — the rules that requests and balances hang off.
 * Wraps `client.timeOffPolicies.{list, get, create, update, updateStatus}`.
 *
 * The update path is a read-then-replace: PUT replaces the whole policy, so
 * the module rebuilds a complete body from the current policy and applies the
 * caller's patch on top. The `policy*` helpers below do that reconstruction
 * and reject a current policy the API cannot round-trip.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveGroupRefs, resolveUserRefs } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike, zStringList } from "../../arg-shapes.js";
import type { Context } from "../../client.js";
import { defineGuardedTool, defineTool, entityId, successResult, writeReceipt } from "../../result.js";
import { clarifyResult } from "../resolve-clarify.js";
import { listGroupRefs, userRefHelpers } from "../user-refs.js";

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

export function registerTimeOffPoliciesTools(server: McpServer, ctx: Context): void {
    const { listUsers, meUserId } = userRefHelpers(ctx);
    const listGroups = () => listGroupRefs(ctx);

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
                requiresApproval: z
                    .boolean()
                    .default(false)
                    .describe("Whether time-off requests under this policy need approval."),
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
                // `approve` is wire-required: omitting it returns 400 "must not
                // be null" regardless of how the assignees are shaped.
                const request: ClockifyApi.CreateTimeOffPolicyRequest = {
                    name: args.name,
                    workspaceId: ctx.workspaceId,
                    approve: { requiresApproval: args.requiresApproval },
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
                    throw new Error("time-off policy update has no changes; provide a changed field.");
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
}
