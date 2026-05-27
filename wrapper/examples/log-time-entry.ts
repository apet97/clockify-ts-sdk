/**
 * Create a 1-minute fixed-duration time entry tagged with a
 * timestamp slug, then delete it. Pattern: every create has a
 * paired delete in the same flow so a partial run doesn't litter
 * the workspace.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/log-time-entry.ts`
 *
 * WARNING: writes to your sandbox workspace. Never run against
 * production data.
 */
import { createClockifyClient, ClockifyApiError } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

const description = `sdk-example-${Date.now()}`;
const start = new Date(Date.now() - 60_000).toISOString();
const end = new Date().toISOString();

try {
    const created = await client.timeEntries.create({
        workspaceId,
        start,
        end,
        description,
    });
    console.log(`Created time entry ${created.id} (${created.description})`);

    if (created.id == null) {
        throw new Error("server didn't return an id; cannot clean up");
    }

    await client.timeEntries.delete({
        workspaceId,
        timeEntryId: created.id,
    });
    console.log(`Deleted time entry ${created.id}`);
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`Clockify API failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
