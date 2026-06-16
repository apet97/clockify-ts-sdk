/**
 * Start a running timer, then stop it — and delete it so a partial run leaves no
 * litter. "Start" = create an entry with a start but no end (a running timer).
 *
 * Stopping a running timer: Clockify's live API stops via the user-scoped
 * `PATCH /workspaces/{ws}/user/{userId}/time-entries`. The generated SDK's
 * `timeEntries.stopTimer(...)` currently targets a `.../time-entries/stop`
 * variant that the live API returns 404 "No static resource" for (recorded in
 * spec/evidence/discrepancies.md → `entries.stoptimer.route-404-no-static-resource`).
 * Until that route is fixed at the generator, stop via the MCP `clockify_stop_work`
 * workflow, or — as here, to keep the example self-cleaning — discard the running
 * timer with `delete`.
 *
 * Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID
 * Mode: live-only — writes to your sandbox workspace. Never run against production.
 * Cleanup: deletes the entry it created.
 * Expected output (success):
 *   Started timer <id>
 *   Stopped (discarded) timer <id>
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/start-stop-timer.ts`
 */
import { ClockifyApiError, createClockifyClient } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

let entryId: string | undefined;
try {
    // Start: a time entry with a start but no end is a running timer.
    const running = await client.timeEntries.create({
        workspaceId,
        start: new Date().toISOString(),
        description: `sdk-example-timer-${Date.now()}`,
    });
    entryId = running.id ?? undefined;
    if (!entryId) throw new Error("server did not return an entry id");
    console.log(`Started timer ${entryId}`);

    // Stop: discard the running timer (see header note on the live stop route).
    await client.timeEntries.delete({ workspaceId, timeEntryId: entryId });
    console.log(`Stopped (discarded) timer ${entryId}`);
} catch (err) {
    // Best-effort cleanup so a mid-flow failure never leaves a running timer.
    if (entryId) {
        try {
            await client.timeEntries.delete({ workspaceId, timeEntryId: entryId });
        } catch {
            /* already gone */
        }
    }
    if (err instanceof ClockifyApiError) {
        console.error(`timer flow failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
