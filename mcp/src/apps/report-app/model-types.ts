import type { ClockifyApi } from "clockify-sdk-ts-115/requests";

import type { REPORTS_APP_MODEL_VERSION } from "./constants.js";

export type ReportsGroup = ClockifyApi.SummaryGroup;

export interface ReportsAppQuery {
    dateRangeStart: string;
    dateRangeEnd: string;
    dateRangeType?: string;
    timeZone?: string;
    page?: number;
    pageSize?: number;
}

export interface ReportsAppTotals {
    durationSeconds: number | null;
    billableSeconds: number | null;
    entriesCount: number | null;
    amounts: Array<{ type: string; value: number }>;
}

export interface ReportsAppLimits {
    byteLimit: number;
    shown: number;
    available: number | null;
    omitted: number | null;
    truncated: boolean;
}

export interface SummaryView {
    kind: "summary";
    groupBy: ReportsGroup[];
    topLevelAvailable: number | null;
    rows: SummaryRow[];
    chart: SummaryChartRow[];
}

export interface SummaryRow {
    key: string;
    id: string | null;
    label: string;
    path: string[];
    depth: number;
    groupType: ReportsGroup;
    clientName: string | null;
    durationSeconds: number | null;
    amount: number | null;
    childCount: number;
}

export interface SummaryChartRow {
    key: string;
    label: string;
    durationSeconds: number | null;
    amount: number | null;
    aggregated: boolean;
}

export interface DetailedView {
    kind: "detailed";
    rows: DetailedRow[];
    paging: ReportsAppPaging;
}

export interface DetailedRow {
    id: string | null;
    start: string | null;
    end: string | null;
    durationSeconds: number | null;
    running: boolean;
    description: string;
    billable: boolean | null;
    locked: boolean | null;
    user: { id: string | null; name: string; email: string };
    client: { id: string | null; name: string };
    project: { id: string | null; name: string; color: string | null };
    task: { id: string | null; name: string };
    tags: Array<{ id: string | null; name: string }>;
}

export interface WeeklyView {
    kind: "weekly";
    group: "USER" | "PROJECT";
    days: WeeklyDay[];
    rows: WeeklyRow[];
    usersWithoutTime: Array<{ id: string | null; name: string; email: string }>;
    decimalFormat: boolean | null;
    trackTimeDownToSeconds: boolean | null;
}

export interface WeeklyDay {
    date: string;
    durationSeconds: number | null;
    amount: number | null;
}

export interface WeeklyRow {
    id: string | null;
    label: string;
    clientName: string | null;
    durationSeconds: number | null;
    amount: number | null;
    days: WeeklyDay[];
}

export interface AttendanceView {
    kind: "attendance";
    rows: AttendanceRow[];
    aggregates: AttendanceAggregates;
    chart: AttendanceChartRow[];
    paging: ReportsAppPaging;
}

export interface AttendanceRow {
    userId: string | null;
    userName: string;
    date: string | null;
    startTime: string | null;
    endTime: string | null;
    workSeconds: number | null;
    breakSeconds: number | null;
    capacitySeconds: number | null;
    remainingSeconds: number | null;
    overtimeSeconds: number | null;
    timeOffSeconds: number | null;
    running: boolean;
}

export interface AttendanceAggregates {
    users: number;
    workSeconds: number;
    breakSeconds: number;
    overtimeSeconds: number;
    timeOffSeconds: number;
    runningEntries: number;
}

export interface AttendanceChartRow {
    userId: string | null;
    label: string;
    workSeconds: number;
    overtimeSeconds: number;
}

export interface ExpenseView {
    kind: "expense";
    rows: ExpenseRow[];
    expenseTotals: {
        count: number | null;
        totalAmount: number | null;
        billableAmount: number | null;
    };
    chart: ExpenseChartRow[];
    paging: ReportsAppPaging;
}

export interface ExpenseRow {
    id: string | null;
    date: string | null;
    time: string | null;
    userName: string;
    projectName: string;
    projectColor: string | null;
    categoryName: string;
    notes: string;
    quantity: number | null;
    categoryUnit: string | null;
    amount: number | null;
    billable: boolean | null;
    invoiced: boolean;
    locked: boolean | null;
    receiptFileName: string | null;
}

export interface ExpenseChartRow {
    label: string;
    amount: number;
    aggregated: boolean;
}

export interface ReportsAppPaging {
    page: number;
    pageSize: number;
    returned: number;
    mayHaveNext: boolean;
}

export type ReportsAppView =
    | SummaryView
    | DetailedView
    | WeeklyView
    | AttendanceView
    | ExpenseView;

interface ReportsAppModelBase {
    version: typeof REPORTS_APP_MODEL_VERSION;
    query: ReportsAppQuery;
    totals: ReportsAppTotals;
    limits: ReportsAppLimits;
    warnings: string[];
}

export type ReportsAppModelV1 = ReportsAppModelBase &
    (
        | {
              sourceTool: "clockify_reports_summary";
              kind: "summary";
              view: SummaryView;
          }
        | {
              sourceTool: "clockify_reports_detailed";
              kind: "detailed";
              view: DetailedView;
          }
        | {
              sourceTool: "clockify_reports_weekly";
              kind: "weekly";
              view: WeeklyView;
          }
        | {
              sourceTool: "clockify_reports_attendance";
              kind: "attendance";
              view: AttendanceView;
          }
        | {
              sourceTool: "clockify_reports_expense";
              kind: "expense";
              view: ExpenseView;
          }
    );

export interface ReportsAppBaseInput {
    dateRangeStart: string;
    dateRangeEnd: string;
    dateRangeType?: string;
    timeZone?: string;
}

export interface ReportsAppPagedInput extends ReportsAppBaseInput {
    page?: number;
    pageSize?: number;
}
