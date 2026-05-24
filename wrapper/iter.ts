/**
 * Per-resource auto-pagination for the Clockify SDK.
 *
 * Fern-generated list methods accept `page` + `"page-size"` query
 * parameters and return bare-array responses (no envelope). This
 * module walks those pages for you and yields each record as it's
 * fetched, so memory stays bounded.
 *
 * Two helpers:
 *
 * - `iterAll(fetcher, baseRequest, opts?)` yields **items**, one at
 *   a time, flattening across page boundaries. Use this when you
 *   just want to iterate every record.
 * - `iterPages(fetcher, baseRequest, opts?)` yields **page
 *   envelopes** (`{ items, page, pageSize, hasNextPage }`). Use this
 *   when you need page-level metadata (resumable pagination,
 *   progress UI, etc.).
 *
 * Both compose with any list method that follows Clockify's
 * `page` + `"page-size"` convention. The {@link KnownPaginatedMethod}
 * union documents the 19 currently-known paginated `(resource,
 * method)` pairs as of v0.1.0 (synced from `PAGINATED_LIST_OPS` in
 * the GOCLMCP generator). Future methods that follow the same
 * convention work without changes here.
 *
 * For the lower-level callback-style helper that exposes the page
 * number directly to the user, see `clockify-sdk-ts/pagination`'s
 * `paginate<T>`.
 */

/** A request shape that supports offset pagination via `page` +
 *  `"page-size"`. Every Clockify list-method request type matches
 *  this. */
export type PaginatedRequest = {
    page?: number;
    "page-size"?: number;
};

/** Options for {@link iterAll} and {@link iterPages}. */
export interface IterOptions {
    /** Page size to request. Default `50` (matches Clockify's default;
     *  max `200`). */
    pageSize?: number;
    /** Maximum number of pages to walk. Default unbounded. */
    maxPages?: number;
    /** 1-based page to start at. Default `1` (useful for resume flows). */
    startPage?: number;
}

/** A single page of results plus its position metadata. */
export interface PageEnvelope<TItem> {
    /** The items returned on this page. */
    items: readonly TItem[];
    /** 1-based page number. */
    page: number;
    /** The page size that was requested. */
    pageSize: number;
    /** True when this page returned exactly `pageSize` items — the
     *  next page _may_ have more. Heuristic: matches Clockify's
     *  bare-array "is there more" signal. False on the terminal page. */
    hasNextPage: boolean;
}

/**
 * Documentary union of the 19 known paginated `(resource, method)`
 * pairs on `ClockifyApiClient`, as of v0.1.0. Not load-bearing for
 * `iterAll` — the helper accepts any matching call site, not just
 * these. Kept here so:
 *
 * - tests/iter.test.ts can exercise each pair by name;
 * - editors can autocomplete known paginated methods;
 * - future regen drift surfaces as a TS compile error in the test
 *   file if a method is renamed or removed upstream.
 */
export type KnownPaginatedMethod =
    | { readonly resource: "approvals"; readonly method: "list" }
    | { readonly resource: "auditLogReport"; readonly method: "searchAuditLogs" }
    | { readonly resource: "balances"; readonly method: "getBalanceForUser" }
    | { readonly resource: "balances"; readonly method: "getBalancesForPolicy" }
    | { readonly resource: "clients"; readonly method: "list" }
    | { readonly resource: "customFields"; readonly method: "listForProject" }
    | { readonly resource: "customFields"; readonly method: "listForWorkspace" }
    | { readonly resource: "holidays"; readonly method: "list" }
    | { readonly resource: "invoicePayments"; readonly method: "list" }
    | { readonly resource: "projects"; readonly method: "list" }
    | { readonly resource: "scheduling"; readonly method: "list" }
    | { readonly resource: "tags"; readonly method: "list" }
    | { readonly resource: "tasks"; readonly method: "list" }
    | {
          readonly resource: "timeEntries";
          readonly method: "getWorkspacesWorkspaceIdTimeEntriesStatusInProgress";
      }
    | {
          readonly resource: "timeEntries";
          readonly method: "getWorkspacesWorkspaceIdUserUserIdTimeEntries";
      }
    | { readonly resource: "timeOffPolicies"; readonly method: "list" }
    | { readonly resource: "userGroups"; readonly method: "list" }
    | { readonly resource: "users"; readonly method: "findUserTeamManagers" }
    | { readonly resource: "users"; readonly method: "findWorkspaceUsers" };

