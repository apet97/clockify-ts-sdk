/**
 * `clk115 stop` — stop the running timer for the current user.
 */
import { Command } from "commander";

import { printObject, printSuccess } from "../output.js";
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
                const stopped = await client.timeEntries.stopTimer({ workspaceId, userId, end } as never);
                const entry = stopped as { id?: string; description?: string; timeInterval?: { duration?: string } };
                if (output.mode === "json") {
                    printObject(entry as unknown as Record<string, unknown>, output);
                    return;
                }
                printSuccess(
                    `stopped entry ${entry.id ?? "?"} — ${entry.description ?? "(no description)"} — ${entry.timeInterval?.duration ?? "?"}`,
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
