/**
 * Walk every project in a workspace via `iterAll` (item-flat) and
 * re-walk via `iterPages` (page envelopes with progress metadata).
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/paginate-all.ts`
 */
import { createClockifyClient, iterAll, iterPages } from "clockify-sdk-ts-115";

const apiKey = process.env.CLOCKIFY_API_KEY;
const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID;

if (!apiKey || !workspaceId) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}

const client = createClockifyClient({ apiKey });

// .bind(client.projects) preserves the method's full type signature
// so TS infers TRequest from the bound method (not from iterAll's
// contextual PaginatedRequest constraint).
const listProjects = client.projects.list.bind(client.projects);

console.log("---- iterAll (items flat) ----");
let count = 0;
for await (const project of iterAll(listProjects, { workspaceId }, { pageSize: 50 })) {
    count++;
    console.log(`${count.toString().padStart(4)} | ${project.id} | ${project.name}`);
}
console.log(`Total: ${count} projects.\n`);

console.log("---- iterPages (per-page envelopes) ----");
for await (const { items, page, hasNextPage } of iterPages(
    listProjects,
    { workspaceId },
    { pageSize: 20 },
)) {
    console.log(`Page ${page}: ${items.length} projects | hasNextPage=${hasNextPage}`);
    if (page >= 5) {
        console.log("(stopping early after 5 pages)");
        break;
    }
}
