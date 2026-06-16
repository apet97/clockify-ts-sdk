/**
 * List every project in a workspace by walking all pages with `iterAll`. The SDK
 * stops on the `Last-Page` header, so you get every project without managing page
 * numbers yourself.
 *
 * Env: CLOCKIFY_API_KEY, CLOCKIFY_WORKSPACE_ID
 * Mode: live-only (or mock-safe via CLOCKIFY_BASE_URL pointing at the mock server)
 * Cleanup: none — read-only.
 * Expected output:
 *   <id> | <name>
 *   ...
 *   Total: N projects.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/list-all-projects.ts`
 */
import { createClockifyClient, iterAll } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;
if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY + CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });
const listProjects = client.projects.list.bind(client.projects);

let count = 0;
for await (const project of iterAll(listProjects, { workspaceId }, { pageSize: 50 })) {
    count++;
    console.log(`${project.id} | ${project.name}`);
}
console.log(`Total: ${count} projects.`);
