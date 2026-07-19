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
    /** Number of already-returned filtered records to skip on the first page. */
    offset?: number;
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
        offset: number;
        pageSize: number;
        limit: number;
        maxPages: number;
        pagesFetched: number;
        lastPage: number;
        hasMore: boolean;
        nextPage?: number;
        nextOffset?: number;
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
    const offset = boundedInteger("offset", options.offset ?? 0, 0, pageSize - 1);
    const limit = boundedInteger("limit", options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const maxPages = boundedInteger(
        "maxPages",
        options.maxPages ?? DEFAULT_MAX_PAGES,
        1,
        MAX_PAGES,
    );
    if (page + maxPages - 1 > MAX_START_PAGE) {
        throw new RangeError(`page + maxPages must not scan beyond page ${MAX_START_PAGE}`);
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
    let nextPage: number | undefined;
    let nextOffset: number | undefined;

    for (let pageOffset = 0; pageOffset < maxPages; pageOffset += 1) {
        const currentPage = page + pageOffset;
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
        const allMatching = pageItems.filter((item) => withinBounds(item.date, start, end));
        const currentOffset = pageOffset === 0 ? offset : 0;
        if (currentOffset > 0 && currentOffset >= allMatching.length) {
            throw new RangeError(
                "offset does not identify an unreturned filtered record on the requested page",
            );
        }
        const matching = allMatching.slice(currentOffset);
        const remaining = limit - items.length;
        const selected = matching.slice(0, remaining);
        items.push(...selected);
        pagesFetched += 1;
        lastPage = currentPage;

        const upstreamHasMore =
            lastPageHeader === true
                ? false
                : lastPageHeader === false
                  ? true
                  : pageItems.length === pageSize;
        const pageHasUnreturnedMatches = matching.length > selected.length;
        if (pageHasUnreturnedMatches) {
            hasMore = true;
            nextPage = currentPage;
            nextOffset = currentOffset + selected.length;
            break;
        }

        if (items.length >= limit || !upstreamHasMore) {
            hasMore = items.length >= limit && upstreamHasMore;
            if (hasMore) nextPage = nextSupportedPage(currentPage);
            break;
        }

        hasMore = true;
        nextPage = nextSupportedPage(currentPage);
    }

    const meta: ExpenseListResult<TExpense>["meta"] = {
        page,
        offset,
        pageSize,
        limit,
        maxPages,
        pagesFetched,
        lastPage,
        hasMore,
    };
    if (hasMore && nextPage !== undefined) meta.nextPage = nextPage;
    if (hasMore && nextOffset !== undefined) meta.nextOffset = nextOffset;

    return {
        items,
        warnings: start !== undefined || end !== undefined ? [EXPENSE_CLIENT_FILTER_WARNING] : [],
        meta,
    };
}

function nextSupportedPage(currentPage: number): number | undefined {
    const candidate = currentPage + 1;
    return candidate <= MAX_START_PAGE ? candidate : undefined;
}

function boundedInteger(name: string, value: number, min: number, max: number): number {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new RangeError(`${name} must be a safe integer from ${min} through ${max}`);
    }
    return value;
}

function parseBoundary(value: string | undefined, edge: "start" | "end"): number | undefined {
    if (value === undefined) return undefined;
    const timestamp = parseContractDate(value, edge);
    if (timestamp === undefined) {
        throw new RangeError(
            `${edge} must be a valid YYYY-MM-DD or RFC3339 timestamp with Z or an offset`,
        );
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
    const timestamp = parseContractDate(date, "start");
    if (timestamp === undefined) return false;
    return (start === undefined || timestamp >= start) && (end === undefined || timestamp <= end);
}

function parseContractDate(value: string, edge: "start" | "end"): number | undefined {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
        const [, yearText, monthText, dayText] = dateOnly;
        const year = Number(yearText);
        const month = Number(monthText);
        const day = Number(dayText);
        if (!validCalendarDate(year, month, day)) return undefined;
        return utcTimestamp(
            year,
            month,
            day,
            edge === "start" ? 0 : 23,
            edge === "start" ? 0 : 59,
            edge === "start" ? 0 : 59,
            edge === "start" ? 0 : 999,
        );
    }

    const timestamp =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(
            value,
        );
    if (!timestamp) return undefined;
    const [
        ,
        yearText,
        monthText,
        dayText,
        hourText,
        minuteText,
        secondText,
        fractionText = "",
        zone,
        sign,
        offsetHourText,
        offsetMinuteText,
    ] = timestamp;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);
    const offsetHour = zone === "Z" ? 0 : Number(offsetHourText);
    const offsetMinute = zone === "Z" ? 0 : Number(offsetMinuteText);
    if (
        !validCalendarDate(year, month, day) ||
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        offsetHour > 23 ||
        offsetMinute > 59
    ) {
        return undefined;
    }
    const millisecond = Number(fractionText.slice(0, 3).padEnd(3, "0"));
    const offset = (offsetHour * 60 + offsetMinute) * 60_000 * (sign === "-" ? -1 : 1);
    return utcTimestamp(year, month, day, hour, minute, second, millisecond) - offset;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) return false;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= (days[month - 1] ?? 0);
}

function utcTimestamp(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    millisecond: number,
): number {
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, second, millisecond);
    return date.getTime();
}

function parseLastPage(value: string | null): boolean | undefined {
    if (value?.trim().toLowerCase() === "true") return true;
    if (value?.trim().toLowerCase() === "false") return false;
    return undefined;
}
