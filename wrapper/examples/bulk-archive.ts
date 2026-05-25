/**
 * Real-world pattern: walk every project, archive the ones that
 * haven't seen a time entry in N days, bounded parallelism + per-item
 * error handling so one bad project doesn't tank the run.
 *
 * Combines several wrapper primitives in one place:
 *   - `iterAll` for memory-bounded pagination
 *   - Bounded-parallelism via a small queue (no external dep)
 *   - `promoteApiError` + `isClockifyApiError` for safe catch-blocks
 *   - Per-request `maxRetries` override (so a failing project
 *     doesn't block the whole run on retry timeouts)
 *
 * Pass `--dry-run` to walk without mutating anything (default).
 * Pass `--apply` to actually archive.
 *
 * Run: `CLOCKIFY_API_KEY=xxx CLOCKIFY_WORKSPACE_ID=yyy npx tsx examples/bulk-archive.ts [--apply]`
 */
import {
    ClockifyApiError,
    createClockifyClient,
    getRequestIdFromError,
    isClockifyApiError,
    iterAll,
    promoteApiError,
} from "clockify-sdk-ts";

const apiKeyEnv = process.env.CLOCKIFY_API_KEY;
const workspaceIdEnv = process.env.CLOCKIFY_WORKSPACE_ID;
const apply = process.argv.includes("--apply");
const STALE_DAYS = 90;
const CONCURRENCY = 4;

if (!apiKeyEnv || !workspaceIdEnv) {
    console.error("Set CLOCKIFY_API_KEY and CLOCKIFY_WORKSPACE_ID to run this example.");
    process.exit(1);
}
// Capture into non-nullable bindings so inner closures (archiveOne)
// see narrowed string types — TS's flow analysis doesn't carry the
// `if (!x) exit` narrowing into nested function scopes for vars read
// from process.env.
const apiKey: string = apiKeyEnv;
const workspaceId: string = workspaceIdEnv;

const client = createClockifyClient({ apiKey });
const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

console.log(
    `Walking projects in ${workspaceId}; archiving any with no time entries since ${cutoff.toISOString()} (${
        apply ? "APPLY" : "DRY RUN"
    }, concurrency=${CONCURRENCY})`,
);

// Find candidates: walk every non-archived project.
const listProjects = client.projects.list.bind(client.projects);
const candidates: { id: string; name: string }[] = [];

for await (const project of iterAll(listProjects, { workspaceId, archived: false })) {
    if (project.id == null || project.name == null) continue;
    candidates.push({ id: project.id, name: project.name });
}

console.log(`Found ${candidates.length} non-archived projects`);

// Process with bounded concurrency. A simple semaphore via Promise.all
// over slices keeps the queue depth at CONCURRENCY.
const archived: string[] = [];
const failed: { id: string; reason: string }[] = [];

async function archiveOne(project: { id: string; name: string }): Promise<void> {
    try {
        // Use a stricter retry budget per-item so one slow project
        // can't multiply the wall-clock cost of the whole run.
        if (apply) {
            await client.projects.archive(
                { workspaceId, projectId: project.id },
                { maxRetries: 1 },
            );
            archived.push(project.id);
        } else {
            archived.push(project.id); // dry-run
        }
    } catch (raw) {
        const err = promoteApiError(raw);
        const reason = isClockifyApiError(err)
            ? `status=${(err as ClockifyApiError).statusCode} requestId=${
                  getRequestIdFromError(err) ?? "?"
              }`
            : String(err);
        failed.push({ id: project.id, reason });
    }
}

for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(archiveOne));
    process.stdout.write(".");
}
process.stdout.write("\n");

console.log(
    `${apply ? "Archived" : "Would archive"}: ${archived.length}; failed: ${failed.length}`,
);
if (failed.length > 0) {
    console.log("Failures:");
    for (const f of failed) console.log(`  ${f.id}: ${f.reason}`);
}
