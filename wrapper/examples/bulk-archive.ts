/**
 * Real-world pattern: walk every non-archived project and archive them, with
 * bounded parallelism + per-item error handling so one bad project doesn't tank
 * the run.
 *
 * Uses the SDK's bulk helper instead of a hand-rolled queue:
 *   - `iterAll` for memory-bounded pagination
 *   - `mapBounded` for bounded-concurrency with collected per-item failures
 *   - `projects.update({ archived: true })` — the live archive path (the
 *     dedicated `projects.archive` `/archive` route 404s on the live API)
 *
 * Pass `--apply` to actually archive (default is a dry run).
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/bulk-archive.ts [--apply]`
 */
import { createClockifyClient, iterAll, mapBounded } from "clockify-sdk-ts-115";

const apiKeyEnv = process.env.CLOCKIFY_API_KEY;
const workspaceIdEnv = process.env.CLOCKIFY_WORKSPACE_ID;
const apply = process.argv.includes("--apply");
const CONCURRENCY = 4;

if (!apiKeyEnv || !workspaceIdEnv) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}
const apiKey: string = apiKeyEnv;
const workspaceId: string = workspaceIdEnv;

const client = createClockifyClient({ apiKey });

// Find candidates: walk every non-archived project.
const listProjects = client.projects.list.bind(client.projects);
const ids: string[] = [];
for await (const project of iterAll(listProjects, { workspaceId, archived: false })) {
    if (project.id != null) ids.push(project.id);
}
console.log(
    `Found ${ids.length} non-archived projects (${apply ? "APPLY" : "DRY RUN"}, concurrency=${CONCURRENCY})`,
);

// Archive with bounded concurrency; mapBounded collects per-item failures so one
// bad project doesn't abort the run. A stricter per-request retry budget keeps a
// slow project from multiplying the wall-clock cost.
const { ok, failures } = await mapBounded(
    ids,
    async (projectId) => {
        if (apply) {
            await client.projects.update({ workspaceId, projectId, archived: true }, { maxRetries: 1 });
        }
        return projectId;
    },
    { concurrency: CONCURRENCY },
);

console.log(`${apply ? "Archived" : "Would archive"}: ${ok.length}; failed: ${failures.length}`);
for (const f of failures) console.log(`  ${f.item}: ${String(f.error)}`);
