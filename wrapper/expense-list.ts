import type { ClockifyApi } from "./requests.js";

export interface ExpenseListEnvelope<TExpense> {
    expenses?: {
        count?: number;
        expenses?: TExpense[];
    };
}

export type ExpenseListPagePromise<TExpense> = PromiseLike<ExpenseListEnvelope<TExpense>> & {
    withRawResponse?: () => Promise<{
        data: ExpenseListEnvelope<TExpense>;
        rawResponse: { headers: { get(name: string): string | null } };
    }>;
};

export type ExpenseListFetcher<TExpense> = (
    request: ClockifyApi.ListExpensesRequest,
) => ExpenseListPagePromise<TExpense>;

export interface ExpenseListOptions {
    start?: string;
    end?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
    maxPages?: number;
}

export const EXPENSE_CLIENT_FILTER_WARNING =
    "Clockify ignores expense start/end query parameters; date bounds were applied client-side across bounded pages.";

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGE_SIZE = 200;
const MAX_LIMIT = 10_000;
const MAX_PAGES = 1_000;
const MAX_START_PAGE = 1_000_000;

export interface ExpenseListResult<TExpense> {
    items: TExpense[];
    warnings: string[];
    meta: {
        page: number;
        pageSize: number;
        limit: number;
        maxPages: number;
        pagesFetched: number;
        lastPage: number;
        hasMore: boolean;
        nextPage?: number;
    };
}

export async function listExpensesFiltered<TExpense extends { date?: string }>(
    fetcher: ExpenseListFetcher<TExpense>,
    request: Omit<ClockifyApi.ListExpensesRequest, "page" | "page-size">,
    options: ExpenseListOptions = {},
): Promise<ExpenseListResult<TExpense>> {
    const page = boundedInteger("page", options.page ?? 1, 1, MAX_START_PAGE);
    const pageSize = boundedInteger(
        "pageSize",
        options.pageSize ?? DEFAULT_PAGE_SIZE,
        1,
        MAX_PAGE_SIZE,
    );
    const limit = boundedInteger("limit", options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const maxPages = boundedInteger(
        "maxPages",
        options.maxPages ?? DEFAULT_MAX_PAGES,
        1,
        MAX_PAGES,
    );
    if (!Number.isSafeInteger(page + maxPages - 1)) {
        throw new RangeError("page + maxPages exceeds the safe integer range");
    }

    const start = parseBoundary(options.start, "start");
    const end = parseBoundary(options.end, "end");
    if (start !== undefined && end !== undefined && start > end) {
        throw new RangeError("start must be less than or equal to end");
    }

    const items: TExpense[] = [];
    let pagesFetched = 0;
    let lastPage = page;
    let hasMore = false;

    for (let offset = 0; offset < maxPages; offset += 1) {
        const currentPage = page + offset;
        const pending = fetcher({ ...request, page: currentPage, "page-size": pageSize });
        let envelope: ExpenseListEnvelope<TExpense>;
        let lastPageHeader: boolean | undefined;
        if (typeof pending.withRawResponse === "function") {
            const wrapped = await pending.withRawResponse();
            envelope = wrapped.data;
            lastPageHeader = parseLastPage(wrapped.rawResponse.headers.get("Last-Page"));
        } else {
            envelope = await pending;
        }

        const pageItems = envelope.expenses?.expenses ?? [];
        const matching = pageItems.filter((item) => withinBounds(item.date, start, end));
        const remaining = limit - items.length;
        items.push(...matching.slice(0, remaining));
        pagesFetched += 1;
        lastPage = currentPage;

        const upstreamHasMore =
            lastPageHeader === true
                ? false
                : lastPageHeader === false
                  ? true
                  : pageItems.length === pageSize;
        hasMore = matching.length > remaining || upstreamHasMore;

        if (items.length >= limit || !upstreamHasMore) break;
    }

    const meta: ExpenseListResult<TExpense>["meta"] = {
        page,
        pageSize,
        limit,
        maxPages,
        pagesFetched,
        lastPage,
        hasMore,
    };
    if (hasMore) meta.nextPage = lastPage + 1;

    return {
        items,
        warnings: start !== undefined || end !== undefined ? [EXPENSE_CLIENT_FILTER_WARNING] : [],
        meta,
    };
}

function boundedInteger(name: string, value: number, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a safe integer from ${min} through ${max}`);
    }
    return value;
}

function parseBoundary(value: string | undefined, edge: "start" | "end"): number | undefined {
    if (value === undefined) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const normalized = dateOnly
        ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
        : value;
    const timestamp = Date.parse(normalized);
    if (!Number.isFinite(timestamp)) {
        throw new RangeError(`${edge} must be a valid YYYY-MM-DD or ISO-8601 timestamp`);
    }
    if (dateOnly && new Date(timestamp).toISOString().slice(0, 10) !== value) {
        throw new RangeError(`${edge} must be a valid calendar date`);
    }
    return timestamp;
}

function withinBounds(
    date: string | undefined,
    start: number | undefined,
    end: number | undefined,
): boolean {
    if (start === undefined && end === undefined) return true;
    if (date === undefined) return false;
    const timestamp = Date.parse(date);
    if (!Number.isFinite(timestamp)) return false;
    return (start === undefined || timestamp >= start) && (end === undefined || timestamp <= end);
}

function parseLastPage(value: string | null): boolean | undefined {
    if (value?.trim().toLowerCase() === "true") return true;
    if (value?.trim().toLowerCase() === "false") return false;
    return undefined;
}
