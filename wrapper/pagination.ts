/**
 * Hand-written offset-pagination iterator for the Clockify SDK.
 *
 * Fern CLI 5.37.9's `x-fern-pagination` offset mode requires a
 * dot-delimited `results: $response.<field>` path, but Clockify's list
 * endpoints return bare top-level arrays. This helper fills the gap:
 * it walks `page` / `page-size` until a non-full page comes back (or
 * `maxPages` is reached), and yields each record as it's fetched so
 * memory stays bounded.
 */

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
 * @example
 * ```ts
 * for await (const project of paginate(
 *   (page, pageSize) =>
 *     client.projects.getWorkspaceProjects({ workspaceId, page, "page-size": pageSize }),
 *   { pageSize: 50 },
 * )) {
 *   console.log(project.name);
 * }
 * ```
 */
export async function* paginate<T>(
  fetchPage: (page: number, pageSize: number) => Promise<readonly T[]>,
  options: PaginateOptions = {},
): AsyncGenerator<T, void, void> {
  const pageSize = options.pageSize ?? 50;
  const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
  const startPage = options.startPage ?? 1;

  if (pageSize <= 0) {
    throw new RangeError(`paginate: pageSize must be > 0 (got ${pageSize})`);
  }
  if (maxPages <= 0) {
    throw new RangeError(`paginate: maxPages must be > 0 (got ${maxPages})`);
  }
  if (startPage <= 0) {
    throw new RangeError(`paginate: startPage must be > 0 (got ${startPage})`);
  }

  const endPage = startPage + maxPages - 1;
  for (let page = startPage; page <= endPage; page++) {
    const items = await fetchPage(page, pageSize);
    for (const item of items) yield item;
    if (items.length < pageSize) return;
  }
}
