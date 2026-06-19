/**
 * `clk115 stop` — stop the running timer for the current user.
 */
import type { Command } from "commander";


import { printSuccess } from "../output.js";
import { printReceipt } from "../receipt.js";
import { entityId } from "../sdk-narrow.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerStopCommand: Registrar = (program, services) => {
    program
        .command("stop")
        .description("Stop the running timer for the current user.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = entityId(user);
            if (!userId) {
                throw new Error("could not determine user ID from getCurrentUser response");
            }

            // The dedicated /stop route (timeEntries.stopTimer) is dead (404 code 3000);
            // detect a running timer via listInProgress, then stop it through the bound
            // bare route (timeEntries.updateForUser with { end }). Listing first means we
            // never report "no timer was running" while a real timer keeps ticking.
            const inProgress = (await client.timeEntries.listInProgress({ workspaceId })) as Array<{
                id?: string;
                userId?: string;
            }>;
            const running = inProgress.find((entry) => entry.userId === userId && entry.id);
            if (!running) {
                printSuccess("no timer was running", output);
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
