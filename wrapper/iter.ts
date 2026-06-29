/**
 * Per-resource auto-pagination for the Clockify SDK.
 *
 * Generated list methods accept `page` + `"page-size"` query
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
 * union documents the 14 currently-known paginated `(resource,
 * method)` pairs (synced from `PAGINATED_LIST_OPS` in
 * the GOCLMCP generator). Future methods that follow the same
 * convention work without changes here.
 *
 * For the lower-level callback-style helper that exposes the page
 * number directly to the user, see `clockify-sdk-ts-115/pagination`'s
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
    /** Per-page progress callback invoked after a page is fetched and
     *  before it is yielded. */
    onPage?: (info: { page: number; count: number }) => void;
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
 * Documentary union of the 14 known paginated `(resource, method)`
 * pairs on `ClockifyApiClient`. Not load-bearing for
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
    | { readonly resource: "auditLogReport"; readonly method: "search" }
    | { readonly resource: "clients"; readonly method: "list" }
    | { readonly resource: "invoicePayments"; readonly method: "list" }
    | { readonly resource: "projects"; readonly method: "list" }
    | { readonly resource: "scheduling"; readonly method: "list" }
    | { readonly resource: "tags"; readonly method: "list" }
    | { readonly resource: "tasks"; readonly method: "list" }
    | { readonly resource: "timeEntries"; readonly method: "listInProgress" }
    | { readonly resource: "timeEntries"; readonly method: "listForUser" }
    | { readonly resource: "timeOffPolicies"; readonly method: "list" }
    | { readonly resource: "userGroups"; readonly method: "list" }
    | { readonly resource: "users"; readonly method: "findUserTeamManagers" }
    | { readonly resource: "users"; readonly method: "list" };

/**
 * Constant runtime list of the 14 known paginated `(resource,
 * method)` pairs. Sibling of {@link KnownPaginatedMethod}; useful
 * for tests, codegen, and CI drift assertions.
 */
export const KNOWN_PAGINATED_METHODS: ReadonlyArray<KnownPaginatedMethod> = [
    { resource: "approvals", method: "list" },
    { resource: "auditLogReport", method: "search" },
    { resource: "clients", method: "list" },
    { resource: "invoicePayments", method: "list" },
    { resource: "projects", method: "list" },
    { resource: "scheduling", method: "list" },
    { resource: "tags", method: "list" },
    { resource: "tasks", method: "list" },
    { resource: "timeEntries", method: "listInProgress" },
    { resource: "timeEntries", method: "listForUser" },
    { resource: "timeOffPolicies", method: "list" },
    { resource: "userGroups", method: "list" },
    { resource: "users", method: "findUserTeamManagers" },
    { resource: "users", method: "list" },
] as const;

/**
 * Walks pages by calling `fetcher` with `{ ...baseRequest, page,
 * "page-size": pageSize }` until a non-full page comes back (or
 * `maxPages` is reached). Yields each item as it's fetched.
 *
 * @example
 * ```ts
 * import { createClockifyClient } from "clockify-sdk-ts-115";
 *
 * const ws = createClockifyClient().workspace(
 *   process.env.CLOCKIFY_WORKSPACE_ID!,
 * );
 *
 * // Scoped iterators wrap `iterAll` for you — no `.bind` ritual.
 * for await (const project of ws.iterProjects({})) {
 *   console.log(project.name);
 * }
 * ```
 *
 * @example
 * Power-user / unscoped form — call `iterAll` directly when you need a
 * resource without a scoped iterator, or to walk across workspaces:
 * ```ts
 * import { iterAll } from "clockify-sdk-ts-115/iter";
 *
 * const client = createClockifyClient();
 * // `.bind()` preserves the method's full type signature so TS infers
 * // the request shape and item shape correctly. An arrow wrapper works
 * // at runtime but loses inference.
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
 * No scoped `ws.*` wrapper exists for `iterPages` — when you just want
 * every record, prefer the scoped item iterators (`ws.iterProjects` /
 * `ws.iterTags` / `ws.iterClients`); reach for `iterPages` directly only
 * when you need the page envelope.
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
/** Internal: minimum shape we need to extract Last-Page from a
 *  generated method's return value. Matches `HttpResponsePromise<T>`
 *  produced by every method on the synced SDK; structural type so the
 *  helper works with any compatible thenable.
 *
 *  @see {@link ResponseAwarePromise} in `clockify-sdk-ts-115/with-response`
 *  — the public, full-`RawResponse` sibling. This inline shape is
 *  deliberately narrowed to just `headers.get` (all `iterPages` needs),
 *  so `iter.ts` stays decoupled from the `RawResponse` type. */
interface RawResponseAware<T> extends PromiseLike<T> {
    withRawResponse(): Promise<{
        readonly data: T;
        readonly rawResponse: { readonly headers: { get(name: string): string | null } };
    }>;
}

function hasWithRawResponse<T>(value: PromiseLike<T>): value is RawResponseAware<T> {
    return (
        value != null &&
        typeof (value as { withRawResponse?: unknown }).withRawResponse === "function"
    );
}

/** Parse the `Last-Page` response header (case-insensitive lookup
 *  via the Headers API; value comparison case-insensitive too).
 *  Returns `true` if the server marked this as the final page,
 *  `false` if more pages are available, `undefined` if the header
 *  was absent or unparsable. */
function parseLastPageHeader(value: string | null | undefined): boolean | undefined {
    if (value == null) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return undefined;
}

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

        // Audited 2026-05-25 (re-counted 2026-06-21): 18 of the 21
        // paginated Clockify list endpoints emit a `Last-Page: true|false`
        // response header
        // (see addons-me/fern/spec/evidence/discrepancies.md →
        // `pagination.last-page-header.live-audit-2026-05-25`). When
        // present, the header is the authoritative end-of-pages
        // signal — more robust than the legacy
        // `items.length === pageSize` heuristic, which fails when a
        // final page coincidentally fills. We feature-detect
        // `withRawResponse` on the fetcher return; the generated SDK
        // methods always have it, but a custom fetcher passed by
        // a test or a Speakeasy/Stainless variant might not.
        const result = fetcher(request);
        let items: readonly TItem[];
        let lastPageFromHeader: boolean | undefined;
        if (hasWithRawResponse(result)) {
            const wrapped = await result.withRawResponse();
            items = wrapped.data;
            lastPageFromHeader = parseLastPageHeader(wrapped.rawResponse.headers.get("Last-Page"));
        } else {
            items = await result;
        }

        // The server is authoritative on BOTH ends: `Last-Page: true`
        // stops, `Last-Page: false` continues (the server expects more,
        // even if this page came back short — filtered/partial pages are
        // legitimate, so trusting `false` avoids silently under-fetching).
        // We only fall back to the legacy `items.length === pageSize`
        // heuristic when the header is absent (`undefined`). An empty page
        // (zero items) terminates the walk on EVERY branch, because the
        // default `maxPages` is unbounded (`Number.POSITIVE_INFINITY`) and
        // does NOT cap the walk — so a misbehaving server stuck on
        // `Last-Page: false` cannot loop forever.
        const hasNextPage =
            lastPageFromHeader === true ? false
            : lastPageFromHeader === false ? items.length > 0
            : items.length === pageSize;
        options.onPage?.({ page, count: items.length });
        yield { items, page, pageSize, hasNextPage };
        if (!hasNextPage) return;
    }
}
