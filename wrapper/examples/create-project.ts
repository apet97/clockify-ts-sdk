/**
 * Create a project, archive it, then delete it. Demonstrates
 * the create-update-delete round-trip pattern used in tests.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/create-project.ts`
 *
 * WARNING: writes to your sandbox workspace.
 */
import { createClockifyClient, ClockifyApiError } from "clockify-sdk-ts";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

const name = `sdk-example-${Date.now()}`;

try {
    const created = await client.projects.create({
        workspaceId,
        name,
        isPublic: false,
    });
    if (created.id == null) throw new Error("no project id returned");
    console.log(`Created project ${created.id} (${created.name})`);

    // Archive (most marketplaces use this pattern: archive then delete
    // so the project is recoverable from the trash for a window).
    await client.projects.update({
        workspaceId,
        projectId: created.id,
        archived: true,
    });
    console.log("Archived");

    await client.projects.delete({
        workspaceId,
        projectId: created.id,
    });
    console.log(`Deleted project ${created.id}`);
} catch (err) {
    if (err instanceof ClockifyApiError) {
        console.error(`Clockify API failed [${err.statusCode}]:`, err.body);
    } else {
        console.error("Unexpected error:", err);
    }
    process.exit(1);
}
