/**
 * Hand-written offset-pagination iterator for the Clockify SDK.
 *
 * Fern CLI 5.37.9's `x-fern-pagination` offset mode requires a
 * dot-delimited `results: $response.<field>` path, but Clockify's list
 * endpoints return bare top-level arrays. This helper fills the gap:
 * it delegates to {@link iterAll} (which walks `page` / `page-size`
 * honoring the `Last-Page` response header, falling back to the
 * "non-full page" heuristic only when the header is absent, bounded by
 * `maxPages`) and yields each record as it's fetched so memory stays
 * bounded. Keeping one page-walk means the `Last-Page` correctness lives
 * in exactly one place.
 */

import { iterAll } from "./iter.js";

export interface PaginateOptions {
    /** Page size to request. Default `50`. */
    pageSize?: number;
    /** Maximum number of pages to walk. Default unbounded. */
    maxPages?: number;
    /** 1-based page to start at. Default `1`. */
    startPage?: number;
}

/**
 * Yields every record returned by `fetchPage`, walking pages until
 * `fetchPage` returns fewer than `pageSize` items (the live API's
 * "last page" signal) or `maxPages` pages have been walked.
 *
 * For the higher-level API that operates directly on bound SDK
 * methods (no `(page, pageSize) => ...` wrapper) see {@link iterAll}
 * and {@link iterPages} in `clockify-sdk-ts-115/iter`.
 *
 * @example
 * ```ts
 * for await (const project of paginate(
 *   (page, pageSize) =>
 *     client.projects.list({ workspaceId, page, "page-size": pageSize }),
 *   { pageSize: 50 },
 * )) {
 *   console.log(project.name);
 * }
 * ```
 *
 * @throws RangeError if `pageSize`, `maxPages`, or `startPage` is
 *   `<= 0`. Errors thrown by `fetchPage` propagate unchanged.
 */
export async function* paginate<T>(
    fetchPage: (page: number, pageSize: number) => Promise<readonly T[]>,
    options: PaginateOptions = {},
): AsyncGenerator<T, void, void> {
    // Adapt the (page, pageSize) callback to the fetcher(request) shape
    // iterAll expects, then delegate. iterAll validates pageSize/maxPages/
    // startPage (> 0) and applies the same defaults (50 / unbounded / 1).
    yield* iterAll<{ page?: number; "page-size"?: number }, T>(
        (req) => fetchPage(req.page ?? options.startPage ?? 1, req["page-size"] ?? options.pageSize ?? 50),
        {},
        options,
    );
}