/**
 * Constant runtime list of the 19 known paginated `(resource,
 * method)` pairs. Sibling of {@link KnownPaginatedMethod}; useful
 * for tests, codegen, and CI drift assertions.
 */
export const KNOWN_PAGINATED_METHODS: ReadonlyArray<KnownPaginatedMethod> = [
    { resource: "approvals", method: "list" },
    { resource: "auditLogReport", method: "searchAuditLogs" },
    { resource: "balances", method: "getBalanceForUser" },
    { resource: "balances", method: "getBalancesForPolicy" },
    { resource: "clients", method: "list" },
    { resource: "customFields", method: "listForProject" },
    { resource: "customFields", method: "listForWorkspace" },
    { resource: "holidays", method: "list" },
    { resource: "invoicePayments", method: "list" },
    { resource: "projects", method: "list" },
    { resource: "scheduling", method: "list" },
    { resource: "tags", method: "list" },
    { resource: "tasks", method: "list" },
    { resource: "timeEntries", method: "getWorkspacesWorkspaceIdTimeEntriesStatusInProgress" },
    { resource: "timeEntries", method: "getWorkspacesWorkspaceIdUserUserIdTimeEntries" },
    { resource: "timeOffPolicies", method: "list" },
    { resource: "userGroups", method: "list" },
    { resource: "users", method: "findUserTeamManagers" },
    { resource: "users", method: "findWorkspaceUsers" },
] as const;

/**
 * Walks pages by calling `fetcher` with `{ ...baseRequest, page,
 * "page-size": pageSize }` until a non-full page comes back (or
 * `maxPages` is reached). Yields each item as it's fetched.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts";
 * import { iterAll } from "clockify-sdk-ts/iter";
 *
 * const client = createClockifyClient({
 *   apiKey: process.env.CLOCKIFY_API_KEY!,
 * });
 *
 * // `.bind()` preserves the method's full type signature so TS
 * // infers the request shape and item shape correctly. An arrow
 * // wrapper works at runtime but loses inference.
 * const listProjects = client.projects.list.bind(client.projects);
 *
 * for await (const project of iterAll(listProjects, {
 *   workspaceId: process.env.CLOCKIFY_WORKSPACE_ID!,
 * })) {
 *   console.log(project.name);
 * }
 * ```
 */
export async function* iterAll<TRequest, TItem>(
    fetcher: (request: TRequest) => PromiseLike<readonly TItem[]>,
    baseRequest: Omit<TRequest, "page" | "page-size">,
    options: IterOptions = {},
): AsyncGenerator<TItem, void, void> {
    for await (const page of iterPages(fetcher, baseRequest, options)) {
        for (const item of page.items) yield item;
    }
}

/**
 * Variant of {@link iterAll} that yields per-page envelopes
 * `{ items, page, pageSize, hasNextPage }` instead of flattening to
 * individual items. Use when you need page-level metadata.
 *
 * @example
 * ```ts
 * const listTags = client.tags.list.bind(client.tags);
 * for await (const { items, page, hasNextPage } of iterPages(
 *   listTags,
 *   { workspaceId },
 *   { pageSize: 100 },
 * )) {
 *   console.log(`page ${page}: ${items.length} tags (more: ${hasNextPage})`);
 *   if (!hasNextPage) break;
 * }
 * ```
 */
export async function* iterPages<TRequest, TItem>(
    fetcher: (request: TRequest) => PromiseLike<readonly TItem[]>,
    baseRequest: Omit<TRequest, "page" | "page-size">,
    options: IterOptions = {},
): AsyncGenerator<PageEnvelope<TItem>, void, void> {
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? Number.POSITIVE_INFINITY;
    const startPage = options.startPage ?? 1;

    if (pageSize <= 0) {
        throw new RangeError(`iterPages: pageSize must be > 0 (got ${pageSize})`);
    }
    if (maxPages <= 0) {
        throw new RangeError(`iterPages: maxPages must be > 0 (got ${maxPages})`);
    }
    if (startPage <= 0) {
        throw new RangeError(`iterPages: startPage must be > 0 (got ${startPage})`);
    }

    const endPage = startPage + maxPages - 1;
    for (let page = startPage; page <= endPage; page++) {
        const request = {
            ...baseRequest,
            page,
            "page-size": pageSize,
        } as TRequest;
        const items = (await fetcher(request)) as readonly TItem[];
        const hasNextPage = items.length === pageSize;
        yield { items, page, pageSize, hasNextPage };
        if (!hasNextPage) return;
    }
}
