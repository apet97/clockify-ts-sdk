/**
 * PaginatedList<T> — axioms-style ergonomic
 * -----------------------------------------
 *
 * `paginatedList(fetcher, baseRequest, options)` returns a value
 * that:
 *
 * - Is async-iterable directly: `for await (const item of list)`.
 * - Has `.pages()` for per-page envelopes with metadata.
 * - Has `.toArray({ limit? })` for eager collection with optional
 *   early-stop.
 *
 * Compare to `iterAll(...)` / `iterPages(...)` from
 * `clockify-sdk-ts/iter` — these are the underlying primitives.
 * `paginatedList` is a single value you can pass around;
 * `iterAll` is a one-shot generator. Use whichever fits.
 */
import { createClockifyClient, paginatedList } from "clockify-sdk-ts";

async function main(): Promise<void> {
    const client = createClockifyClient();
    const workspaceId = process.env.CLOCKIFY_WORKSPACE_ID!;

    const allProjects = paginatedList(
        client.projects.list.bind(client.projects),
        { workspaceId },
        { pageSize: 50 },
    );

    // 1. Async-iterate over every project across pages
    for await (const project of allProjects) {
        console.log(project.name);
    }

    // 2. Or collect the first 100 only
    const first100 = await allProjects.toArray({ limit: 100 });
    console.log(`first ${first100.length} projects`);

    // 3. Or walk page-by-page with metadata
    for await (const page of allProjects.pages()) {
        console.log(
            `page ${page.page}: ${page.items.length} items (more: ${page.hasNextPage})`,
        );
        if (!page.hasNextPage) break;
    }
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
