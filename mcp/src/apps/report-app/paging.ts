const REPORTS_APP_PAGE_SIZE = 50;

export function canonicalReportsAppPaging(
    page: unknown,
    pageSize: unknown,
): { page: number; pageSize: typeof REPORTS_APP_PAGE_SIZE } {
    const sourcePage = positiveInteger(page, 1);
    const sourcePageSize = positiveInteger(pageSize, REPORTS_APP_PAGE_SIZE);
    const zeroBasedOffset = (sourcePage - 1) * sourcePageSize;

    return {
        page: Math.floor(zeroBasedOffset / REPORTS_APP_PAGE_SIZE) + 1,
        pageSize: REPORTS_APP_PAGE_SIZE,
    };
}

function positiveInteger(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0
        ? value
        : fallback;
}
