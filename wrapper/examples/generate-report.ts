/**
 * Pull a detailed report for the last 7 days and print the first
 * 10 time entries. Read-only — no writes.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/generate-report.ts`
 */
import { createClockifyClient, ClockifyApiError } from "clockify-sdk-ts";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

try {
    const report = await client.reports.detailed({
        workspaceId,
        dateRangeStart: sevenDaysAgo.toISOString(),
        dateRangeEnd: now.toISOString(),
        detailedFilter: { page: 1, pageSize: 10 },
    });

    const entries =
        (
            report as {
                timeentries?: Array<{ description?: string; timeInterval?: { duration?: string } }>;
            }
        ).timeentries ?? [];
    console.log(`Last 7 days: ${entries.length} entries (printing first 10):\n`);
    for (const entry of entries.slice(0, 10)) {
        const dur = entry.timeInterval?.duration ?? "?";
        const desc = entry.description ?? "(no description)";
        console.log(`  ${dur.padEnd(12)} | ${desc}`);
    }
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`Clockify API failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
