/**
 * `clk115 stop` — stop the running timer for the current user.
 */
import type { Command } from "commander";

import { printSuccess } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerStopCommand: Registrar = (program, services) => {
    program
        .command("stop")
        .description("Stop the running timer for the current user.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const user = await client.users.getCurrentUser();
            const userId = (user as { id?: string }).id;
            if (!userId) {
                throw new Error("could not determine user ID from getCurrentUser response");
            }

            const end = new Date().toISOString();
            try {
                const stopped = await client.timeEntries.stopTimer({ workspaceId, userId, end });
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
            } catch (err) {
                const status = (err as { statusCode?: number }).statusCode;
                if (status === 404) {
                    printSuccess("no timer was running", output);
                    return;
                }
                throw err;
            }
        });
};
