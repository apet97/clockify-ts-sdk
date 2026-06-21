/**
 * Bounded-parallel bulk helpers. Pure and dependency-injected (no client
 * coupling, no network) so it's fixture-testable — the same shape as `ensure`.
 *
 * `mapBounded` runs `fn` over `items` with a capped number of in-flight calls,
 * collecting per-item failures (so one bad item doesn't tank the run) unless
 * `continueOnError` is false. The caller injects the real operation — e.g.
 * `client.projects.update({ ..., archived: true })` for archiving (the
 * dedicated `projects.archive` route is dead/404 on the live API).
 */

export interface MapBoundedOptions {
    /** Maximum concurrent in-flight calls. Default `4`. */
    concurrency?: number;
    /** Collect failures and keep going (default `true`); `false` rejects on the first error. */
    continueOnError?: boolean;
}

/** One failed item from a bulk run. */
export interface BulkFailure<T> {
    item: T;
    error: unknown;
    /** The item's index in the input array. */
    index: number;
}

/** The partitioned outcome of a bulk run: successes and per-item failures. */
export interface BulkResult<T, R> {
    ok: R[];
    failures: BulkFailure<T>[];
}

/**
 * Map `fn` over `items` with bounded concurrency. With `continueOnError` (the
 * default), every item is attempted and failures are collected into `failures`;
 * with `continueOnError: false` the first rejection propagates.
 *
 * @example
 * ```ts
 * const result = await mapBounded(projectIds, archiveProject, { concurrency: 4 });
 * ```
 */
export async function mapBounded<T, R>(
    items: readonly T[],
    fn: (item: T, index: number) => Promise<R>,
    opts: MapBoundedOptions = {},
): Promise<BulkResult<T, R>> {
    const concurrency = Math.max(1, opts.concurrency ?? 4);
    const continueOnError = opts.continueOnError ?? true;
    const ok: R[] = [];
    const failures: BulkFailure<T>[] = [];
    let cursor = 0;
    // Shared fail-fast flag for the `continueOnError: false` mode. Once any
    // worker's `fn` rejects, this flips so sibling workers stop pulling NEW
    // items off the queue and skip dispatching `fn` for items they had
    // already claimed but not yet started. In-flight, already-dispatched
    // `fn` calls cannot be recalled — only not-yet-started work is skipped —
    // so the resolved/rejected contract is unchanged; only the count of new
    // calls made after the first failure shrinks.
    let aborted = false;

    async function worker(): Promise<void> {
        while (cursor < items.length) {
            if (aborted) return;
            const index = cursor;
            cursor += 1;
            const item = items[index]!;
            if (aborted) return;
            try {
                ok.push(await fn(item, index));
            } catch (error) {
                if (!continueOnError) {
                    aborted = true;
                    throw error;
                }
                failures.push({ item, error, index });
            }
        }
    }

    const poolSize = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return { ok, failures };
}
