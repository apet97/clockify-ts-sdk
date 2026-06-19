/**
 * Bounded-parallel bulk helpers. Pure and dependency-injected (no client
 * coupling, no network) so it's fixture-testable — the same shape as `ensure`.
 *
 * `mapBounded` runs `fn` over `items` with a capped number of in-flight calls,
 * collecting per-item failures (so one bad item doesn't tank the run) unless
 * `continueOnError` is false. The thin `bulkArchiveProjects` / `bulkDelete`
 * helpers take an injected operation so the caller wires the real route — e.g.
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

    async function worker(): Promise<void> {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            const item = items[index]!;
            try {
                ok.push(await fn(item, index));
            } catch (error) {
                if (!continueOnError) throw error;
                failures.push({ item, error, index });
            }
        }
    }

    const poolSize = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: poolSize }, () => worker()));
    return { ok, failures };
}

/**
 * Archive many projects with bounded concurrency. `archiveFn` must perform the
 * archive — wire it to `client.projects.update({ workspaceId, projectId: id,
 * archived: true })` (NOT `projects.archive`, whose `/archive` route is dead).
 */
export function bulkArchiveProjects<R>(
    ids: readonly string[],
    archiveFn: (id: string) => Promise<R>,
    opts?: MapBoundedOptions,
): Promise<BulkResult<string, R>> {
    return mapBounded(ids, (id) => archiveFn(id), opts);
}

/** Delete many entities by id with bounded concurrency via an injected `deleteFn`. */
export function bulkDelete<R>(
    ids: readonly string[],
    deleteFn: (id: string) => Promise<R>,
    opts?: MapBoundedOptions,
): Promise<BulkResult<string, R>> {
    return mapBounded(ids, (id) => deleteFn(id), opts);
}
