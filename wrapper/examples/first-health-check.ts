/**
 * First health check: confirm your credentials and pinned workspace are valid
 * before doing anything else. Reads the current user and lists projects (one page).
 *
 * Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID
 * Mode: live-only (or mock-safe via CLOCKIFY_BASE_URL pointing at the mock server)
 * Cleanup: none — read-only.
 * Expected output (success):
 *   ok: you@example.com can reach workspace 65b3... (N project(s) visible)
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/first-health-check.ts`
 */
import { ClockifyApiError, createClockifyClient } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

try {
    const user = await client.users.getCurrentUser();
    const projects = await client.projects.list({ workspaceId });
    const count = Array.isArray(projects) ? projects.length : 0;
    const who = (user as { email?: string }).email ?? "user";
    console.log(`ok: ${who} can reach workspace ${workspaceId} (${count} project(s) visible)`);
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`health check failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
