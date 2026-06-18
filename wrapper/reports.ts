/**
 * Typed filter builders + response-narrowing accessors for the Clockify reports
 * endpoints (`client.reports.{summary,detailed,weekly}`). Pure / type-forwarding
 * — no client coupling, no network, unit-testable like `money`/`dates`.
 *
 * The builders return the generated filter types so they slot straight into a
 * report request; the accessors hide the response-shape quirks (notably the
 * `timeEntries` vs `timeentries` payload spelling) so callers stop casting to an
 * ad-hoc inline shape.
 */
import type {
    DetailedFilter,
    DetailedReportResponse,
    GroupOneDto,
    SummaryFilter,
    SummaryGroup,
    SummaryReportResponse,
    TimeEntryDto,
    TimeEntryReportTotals,
    WeeklyFilter,
    WeeklyReportResponse,
} from "./src/api/types/index.js";

// Re-expose the generated report types so consumers can import them from the
// ergonomic `clockify-sdk-ts-115/reports` subpath rather than reaching into the
// generated tree.
export type {
    DetailedFilter,
    DetailedReportResponse,
    SummaryFilter,
    SummaryReportResponse,
    WeeklyFilter,
    WeeklyReportResponse,
};

/**
 * Build a summary-report filter. `groups` is required (Clockify allows up to 3
 * grouping levels).
 */
export function summaryFilter(
    groups: SummaryGroup[],
    opts: { sortColumn?: SummaryFilter["sortColumn"]; summaryChartType?: SummaryFilter["summaryChartType"] } = {},
): SummaryFilter {
    const filter: SummaryFilter = { groups };
    if (opts.sortColumn) filter.sortColumn = opts.sortColumn;
    if (opts.summaryChartType) filter.summaryChartType = opts.summaryChartType;
    return filter;
}

/** Build a detailed-report filter (defaults to page 1). */
export function detailedFilter(
    opts: {
        page?: number;
        pageSize?: number;
        sortColumn?: DetailedFilter["sortColumn"];
        auditFilter?: DetailedFilter["auditFilter"];
        options?: DetailedFilter["options"];
    } = {},
): DetailedFilter {
    const filter: DetailedFilter = { page: opts.page ?? 1 };
    if (opts.pageSize !== undefined) filter.pageSize = opts.pageSize;
    if (opts.sortColumn) filter.sortColumn = opts.sortColumn;
    if (opts.auditFilter) filter.auditFilter = opts.auditFilter;
    if (opts.options) filter.options = opts.options;
    return filter;
}

/** Build a weekly-report filter. The subgroup is always `TIME`. */
export function weeklyFilter(group: WeeklyFilter["group"], subgroup: WeeklyFilter["subgroup"] = "TIME"): WeeklyFilter {
    return { group, subgroup };
}

/**
 * Time entries from a detailed report, coalescing the two payload spellings
 * (`timeEntries` and the lowercase `timeentries`) the live API may return.
 */
export function detailedEntries(report: DetailedReportResponse): TimeEntryDto[] {
    return report.timeEntries ?? report.timeentries ?? [];
}

/** Top-level groups from a summary report. */
export function summaryGroups(report: SummaryReportResponse): GroupOneDto[] {
    return report.groupOne ?? [];
}

/** Report totals (shared shape across summary and detailed reports). */
export function reportTotals(report: DetailedReportResponse | SummaryReportResponse): TimeEntryReportTotals[] {
    return report.totals ?? [];
}
