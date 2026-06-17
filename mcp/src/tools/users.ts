/**
 * Workspace user listing, member profiles, and manager-role grants. The
 * role writes are privileged — they change a user's workspace permissions —
 * so their descriptions say so plainly.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import { resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";

const WORKSPACE_ROLES = ["WORKSPACE_ADMIN", "TEAM_MANAGER", "PROJECT_MANAGER"] as const;

const roleInput = {
    userId: z.string().min(1),
    role: z.enum(WORKSPACE_ROLES),
    entityId: z.string().min(1).describe("Entity the role scopes to: the workspace, project, or group id."),
    sourceType: z.enum(["USER_GROUP"]).optional(),
};

export function registerUsersTools(server: McpServer, ctx: Context): void {
    const listUsers = async (): Promise<Array<{ id: string; name: string }>> => {
        const rows = (await ctx.client.users.list({
            workspaceId: ctx.workspaceId,
            page: 1,
            "page-size": 200,
            "include-roles": false,
        })) as Array<{ id?: string; name?: string }>;
        return rows.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
    };
    const meUserId = async (): Promise<string> =>
        String(((await ctx.client.users.getCurrentUser()) as { id?: string }).id ?? "");

    server.registerTool(
        "clockify_users_list",
        {
            title: "List workspace users",
            description: "List users in the pinned workspace, paginated via page and pageSize.",
            inputSchema: {
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
                includeRoles: z.boolean().default(false).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const users = (await ctx.client.users.list({
                    workspaceId: ctx.workspaceId,
                    page: args.page ?? 1,
                    "page-size": args.pageSize ?? 50,
                    "include-roles": args.includeRoles ?? false,
                })) as unknown[];
                return successResult("clockify_users_list", users, {
                    workspaceId: ctx.workspaceId,
                    count: users.length,
                    page: args.page ?? 1,
                    pageSize: args.pageSize ?? 50,
                });
            } catch (err) {
                return errorResult("clockify_users_list", err);
            }
        },
    );

    server.registerTool(
        "clockify_member_profile_get",
        {
            title: "Get a member profile",
            description: "Fetch one user's member profile (week start, work capacity, working days) by user ID.",
            inputSchema: { userId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const profile = await ctx.client.memberProfiles.get({
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                });
                return successResult("clockify_member_profile_get", profile, {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                });
            } catch (err) {
                return errorResult("clockify_member_profile_get", err);
            }
        },
    );

    // Role grant/revoke skip the dry_run→confirm_token guard used for deletes:
    // both resolve the target user with trustIds:false (an ambiguous/unknown
    // name yields a grounded clarification, never a guessed id) and each is
    // reversible via its sibling tool. Guarding them would expand the
    // write-safety contract; revisit only if an unclarified id path is added.
    server.registerTool(
        "clockify_users_grant_role",
        {
            title: "Grant a workspace role",
            description: "Grants a workspace role (admin, team manager, project manager) to a user — privileged.",
            inputSchema: roleInput,
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const u = await resolveUserRef(
                    { id: args.userId },
                    { verb: "grant the role to", meUserId: await meUserId(), listUsers, trustIds: false },
                );
                if (!u.ok) return clarifyResult("clockify_users_grant_role", "userId", "user", u.clarify);
                const assignments = await ctx.client.users.giveRole({
                    workspaceId: ctx.workspaceId,
                    userId: u.userId,
                    role: args.role,
                    entityId: args.entityId,
                    ...(args.sourceType ? { sourceType: args.sourceType } : {}),
                });
                return successResult("clockify_users_grant_role", assignments, {
                    workspaceId: ctx.workspaceId,
                    userId: u.userId,
                });
            } catch (err) {
                return errorResult("clockify_users_grant_role", err);
            }
        },
    );

    server.registerTool(
        "clockify_users_revoke_role",
        {
            title: "Revoke a workspace role",
            description: "Revokes a workspace role (admin, team manager, project manager) from a user — privileged.",
            inputSchema: roleInput,
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            try {
                const u = await resolveUserRef(
                    { id: args.userId },
                    { verb: "revoke the role from", meUserId: await meUserId(), listUsers, trustIds: false },
                );
                if (!u.ok) return clarifyResult("clockify_users_revoke_role", "userId", "user", u.clarify);
                await ctx.client.users.removeRole({
                    workspaceId: ctx.workspaceId,
                    userId: u.userId,
                    role: args.role,
                    entityId: args.entityId,
                    ...(args.sourceType ? { sourceType: args.sourceType } : {}),
                });
                return successResult(
                    "clockify_users_revoke_role",
                    { revoked: true, userId: u.userId, role: args.role },
                    { workspaceId: ctx.workspaceId, userId: u.userId },
                );
            } catch (err) {
                return errorResult("clockify_users_revoke_role", err);
            }
        },
    );

    server.registerTool(
        "clockify_users_set_member_rate",
        {
            title: "Set a workspace member's rate",
            description:
                "Set a user's workspace-level hourly (billable) or cost rate — the Team-section rate that applies across the workspace. Amount is in MAJOR units (e.g. 75 = $75.00); Clockify stores integer minor units.",
            inputSchema: {
                userId: z.string().min(1),
                rateKind: z.enum(["HOURLY", "COST"]).describe("HOURLY = billable rate; COST = internal cost rate."),
                amount: z.number().describe("Rate in major units, e.g. 75 for $75/hr."),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            try {
                const amountMinor = toMinor(args.amount, "major");
                const req: Record<string, unknown> = {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                    amount: amountMinor,
                };
                if (args.since) req.since = args.since;
                const updated =
                    args.rateKind === "COST"
                        ? await ctx.client.workspaces.updateUserCostRate(req as never)
                        : await ctx.client.workspaces.updateUserHourlyRate(req as never);
                return successResult("clockify_users_set_member_rate", updated, {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                    rateKind: args.rateKind,
                    amountMajor: args.amount,
                    amountMinor,
                });
            } catch (err) {
                return errorResult("clockify_users_set_member_rate", err);
            }
        },
    );
}
