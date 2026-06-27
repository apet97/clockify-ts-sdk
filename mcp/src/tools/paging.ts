const DEFAULT_MAX_PAGES = 1000;

export interface PageMeta {
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

    for (let page = 1; page <= maxPages; page += 1) {
        const { items, lastPageHeader } = await readPage(fetchPage(page));
        rows.push(...items);
        if (lastPageHeader === undefined ? items.length < pageSize : lastPageHeader) break;
    }

    return rows;
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
