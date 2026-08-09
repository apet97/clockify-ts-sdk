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
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

/** Day-of-week enum for the member-profile write. Re-declared here because the
 *  MCP twin's copy (mcp/src/tools/users.ts) is file-local, not an SDK export;
 *  the `satisfies` clause plus the exhaustiveness probe below red the
 *  type-check if the generated union ever moves. */
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

/** Uppercase and validate one day-of-week flag value. */
function requireUserDay(value: unknown, message: string): ClockifyApi.UsersDayOfWeek {
    const day = String(value).toUpperCase();
    if (!(USER_DAYS as readonly string[]).includes(day)) {
        throw new Error(message);
    }
    return day as ClockifyApi.UsersDayOfWeek;
}

export const registerUsersCommand: Registrar = (program, services) => {
    const users = program.command("users").description("Inspect workspace users.");

    leafCommand(users, "me", "read")
        .description("Show the current authenticated user (the API-key owner).")
        .action(async function (this: Command) {
            // GET /user is workspace-independent — use the base context so
            // `users me` works even before a workspace is configured.
            const { client, output } = await resolveBaseContext(this, services);
            const me = await client.users.getCurrentUser();
            printObject(me, output);
        });

    leafCommand(users, "list", "read")
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

    leafCommand(users, "invite", "write")
        .argument("<email>", "Email address of the user to invite.")
        .option("--no-send-email", "Do not send the invitation email.")
        .description("Invite (add) a user to the workspace by email.")
        .action(async function (this: Command, email: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const sendEmail = opts.sendEmail !== false;
            await client.workspaces.addUser({
                workspaceId,
                "send-email": sendEmail ? "true" : "false",
                email,
            });
            printReceipt(
                {
                    ok: true,
                    action: "users.invite",
                    entity: "workspace_member",
                    ids: { workspaceId },
                    data: { email, sendEmail, message: `invited ${email}` },
                    changed: {
                        created: [
                            // `workspaces.addUser` returns the WORKSPACE DTO, not the
                            // invited member — the email is the only honest identifier
                            // at invite time, so `id` stays empty.
                            { type: "workspace_member", id: "", name: email },
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

    leafCommand(users, "update-profile", "write")
        .argument("<userId>", "User ID whose member profile to update.")
        .option("--name <text>", "Display name.")
        .option("--image-url <url>", "Profile image URL.")
        .option("--remove-image", "Remove the profile image.")
        .option("--week-start <day>", "Week start day: MONDAY, TUESDAY, ... SUNDAY.")
        .option("--work-capacity <iso>", "Daily work capacity, ISO-8601 duration (e.g. PT8H).")
        .option(
            "--working-days <days...>",
            "Working days: MONDAY, TUESDAY, ... SUNDAY (space-separated).",
        )
        .description(
            "Update one user's member profile (name, image, week start, work capacity, working days).",
        )
        .action(async function (this: Command, userId: string, opts) {
            // CLI-3: without this guard a zero-flag invocation sent an empty
            // {} PATCH and printed success; copy the clients.update shape.
            const hasChanges =
                opts.name !== undefined ||
                opts.imageUrl !== undefined ||
                opts.removeImage === true ||
                opts.weekStart !== undefined ||
                opts.workCapacity !== undefined ||
                (Array.isArray(opts.workingDays) && opts.workingDays.length > 0);
            if (!hasChanges) {
                throw new Error(
                    "users.update-profile needs a change: provide at least one profile field.",
                );
            }
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.UpdateMemberProfilesRequest> = {};
            if (opts.name !== undefined) body.name = opts.name;
            if (opts.imageUrl !== undefined) body.imageUrl = opts.imageUrl;
            if (opts.removeImage) body.removeProfileImage = true;
            if (opts.weekStart !== undefined) {
                body.weekStart = requireUserDay(
                    opts.weekStart,
                    `--week-start must be one of: ${USER_DAYS.join(", ")}.`,
                );
            }
            if (opts.workCapacity !== undefined) body.workCapacity = opts.workCapacity;
            if (Array.isArray(opts.workingDays) && opts.workingDays.length > 0) {
                const days: ClockifyApi.UsersDayOfWeek[] = [];
                for (const raw of opts.workingDays) {
                    days.push(
                        requireUserDay(
                            raw,
                            `--working-days entries must be one of: ${USER_DAYS.join(", ")}.`,
                        ),
                    );
                }
                body.workingDays = days;
            }
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
