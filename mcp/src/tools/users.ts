/**
 * Workspace user listing, member profiles, and manager-role grants. The
 * role writes are privileged — they change a user's workspace permissions —
 * so their descriptions say so plainly.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toMinor } from "clockify-sdk-ts-115/money";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { resolveUserRef } from "clockify-sdk-ts-115/resolve";
import { z } from "zod";

import { zNumberLike } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineGuardedTool, defineTool, successResult, writeReceipt } from "../result.js";

import { clarifyResult } from "./resolve-clarify.js";
import { userRefHelpers } from "./user-refs.js";

const WORKSPACE_ROLES = ["WORKSPACE_ADMIN", "TEAM_MANAGER", "PROJECT_MANAGER"] as const;
const USER_DAYS = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
] as const satisfies readonly ClockifyApi.UsersDayOfWeek[];
type MissingUserDay = Exclude<ClockifyApi.UsersDayOfWeek, (typeof USER_DAYS)[number]>;
const userDaysExhaustive: MissingUserDay extends never ? true : false = true;
void userDaysExhaustive;

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
    const { listUsers, meUserId } = userRefHelpers(ctx);

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
            idempotent: true,
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
            idempotent: true,
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

    defineGuardedTool(
        server,
        ctx,
        "clockify_users_grant_role",
        {
            title: "Grant a workspace role",
            description:
                "Grants a workspace role (admin, team manager, project manager) to a user — privileged.",
            inputSchema: roleInput,
        },
        {
            preview: async (args) => {
                const user = await resolveUserRef(
                    { id: args.userId },
                    {
                        verb: "grant the role to",
                        meUserId: await meUserId(),
                        listUsers,
                        trustIds: false,
                    },
                );
                if (!user.ok) {
                    return clarifyResult(
                        "clockify_users_grant_role",
                        "userId",
                        "user",
                        user.clarify,
                    );
                }
                return {
                    request: {
                        workspaceId: ctx.workspaceId,
                        userId: user.userId,
                        role: args.role,
                        entityId: args.entityId,
                        ...(args.sourceType ? { sourceType: args.sourceType } : {}),
                    },
                };
            },
            execute: async (preview) => {
                const assignments = await ctx.client.users.giveRole(preview.request);
                return successResult("clockify_users_grant_role", assignments, {
                    workspaceId: preview.request.workspaceId,
                    userId: preview.request.userId,
                });
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_users_revoke_role",
        {
            title: "Revoke a workspace role",
            description:
                "Revokes a workspace role (admin, team manager, project manager) from a user — privileged.",
            inputSchema: roleInput,
        },
        {
            preview: async (args) => {
                const user = await resolveUserRef(
                    { id: args.userId },
                    {
                        verb: "revoke the role from",
                        meUserId: await meUserId(),
                        listUsers,
                        trustIds: false,
                    },
                );
                if (!user.ok) {
                    return clarifyResult(
                        "clockify_users_revoke_role",
                        "userId",
                        "user",
                        user.clarify,
                    );
                }
                return {
                    request: {
                        workspaceId: ctx.workspaceId,
                        userId: user.userId,
                        role: args.role,
                        entityId: args.entityId,
                        ...(args.sourceType ? { sourceType: args.sourceType } : {}),
                    },
                };
            },
            execute: async (preview) => {
                await ctx.client.users.removeRole(preview.request);
                return successResult(
                    "clockify_users_revoke_role",
                    {
                        revoked: true,
                        userId: preview.request.userId,
                        role: preview.request.role,
                    },
                    {
                        workspaceId: preview.request.workspaceId,
                        userId: preview.request.userId,
                    },
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
        "clockify_users_set_status",
        {
            title: "Set workspace user status",
            description:
                "Activate or deactivate a verified workspace member. This privileged write requires a preview token; use clockify_users_list to re-check membership state when needed.",
            inputSchema: {
                userId: z
                    .string()
                    .min(1)
                    .describe("User id (24-hex), exact name, or email."),
                status: z.enum(["ACTIVE", "INACTIVE"]),
            },
            idempotent: true,
        },
        {
            preview: async (args) => {
                const userQuery = args.userId.trim().toLowerCase();
                const currentUserId = await meUserId();
                const user = await resolveUserRef(
                    { id: args.userId },
                    {
                        verb: "set the status of",
                        meUserId: currentUserId,
                        listUsers: async () =>
                            (await listUsers()).map((candidate) =>
                                candidate.email?.trim().toLowerCase() === userQuery
                                    ? { ...candidate, name: candidate.email }
                                    : candidate,
                            ),
                        trustIds: false,
                    },
                );
                if (!user.ok) {
                    return clarifyResult(
                        "clockify_users_set_status",
                        "userId",
                        "user",
                        user.clarify,
                    );
                }
                if (args.status === "INACTIVE" && user.userId === currentUserId) {
                    throw new Error("You must not deactivate the current user.");
                }
                const request = {
                    workspaceId: ctx.workspaceId,
                    userId: user.userId,
                    status: args.status,
                } satisfies ClockifyApi.UpdateUserStatusWorkspacesRequest;
                return {
                    action: "update" as const,
                    entity: "workspace_member" as const,
                    id: user.userId,
                    request,
                    statusIntent:
                        args.status === "ACTIVE"
                            ? "Activate this workspace member."
                            : "Deactivate this workspace member.",
                };
            },
            execute: async (preview) => {
                const workspace = await ctx.client.workspaces.updateUserStatus(preview.request);
                return successResult(
                    "clockify_users_set_status",
                    workspace,
                    {
                        workspaceId: preview.request.workspaceId,
                        userId: preview.request.userId,
                        status: preview.request.status,
                    },
                    writeReceipt("updated", "workspace_member", preview.request.userId, {
                        ids: {
                            workspaceId: preview.request.workspaceId,
                            userId: preview.request.userId,
                        },
                    }),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
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
                amount: zNumberLike(z.number()).describe(
                    "Rate in major units, e.g. 75 for $75/hr.",
                ),
                since: z.string().optional().describe("Effective-from date (ISO)."),
            },
            idempotent: true,
        },
        {
            preview: (args) => {
                const amountMinor = toMinor(args.amount, "major");
                const request = {
                    workspaceId: ctx.workspaceId,
                    userId: args.userId,
                    amount: amountMinor,
                    ...(args.since ? { since: args.since } : {}),
                };
                return {
                    rateKind: args.rateKind,
                    amountMajor: args.amount,
                    amountMinor,
                    request,
                };
            },
            execute: async (preview) => {
                const updated =
                    preview.rateKind === "COST"
                        ? await ctx.client.workspaces.updateUserCostRate(
                              preview.request satisfies ClockifyApi.UpdateUserCostRateWorkspacesRequest,
                          )
                        : await ctx.client.workspaces.updateUserHourlyRate(
                              preview.request satisfies ClockifyApi.UpdateUserHourlyRateWorkspacesRequest,
                          );
                return successResult(
                    "clockify_users_set_member_rate",
                    updated,
                    {
                        workspaceId: preview.request.workspaceId,
                        userId: preview.request.userId,
                        rateKind: preview.rateKind,
                        amountMajor: preview.amountMajor,
                        amountMinor: preview.amountMinor,
                    },
                    writeReceipt("updated", "workspace_member", preview.request.userId),
                );
            },
        },
    );

    defineGuardedTool(
        server,
        ctx,
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
        },
        {
            preview: (args) => ({
                email: args.email,
                request: {
                    workspaceId: ctx.workspaceId,
                    "send-email": (args.sendEmail ?? true) ? ("true" as const) : ("false" as const),
                    email: args.email,
                },
            }),
            execute: async (preview) => {
                const workspace = await ctx.client.workspaces.addUser(preview.request);
                return successResult(
                    "clockify_users_invite",
                    workspace,
                    { workspaceId: preview.request.workspaceId },
                    writeReceipt("created", "workspace_member", { name: preview.email }),
                );
            },
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
                weekStart: z.enum(USER_DAYS).optional().describe("Week start day, e.g. MONDAY."),
                workCapacity: z.string().optional().describe("ISO-8601 duration, e.g. PT8H."),
                workingDays: z
                    .array(z.enum(USER_DAYS))
                    .optional()
                    .describe("Day enum strings, e.g. [MONDAY, TUESDAY]."),
            },
            idempotent: true,
        },
        async (args) => {
            const body: ClockifyRequestBody<ClockifyApi.UpdateMemberProfilesRequest> = {};
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
