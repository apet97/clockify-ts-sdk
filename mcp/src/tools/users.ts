/**
 * Workspace user listing, member profiles, and manager-role grants. The
 * role writes are privileged — they change a user's workspace permissions —
 * so their descriptions say so plainly.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineTool, entityId, successResult, writeReceipt } from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";

const WORKSPACE_ROLES = ["WORKSPACE_ADMIN", "TEAM_MANAGER", "PROJECT_MANAGER"] as const;

const roleInput = {
    userId: z.string().min(1),
    role: z.enum(WORKSPACE_ROLES),
    entityId: z
        .string()
        .min(1)
        .describe("Entity the role scopes to: the workspace, project, or group id."),
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
        entityId(await ctx.client.users.getCurrentUser()) ?? "";

    defineTool(
        server,
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
        },
    );

    defineTool(
        server,
        "clockify_member_profile_get",
        {
            title: "Get a member profile",
            description:
                "Fetch one user's member profile (week start, work capacity, working days) by user ID.",
            inputSchema: { userId: z.string().min(1) },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            const profile = await ctx.client.memberProfiles.get({
                workspaceId: ctx.workspaceId,
                userId: args.userId,
            });
            return successResult("clockify_member_profile_get", profile, {
                workspaceId: ctx.workspaceId,
                userId: args.userId,
            });
        },
    );

    // Role grant/revoke skip the dry_run→confirm_token guard used for deletes:
    // both resolve the target user with trustIds:false (an ambiguous/unknown
    // name yields a grounded clarification, never a guessed id) and each is
    // reversible via its sibling tool. Guarding them would expand the
    // write-safety contract; revisit only if an unclarified id path is added.
    defineTool(
        server,
        "clockify_users_grant_role",
        {
            title: "Grant a workspace role",
            description:
                "Grants a workspace role (admin, team manager, project manager) to a user — privileged.",
            inputSchema: roleInput,
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const u = await resolveUserRef(
                { id: args.userId },
                {
                    verb: "grant the role to",
                    meUserId: await meUserId(),
                    listUsers,
                    trustIds: false,
                },
            );
            if (!u.ok)
                return clarifyResult("clockify_users_grant_role", "userId", "user", u.clarify);
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
        },
    );

    defineTool(
        server,
        "clockify_users_revoke_role",
        {
            title: "Revoke a workspace role",
            description:
                "Revokes a workspace role (admin, team manager, project manager) from a user — privileged.",
            inputSchema: roleInput,
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const u = await resolveUserRef(
                { id: args.userId },
                {
                    verb: "revoke the role from",
                    meUserId: await meUserId(),
                    listUsers,
                    trustIds: false,
                },
            );
            if (!u.ok)
                return clarifyResult("clockify_users_revoke_role", "userId", "user", u.clarify);
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
        },
    );

    defineTool(
        server,
        "clockify_users_set_member_rate",
        {
            title: "Set a workspace member's rate",
            description:
                "Set a user's workspace-level hourly (billable) or cost rate — the Team-section rate that applies across the workspace. Amount is in MAJOR units (e.g. 75 = $75.00); Clockify stores integer minor units.",
            inputSchema: {
                userId: z.string().min(1),
                rateKind: z
                    .enum(["HOURLY", "COST"])
                    .describe("HOURLY = billable rate; COST = internal cost rate."),
                amount: z.number().describe("Rate in major units, e.g. 75 for $75/hr."),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const amountMinor = toMinor(args.amount, "major");
            const req: Record<string, unknown> = {
                workspaceId: ctx.workspaceId,
                userId: args.userId,
                amount: amountMinor,
            };
            if (args.since) req.since = args.since;
            const updated =
                args.rateKind === "COST"
                    ? await ctx.client.workspaces.updateUserCostRate(
                          wireBody<ClockifyApi.UpdateUserCostRateWorkspacesRequest>(req),
                      )
                    : await ctx.client.workspaces.updateUserHourlyRate(
                          wireBody<ClockifyApi.UpdateUserHourlyRateWorkspacesRequest>(req),
                      );
            return successResult("clockify_users_set_member_rate", updated, {
                workspaceId: ctx.workspaceId,
                userId: args.userId,
                rateKind: args.rateKind,
                amountMajor: args.amount,
                amountMinor,
            });
        },
    );

    defineTool(
        server,
        "clockify_users_invite",
        {
            title: "Invite a user to the workspace",
            description:
                "Add (invite) a user to the pinned workspace by email; optionally send them the invitation email.",
            inputSchema: {
                email: z.string().min(1),
                sendEmail: z
                    .boolean()
                    .default(true)
                    .optional()
                    .describe("Send the invitation email (default true)."),
            },
            annotations: { readOnlyHint: false, idempotentHint: false },
        },
        async (args) => {
            const workspace = await ctx.client.workspaces.addUser({
                workspaceId: ctx.workspaceId,
                "send-email": (args.sendEmail ?? true) ? "true" : "false",
                email: args.email,
                // KEEP as never: invite query/body split is generated too narrowly.
            } as never);
            return successResult(
                "clockify_users_invite",
                workspace,
                { workspaceId: ctx.workspaceId },
                writeReceipt("created", "workspace_member", { name: args.email }),
            );
        },
    );

    defineTool(
        server,
        "clockify_member_profile_update",
        {
            title: "Update a member profile",
            description:
                "Update one user's member profile (name, image, week start, work capacity, working days) by user ID.",
            inputSchema: {
                userId: z.string().min(1),
                name: z.string().optional(),
                imageUrl: z.string().optional(),
                removeProfileImage: z.boolean().optional(),
                weekStart: z.string().optional().describe("Week start day, e.g. MONDAY."),
                workCapacity: z.string().optional().describe("ISO-8601 duration, e.g. PT8H."),
                workingDays: z
                    .array(z.string())
                    .optional()
                    .describe("Day enum strings, e.g. [MONDAY, TUESDAY]."),
            },
            annotations: { readOnlyHint: false, idempotentHint: true },
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.PutWorkspacesWorkspaceIdMemberProfileUserIdUsersRequest> =
                {};
            if (args.name !== undefined) body.name = args.name;
            if (args.imageUrl !== undefined) body.imageUrl = args.imageUrl;
            if (args.removeProfileImage !== undefined)
                body.removeProfileImage = args.removeProfileImage;
            if (args.weekStart !== undefined) body.weekStart = args.weekStart;
            if (args.workCapacity !== undefined) body.workCapacity = args.workCapacity;
            if (args.workingDays !== undefined) body.workingDays = args.workingDays;
            const updated = await ctx.client.memberProfiles.update({
                workspaceId: ctx.workspaceId,
                userId: args.userId,
                body,
            });
            return successResult(
                "clockify_member_profile_update",
                updated,
                { workspaceId: ctx.workspaceId, userId: args.userId },
                writeReceipt("updated", "member_profile", args.userId),
            );
        },
    );
}
