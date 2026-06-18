/**
 * `clk115 users me` / `clk115 users list` — read-only user inspection.
 * `me` resolves the API-key owner (`GET /user`, no workspace needed); `list`
 * pages the workspace members. Both are read-only (no receipt).
 */
import type { Command } from "commander";

import { printObject, printRecords } from "../output.js";

import { resolveBaseContext, resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerUsersCommand: Registrar = (program, services) => {
    const users = program.command("users").description("Inspect workspace users.");

    users
        .command("me")
        .description("Show the current authenticated user (the API-key owner).")
        .action(async function (this: Command) {
            // GET /user is workspace-independent — use the base context so
            // `users me` works even before a workspace is configured.
            const { client, output } = resolveBaseContext(this, services);
            const me = await client.users.getCurrentUser();
            printObject(me as unknown as Record<string, unknown>, output);
        });

    users
        .command("list")
        .description("List members of the workspace.")
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--page-size <n>", "Items per page (max 200).", (v) => Number.parseInt(v, 10), 50)
        .option("--name <text>", "Filter by name/email substring.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const req: Record<string, unknown> = {
                workspaceId,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.pageSize), 200),
            };
            if (opts.name) req.name = opts.name;
            const items = (await client.users.list(req as never)) as unknown[];
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
};
