/**
 * Start a running timer, then stop it — and delete it so a partial run leaves no
 * litter. "Start" = create an entry with a start but no end (a running timer).
 *
 * Stopping a running timer: Clockify's live API stops via the user-scoped
 * `PATCH /workspaces/{ws}/user/{userId}/time-entries` with an `{ end }` body
 * (the generated `timeEntries.updateForUser`). The legacy `/stop` suffix route
 * (`timeEntries.stopTimer`) 404s live and has been quarantined out of the
 * generated SDK (spec/evidence/discrepancies.md →
 * `entries.stoptimer.route-404-no-static-resource`). This example stops the
 * timer that way, then deletes it so a partial run leaves no litter.
 *
 * Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID
 * Mode: live-only — writes to your sandbox workspace. Never run against production.
 * Cleanup: deletes the entry it created.
 * Expected output (success):
 *   Started timer <id>
 *   Stopped timer <id>
 *   Deleted timer <id>
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

const me = await client.users.getCurrentUser();
const userId = me.id;
if (!userId) {
    console.error("Could not resolve the current user id.");
    process.exit(1);
}

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

    // Stop: the live stop flow — PATCH the user's running entry with { end }.
    await client.timeEntries.updateForUser({ workspaceId, userId, end: new Date().toISOString() });
    console.log(`Stopped timer ${entryId}`);

    // Clean up so the example leaves no litter.
    await client.timeEntries.delete({ workspaceId, timeEntryId: entryId });
    console.log(`Deleted timer ${entryId}`);
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
