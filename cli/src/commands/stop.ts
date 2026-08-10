/**
 * `clk115 stop` — stop the running timer for the current user.
 */
import { iterAll } from "clockify-sdk-ts-115/iter";
import { entityId } from "clockify-sdk-ts-115/operation-receipt";
import type { Command } from "commander";


import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

export const registerStopCommand: Registrar = (program, services) => {
    leafCommand(program, "stop", "write")
        .description("Stop the running timer for the current user.")
        .addHelpText(
            "after",
            "\nExamples:\n" +
                "  $ clk115 stop\n" +
                "  $ clk115 stop --json\n",
        )
        .action(async function (this: Command) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = entityId(user);
            if (!userId) {
                throw new Error("could not determine user ID from getCurrentUser response");
            }

            // The dedicated /stop route (timeEntries.stopTimer) is dead (404 code 3000);
            // detect a running timer via listInProgress, then stop it through the bound
            // bare route (timeEntries.updateForUser with { end }). Listing first — and
            // walking EVERY page of the paginated, workspace-wide list — means we never
            // report "no timer was running" while a real timer keeps ticking past page 1.
            let running: { id?: string; userId?: string } | undefined;
            for await (const item of iterAll(
                (req: { workspaceId: string; page?: number; "page-size"?: number }) =>
                    client.timeEntries.listInProgress(req) as PromiseLike<readonly unknown[]>,
                { workspaceId },
                { pageSize: 200, maxPages: 1000 },
            )) {
                const entry = item as { id?: string; userId?: string };
                if (entry.userId === userId && entry.id) {
                    running = entry;
                    break;
                }
            }
            if (!running) {
                // Emit a receipt on the no-op arm too, so a script switching on
                // `payload.action === "timer.stop"` sees the same shape either way.
                printReceipt(
                    {
                        ok: true,
                        action: "timer.stop",
                        entity: "time_entry",
                        ids: {},
                        data: { message: "no timer was running" },
                        changed: {},
                        next: [{ command: "clk115 start --json", reason: "Start a timer." }],
                    },
                    output,
                );
                return;
            }

            const end = new Date().toISOString();
            const stopped = await client.timeEntries.updateForUser({ workspaceId, userId, end });
            const entry = stopped as { id?: string; description?: string; timeInterval?: { duration?: string } };
            const data = {
                ...entry,
                id: entry.id ?? "",
                description: entry.description ?? "",
                duration: entry.timeInterval?.duration ?? "",
            };
            printReceipt(
                {
                    ok: true,
                    action: "timer.stop",
                    entity: "time_entry",
                    ids: { entryId: data.id },
                    data,
                    changed: { updated: [{ type: "time_entry", id: data.id }] },
                    next: [{ command: "clk115 entries list --json", reason: "Review the stopped entry." }],
                },
                output,
            );
        });
};
