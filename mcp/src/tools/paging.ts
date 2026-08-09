const DEFAULT_MAX_PAGES = 1000;
const MAX_PAGE_SIZE = 200;

interface PageMeta {
    workspaceId: string;
    count: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
    lastPageHeader?: boolean;
}

interface HeadersLike {
    get(name: string): string | null;
}

interface ResponseAware<T> extends PromiseLike<T> {
    withRawResponse(): Promise<{
        readonly data: T;
        readonly rawResponse: { readonly headers: HeadersLike };
    }>;
}

function hasWithRawResponse<T>(value: PromiseLike<T>): value is ResponseAware<T> {
    return typeof (value as { withRawResponse?: unknown }).withRawResponse === "function";
}

function parseLastPageHeader(value: string | null | undefined): boolean | undefined {
    if (value == null) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return undefined;
}

export async function pageWithMeta<T>(
    response: PromiseLike<readonly T[]>,
    opts: { workspaceId: string; page: number; pageSize: number },
): Promise<{ items: readonly T[]; meta: PageMeta }> {
    const { items, lastPageHeader } = await readPage(response);

    return {
        items,
        meta: {
            workspaceId: opts.workspaceId,
            count: items.length,
            page: opts.page,
            pageSize: opts.pageSize,
            hasMore: lastPageHeader === undefined ? items.length === opts.pageSize : !lastPageHeader,
            ...(lastPageHeader !== undefined ? { lastPageHeader } : {}),
        },
    };
}

export async function collectPagedList<T>(
    fetchPage: (page: number) => PromiseLike<readonly T[]>,
    opts: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
    const pageSize = opts.pageSize ?? 200;
    const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
    const rows: T[] = [];
    let previousFingerprint: string | undefined;

    if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > MAX_PAGE_SIZE) {
        throw new RangeError(
            `collectPagedList: pageSize must be a positive safe integer at most ${MAX_PAGE_SIZE} (got ${pageSize})`,
        );
    }
    if (!Number.isSafeInteger(maxPages) || maxPages <= 0) {
        throw new RangeError(
            `collectPagedList: maxPages must be a positive safe integer (got ${maxPages})`,
        );
    }

    for (let page = 1; page <= maxPages; page += 1) {
        const { items, lastPageHeader } = await readPage(fetchPage(page));
        rows.push(...items);
        // An empty page terminates the walk on EVERY branch (mirrors
        // wrapper/iter.ts): it can never contain the target, and a backend
        // stuck on `Last-Page: false` must not spin to the maxPages cap.
        const hasMore =
            items.length > 0 &&
            (lastPageHeader === undefined ? items.length === pageSize : !lastPageHeader);
        if (!hasMore) return rows;

        const fingerprint = pageFingerprint(items);
        if (fingerprint !== undefined && fingerprint === previousFingerprint) {
            throw new Error(
                `collectPagedList: the server returned the identical non-empty page twice in a row (page ${page - 1} and ${page}) while signalling more pages`,
            );
        }
        previousFingerprint = fingerprint;
    }

    throw new Error(
        `collectPagedList: maxPages (${maxPages}) was exhausted while the server still signalled more pages; refusing to return a partial result`,
    );
}

function pageFingerprint(items: readonly unknown[]): string | undefined {
    const ids: string[] = [];
    for (const item of items) {
        const id = (item as { id?: unknown } | null | undefined)?.id;
        if (typeof id !== "string" || id.length === 0) {
            ids.length = 0;
            break;
        }
        ids.push(id);
    }
    if (ids.length === items.length && items.length > 0) return `ids:${ids.join("\u0000")}`;
    try {
        return `json:${JSON.stringify(items)}`;
    } catch {
        return undefined;
    }
}

async function readPage<T>(
    response: PromiseLike<readonly T[]>,
): Promise<{ items: readonly T[]; lastPageHeader?: boolean }> {
    if (!hasWithRawResponse(response)) {
        return { items: await response };
    }

    const { data, rawResponse } = await response.withRawResponse();
    const lastPageHeader = parseLastPageHeader(rawResponse.headers.get("Last-Page"));
    return {
        items: data,
        ...(lastPageHeader !== undefined ? { lastPageHeader } : {}),
    };
}
