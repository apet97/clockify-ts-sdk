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
    displayText,
    finiteNumber,
    optionalBoolean,
    optionalText,
    REPORT_ROW_LIMIT,
    reportLimits,
    reportQuery,
    reportTotals,
} from "./model-shared.js";
import type {
    ReportsAppBaseInput,
    ReportsAppModelV1,
    WeeklyDay,
    WeeklyRow,
} from "./model-types.js";

const USERS_WITHOUT_TIME_LIMIT = 25;

export function normalizeWeeklyReport(
    data: ClockifyApi.WeeklyReportResponse,
    input: ReportsAppBaseInput & { group: "USER" | "PROJECT" },
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceRows = data.groupOne ?? [];
    const days = exactWeekDays(data.totalsByDay ?? [], input.dateRangeStart, budget);
    const rows = sourceRows
        .slice(0, REPORT_ROW_LIMIT)
        .map((group) => weeklyRow(group, days.map((day) => day.date), budget));
    if (sourceRows.length > rows.length) noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    const sourceUsersWithoutTime = data.usersWithoutTime ?? [];
    const usersWithoutTime = sourceUsersWithoutTime
        .slice(0, USERS_WITHOUT_TIME_LIMIT)
        .map((user) => ({
            id: optionalText(user.id, budget),
            name: displayText(user.name, budget),
            email: displayText(user.email, budget),
        }));
    if (sourceUsersWithoutTime.length > usersWithoutTime.length) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.usersWithoutTime);
    }
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_weekly",
        kind: "weekly",
        query: reportQuery(input, budget),
        totals: reportTotals(data.totals, budget),
        limits: reportLimits(rows.length, sourceRows.length),
        warnings: [],
        view: {
            kind: "weekly",
            group: input.group,
            days,
            rows,
            usersWithoutTime,
            decimalFormat: optionalBoolean(data.decimalFormat),
            trackTimeDownToSeconds: optionalBoolean(data.trackTimeDownToSeconds),
        },
    };
    return fitReportsAppModel(model, budget);
}

function weeklyRow(
    group: ClockifyApi.GroupOneDto,
    dates: string[],
    budget: ReportsAppBudget,
): WeeklyRow {
    const sourceDays = new Map(
        (group.days ?? []).map((day) => [dateKey(day.date), weeklyDay(day, budget)]),
    );
    return {
        id: optionalText(group.id, budget),
        label: displayText(group.name, budget, "(unnamed)"),
        clientName: optionalText(group.clientName, budget),
        durationSeconds: finiteNumber(group.duration),
        amount: finiteNumber(group.amount),
        days: dates.map((date) =>
            sourceDays.get(dateKey(date)) ?? { date, durationSeconds: null, amount: null },
        ),
    };
}

function weeklyDay(day: ClockifyApi.DailyTotalDto, budget: ReportsAppBudget): WeeklyDay {
    return {
        date: displayText(day.date, budget),
        durationSeconds: finiteNumber(day.duration),
        amount: finiteNumber(day.amount),
    };
}

function exactWeekDays(
    days: ClockifyApi.DailyTotalDto[],
    rangeStart: string,
    budget: ReportsAppBudget,
): WeeklyDay[] {
    const byDate = new Map(days.map((day) => [dateKey(day.date), weeklyDay(day, budget)]));
    const dates = sevenDateKeys(rangeStart);
    return dates.map((date, index) => {
        const fromResponse = byDate.get(date);
        if (fromResponse !== undefined) return fromResponse;
        const positional = days[index];
        return positional === undefined
            ? { date, durationSeconds: null, amount: null }
            : weeklyDay(positional, budget);
    });
}

function sevenDateKeys(rangeStart: string): string[] {
    const start = dateKey(rangeStart);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(start)) {
        return Array.from({ length: 7 }, (_, index) => `day-${index + 1}`);
    }
    const [yearText, monthText, dayText] = start.split("-");
    const startMs = Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText));
    return Array.from({ length: 7 }, (_, index) =>
        new Date(startMs + index * 86_400_000).toISOString().slice(0, 10),
    );
}

function dateKey(value: string | undefined): string {
    return typeof value === "string" ? value.slice(0, 10) : "";
}
