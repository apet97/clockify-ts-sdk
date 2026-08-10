/**
 * First health check: confirm authentication and read access to the pinned
 * workspace before doing anything else. Uses clockifyHealth, then lists projects (one page).
 *
 * Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID
 * Mode: live-only (or mock-safe via CLOCKIFY_BASE_URL pointing at the mock server)
 * Cleanup: none — read-only.
 * Expected output (success):
 *   ok: you@example.com can reach workspace 65b3... (N project(s) visible; Nms health latency)
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/first-health-check.ts`
 */
import { ClockifyApiError, clockifyHealth, createClockifyClient } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({
    apiKey,
    ...(process.env.CLOCKIFY_BASE_URL ? { environment: process.env.CLOCKIFY_BASE_URL } : {}),
});

const health = await clockifyHealth(client);
if (!health.ok) {
    if (health.error instanceof ClockifyApiError) {
        console.error(`health check failed [${health.error.statusCode}]:`, health.error.body);
    } else {
        console.error("health check failed:", health.error);
    }
    process.exit(1);
}

try {
    const projects = await client.projects.list({ workspaceId });
    const who = health.user?.email ?? "user";
    console.log(
        `ok: ${who} can reach workspace ${workspaceId} ` +
            `(${projects.length} project(s) visible; ${health.latencyMs}ms health latency)`,
    );
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`workspace check failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected workspace check error:", err);
    }
    process.exit(1);
}
