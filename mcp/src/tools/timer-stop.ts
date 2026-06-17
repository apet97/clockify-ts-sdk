/**
 * Stop the current user's running timer through the live, bound Clockify route.
 *
 * The dedicated `/stop` suffix route (the generated `timeEntries.stopTimer` ->
 * `PATCH /workspaces/{ws}/user/{userId}/time-entries/stop`) is dead: Clockify
 * returns 404 code 3000 "No static resource" even when a timer is running. The
 * bound route is the bare `PATCH /workspaces/{ws}/user/{userId}/time-entries`
 * (`timeEntries.updateForUser`), which a live sandbox probe (2026-06-17)
 * confirmed stops a running entry with just `{ end }`.
 *
 * Critically, "no timer running" is detected by listing in-progress entries, NOT
 * by catching a 404. The old `/stop` route returned 404 whether or not a timer
 * was running, so callers reported "no timer was running" while a real timer kept
 * ticking. Listing first removes that silent-success trap.
 */
import type { Context } from "../client.js";

export interface StopOutcome {
    /** True when a running timer for the user existed and was stopped. */
    running: boolean;
    /** The stopped time entry, present only when `running` is true. */
    entry?: unknown;
}

export async function stopRunningTimer(ctx: Context, userId: string, end: string): Promise<StopOutcome> {
    const inProgress = (await ctx.client.timeEntries.listInProgress({
        workspaceId: ctx.workspaceId,
    })) as Array<{ id?: string; userId?: string }>;
    const running = inProgress.find((entry) => entry.userId === userId && entry.id);
    if (!running) return { running: false };
    const entry = await ctx.client.timeEntries.updateForUser({
        workspaceId: ctx.workspaceId,
        userId,
        end,
    });
    return { running: true, entry };
}
