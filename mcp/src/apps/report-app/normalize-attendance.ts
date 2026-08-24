import type { ClockifyApi } from "clockify-sdk-ts-115/requests";

import { REPORTS_APP_MODEL_VERSION } from "./constants.js";
import {
    BUDGET_WARNINGS,
    createReportsAppBudget,
    fitReportsAppModel,
    noteReportsAppBudget,
    type ReportsAppBudget,
} from "./model-budget.js";
import {
    CHART_ROW_LIMIT,
    displayText,
    finiteNumber,
    optionalText,
    REPORT_ROW_LIMIT,
    reportLimits,
    reportPaging,
    reportQuery,
    requiredReportsAppPaging,
} from "./model-shared.js";
import type {
    AttendanceAggregates,
    AttendanceChartRow,
    AttendanceRow,
    ReportsAppModelV1,
    ReportsAppPagedInput,
} from "./model-types.js";

export function normalizeAttendanceReport(
    data: ClockifyApi.AttendanceReportResponse,
    input: ReportsAppPagedInput,
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceRows = data.entities ?? [];
    const appPaging = requiredReportsAppPaging(input);
    const pageRows = sourceRows.slice(0, REPORT_ROW_LIMIT);
    const rows = pageRows.map((row) => attendanceRow(row, budget));
    if (sourceRows.length > rows.length) noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    const aggregates = attendanceAggregates(pageRows);
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_attendance",
        kind: "attendance",
        query: reportQuery({ ...input, ...appPaging }, budget),
        totals: {
            durationSeconds: aggregates.workSeconds,
            billableSeconds: null,
            entriesCount: null,
            amounts: [],
        },
        limits: reportLimits(rows.length, null),
        warnings: [],
        view: {
            kind: "attendance",
            rows,
            aggregates,
            chart: attendanceChart(pageRows, budget),
            paging: reportPaging(appPaging.page, appPaging.pageSize, rows.length),
        },
    };
    return fitReportsAppModel(model, budget);
}

function attendanceRow(
    row: ClockifyApi.AttendanceDto,
    budget: ReportsAppBudget,
): AttendanceRow {
    return {
        userId: optionalText(row.userId, budget),
        userName: displayText(row.userName, budget, "(unnamed)"),
        date: optionalText(row.date, budget),
        startTime: optionalText(row.startTime, budget),
        endTime: optionalText(row.endTime, budget),
        workSeconds: finiteNumber(row.totalDuration),
        breakSeconds: finiteNumber(row.break),
        capacitySeconds: finiteNumber(row.capacity),
        remainingSeconds: finiteNumber(row.remainingCapacity),
        overtimeSeconds: finiteNumber(row.overtime),
        timeOffSeconds: finiteNumber(row.timeOff),
        running: row.hasRunningEntry === true,
    };
}

function attendanceAggregates(rows: ClockifyApi.AttendanceDto[]): AttendanceAggregates {
    return {
        users: new Set(rows.flatMap((row) => (row.userId ? [row.userId] : []))).size,
        workSeconds: sumNumbers(rows.map((row) => row.totalDuration)),
        breakSeconds: sumNumbers(rows.map((row) => row.break)),
        overtimeSeconds: sumNumbers(rows.map((row) => row.overtime)),
        timeOffSeconds: sumNumbers(rows.map((row) => row.timeOff)),
        runningEntries: rows.filter((row) => row.hasRunningEntry === true).length,
    };
}

function sumNumbers(values: Array<number | null | undefined>): number {
    return values.reduce<number>((total, value) => total + (finiteNumber(value) ?? 0), 0);
}

function attendanceChart(
    rows: ClockifyApi.AttendanceDto[],
    budget: ReportsAppBudget,
): AttendanceChartRow[] {
    const byUser = new Map<
        string,
        { userId: string | null; label: string; workSeconds: number; overtimeSeconds: number }
    >();
    for (const row of rows) {
        const userId = optionalText(row.userId, budget);
        const label = displayText(row.userName, budget, "(unnamed)");
        const key = userId ?? label;
        const current = byUser.get(key) ?? {
            userId,
            label,
            workSeconds: 0,
            overtimeSeconds: 0,
        };
        current.workSeconds += finiteNumber(row.totalDuration) ?? 0;
        current.overtimeSeconds += finiteNumber(row.overtime) ?? 0;
        byUser.set(key, current);
    }
    const sorted = [...byUser.values()].sort(
        (left, right) => right.workSeconds - left.workSeconds,
    );
    if (sorted.length > CHART_ROW_LIMIT) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.chart);
    }
    return sorted.slice(0, CHART_ROW_LIMIT);
}
