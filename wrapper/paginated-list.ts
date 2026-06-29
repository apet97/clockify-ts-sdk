/**
 * Axioms-style ergonomic wrapper around `iterPages` (from
 * `clockify-sdk-ts-115/iter`). Constructs a single value that the
 * caller can:
 *
 * 1. `for await (const item of list) …` — flat-yield individual
 *    items.
 * 2. `for await (const page of list.pages()) …` — yield page
 *    envelopes with metadata.
 * 3. `await list.toArray({ limit? })` — eagerly collect, with an
 *    optional early-stop limit that avoids extra fetches.
 *
 * Mirrors the shape of `CursorList<T>` in
 * `/Users/15x/Downloads/sdkxioms.txt §8` — adapted for Clockify's
 * offset-pagination model (`page` + `page-size`).
 *
 * This is purely additive to `iterAll` / `iterPages`. Use whichever
 * you prefer. `iterAll` is lighter weight when you have a bound
 * method already; `paginatedList(...)` is preferable when you want
 * a single value you can pass around (return from a function, store
 * in state, etc.) and call `.toArray()` on later.
 */
import { iterAll, iterPages, type IterOptions, type PageEnvelope, type PaginatedRequest } from "./iter.js";

/** Options for {@link PaginatedList#toArray}. */
export interface PaginatedListToArrayOptions {
    /** Stop after collecting at most this many items. The walk
     *  stops as soon as `items.length === limit`, which may
     *  short-circuit page fetches. Default unbounded. */
    limit?: number;
}

/**
 * Async-iterable handle over a paginated list endpoint. Yields
 * individual items by default; use `.pages()` for envelopes or
 * `.toArray({ limit })` to collect eagerly with early-stop.
 *
 * Construct via the {@link paginatedList} factory, not the class
 * constructor directly — the factory is the documented API.
 */
export class PaginatedList<TItem> implements AsyncIterable<TItem> {
    constructor(
        private readonly fetcher: (
            request: PaginatedRequest & Record<string, unknown>,
        ) => PromiseLike<readonly TItem[]>,
        private readonly baseRequest: Record<string, unknown>,
        private readonly options: IterOptions,
    ) {}

    /** Yields per-page envelopes `{ items, page, pageSize,
     *  hasNextPage }`. Honors the `Last-Page` header when the
     *  fetcher exposes `withRawResponse` (see
     *  `clockify-sdk-ts-115/iter` for the contract). */
    pages(): AsyncGenerator<PageEnvelope<TItem>, void, void> {
        return iterPages<PaginatedRequest & Record<string, unknown>, TItem>(
            this.fetcher,
            this.baseRequest,
            this.options,
        );
    }

    /** Collects all items into an array. Pass `{ limit }` to stop
     *  early — the walk stops fetching as soon as `limit` items
     *  have been collected. */
    async toArray(options: PaginatedListToArrayOptions = {}): Promise<TItem[]> {
        const limit = options.limit;
        if (limit !== undefined && limit <= 0) return [];
        const out: TItem[] = [];
        for await (const item of this) {
            out.push(item);
            if (limit !== undefined && out.length >= limit) break;
        }
        return out;
    }

    /** Async-iterator protocol: yields individual items, flattening
     *  across page boundaries. Delegates to `iterAll` so the item-flatten
     *  over `iterPages` lives in exactly one place. */
    [Symbol.asyncIterator](): AsyncIterator<TItem> {
        return iterAll<PaginatedRequest & Record<string, unknown>, TItem>(
            this.fetcher,
            this.baseRequest,
            this.options,
        );
    }
}

/**
 * Factory for {@link PaginatedList}. Prefer this over `new
 * PaginatedList(...)` — the factory's type inference is easier on
 * the call site and the class constructor may evolve.
 *
 * @example
 * ```ts
 * import { createClockifyClient, paginatedList } from "clockify-sdk-ts-115";
 *
 * const client = createClockifyClient();
 * const tags = paginatedList(
 *   client.tags.list.bind(client.tags),
 *   { workspaceId: process.env.CLOCKIFY_WORKSPACE_ID! },
 *   { pageSize: 100 },
 * );
 *
 * for await (const tag of tags) console.log(tag.name);
 * // Or eagerly:
 * const first50 = await tags.toArray({ limit: 50 });
 * ```
 */
export function paginatedList<TRequest, TItem>(
    fetcher: (request: TRequest) => PromiseLike<readonly TItem[]>,
    baseRequest: Omit<TRequest, "page" | "page-size">,
    options: IterOptions = {},
): PaginatedList<TItem> {
    return new PaginatedList<TItem>(
        fetcher as unknown as (
            request: PaginatedRequest & Record<string, unknown>,
        ) => PromiseLike<readonly TItem[]>,
        baseRequest,
        options,
    );
}
