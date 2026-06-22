/**
 * `clk115 users {me,list,invite,update-profile}`. `me` resolves the API-key
 * owner (`GET /user`, no workspace needed); `list` pages the workspace
 * members — both read-only (no receipt). `invite` adds a user to the
 * workspace and `update-profile` patches a member profile — both writes
 * (receipt-shaped). The member-profile write stays under `users` (no new
 * top-level command group).
 */
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";
import { printReceipt } from "../receipt.js";

import { clampPageSize, parseIntArg, resolveBaseContext, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerUsersCommand: Registrar = (program, services) => {
    const users = program.command("users").description("Inspect workspace users.");

    users
        .command("me")
        .description("Show the current authenticated user (the API-key owner).")
        .action(async function (this: Command) {
            // GET /user is workspace-independent — use the base context so
            // `users me` works even before a workspace is configured.
            const { client, output } = await resolveBaseContext(this, services);
            const me = await client.users.getCurrentUser();
            printObject(me, output);
        });

    users
        .command("list")
        .description("List members of the workspace.")
        .option("--limit <n>", "Items per page (default 25, max 200).", parseIntArg, 25)
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option("--name <text>", "Filter by name/email substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const req: ClockifyApi.ListUsersRequest = {
                workspaceId,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 200),
                "include-roles": false,
            };
            if (opts.name) req.name = opts.name;
            const items = await client.users.list(req);
            const rows = items.map((raw) => {
                const u = raw as { id?: string; name?: string; email?: string; status?: string };
                return {
                    id: u.id ?? "",
                    name: u.name ?? "",
                    email: u.email ?? "",
                    status: u.status ?? "",
                };
            });
            printRecords(rows, output);
        });

    users
        .command("invite")
        .argument("<email>", "Email address of the user to invite.")
        .option("--no-send-email", "Do not send the invitation email.")
        .description("Invite (add) a user to the workspace by email.")
        .action(async function (this: Command, email: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const sendEmail = opts.sendEmail !== false;
            const workspace = (await client.workspaces.addUser({
                workspaceId,
                "send-email": sendEmail ? "true" : "false",
                email,
            })) as { id?: string };
            printReceipt(
                {
                    ok: true,
                    action: "users.invite",
                    entity: "workspace_member",
                    ids: { workspaceId },
                    data: { email, sendEmail, message: `invited ${email}` },
                    changed: {
                        created: [
                            { type: "workspace_member", id: workspace.id ?? "", name: email },
                        ],
                    },
                    next: [
                        {
                            command: "clk115 users list --json",
                            reason: "Verify the member appears.",
                        },
                    ],
                },
                output,
            );
        });

    users
        .command("update-profile")
        .argument("<userId>", "User ID whose member profile to update.")
        .option("--name <text>", "Display name.")
        .option("--image-url <url>", "Profile image URL.")
        .option("--remove-image", "Remove the profile image.")
        .option("--week-start <day>", "Week start day, e.g. MONDAY.")
        .option("--work-capacity <iso>", "Daily work capacity, ISO-8601 duration (e.g. PT8H).")
        .option("--working-days <days...>", "Working day enums, e.g. MONDAY TUESDAY.")
        .description(
            "Update one user's member profile (name, image, week start, work capacity, working days).",
        )
        .action(async function (this: Command, userId: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.PutWorkspacesWorkspaceIdMemberProfileUserIdUsersRequest> =
                {};
            if (opts.name !== undefined) body.name = opts.name;
            if (opts.imageUrl !== undefined) body.imageUrl = opts.imageUrl;
            if (opts.removeImage) body.removeProfileImage = true;
            if (opts.weekStart !== undefined) body.weekStart = opts.weekStart;
            if (opts.workCapacity !== undefined) body.workCapacity = opts.workCapacity;
            if (Array.isArray(opts.workingDays) && opts.workingDays.length > 0)
                body.workingDays = opts.workingDays;
            const updated = (await client.memberProfiles.update({ workspaceId, userId, body })) as {
                id?: string;
            };
            printReceipt(
                {
                    ok: true,
                    action: "users.update-profile",
                    entity: "member_profile",
                    ids: { workspaceId, userId },
                    data: {
                        id: updated.id ?? userId,
                        userId,
                        message: `updated profile for ${userId}`,
                    },
                    changed: { updated: [{ type: "member_profile", id: userId }] },
                    next: [
                        { command: "clk115 users list --json", reason: "Verify the member list." },
                    ],
                },
                output,
            );
        });
};
