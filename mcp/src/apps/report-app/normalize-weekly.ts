import { parseWeeklyDateTime } from "clockify-sdk-ts-115/dates";
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
const WEEKLY_DAY_MS = 86_400_000;
const WEEKLY_DAY_SCAN_LIMIT = 2_048;

export function normalizeWeeklyReport(
    data: ClockifyApi.WeeklyReportResponse,
    input: ReportsAppBaseInput & { group: "USER" | "PROJECT" },
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceRows = requireArray<ClockifyApi.GroupOneDto>(
        data.groupOne,
        "groupOne",
        REPORT_ROW_LIMIT,
    );
    const sourceDays = requireArray<ClockifyApi.DailyTotalDto>(
        data.totalsByDay,
        "totalsByDay",
        WEEKLY_DAY_SCAN_LIMIT,
    );
    const days = exactWeekDays(sourceDays, input.dateRangeStart, budget);
    const rows = sourceRows.slice(0, REPORT_ROW_LIMIT).map((group) => {
        assertGroup(group);
        return weeklyRow(
            group,
            days.map((day) => day.date),
            budget,
        );
    });
    if (sourceRows.length > rows.length) noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    const sourceUsersWithoutTime = requireArray<ClockifyApi.UserDto>(
        data.usersWithoutTime,
        "usersWithoutTime",
        USERS_WITHOUT_TIME_LIMIT,
    );
    const usersWithoutTime = sourceUsersWithoutTime
        .slice(0, USERS_WITHOUT_TIME_LIMIT)
        .map((user) => {
            assertUser(user);
            return {
                id: optionalText(user.id, budget),
                name: displayText(user.name, budget),
                email: displayText(user.email, budget),
            };
        });
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
    const sourceDays = new Map<string, WeeklyDay>();
    const requestedDates = new Set(dates);
    let ignoredDays = 0;
    const rawDays: unknown = group.days;
    if (rawDays !== undefined && !Array.isArray(rawDays)) {
        ignoredDays = 1;
    } else {
        const days = rawDays ?? [];
        const scanCount = Math.min(days.length, WEEKLY_DAY_SCAN_LIMIT);
        ignoredDays += days.length - scanCount;
        for (let index = 0; index < scanCount; index += 1) {
            const rawDay = days[index];
            if (!isRecord(rawDay)) {
                ignoredDays += 1;
                continue;
            }
            const day = rawDay as ClockifyApi.DailyTotalDto;
            const key = dateKey(typeof rawDay.date === "string" ? rawDay.date : undefined);
            if (key === "" || !requestedDates.has(key)) {
                ignoredDays += 1;
                continue;
            }
            if (sourceDays.has(key)) ignoredDays += 1;
            sourceDays.set(key, weeklyDay(day, key));
        }
    }
    if (ignoredDays > 0) noteReportsAppBudget(budget, BUDGET_WARNINGS.weeklyDays);
    return {
        id: optionalText(group.id, budget),
        label: displayText(group.name, budget, "(unnamed)"),
        clientName: optionalText(group.clientName, budget),
        durationSeconds: finiteNumber(group.duration),
        amount: finiteNumber(group.amount),
        days: dates.map(
            (date) =>
                sourceDays.get(dateKey(date)) ?? { date, durationSeconds: null, amount: null },
        ),
    };
}

function weeklyDay(day: ClockifyApi.DailyTotalDto, canonicalDate: string): WeeklyDay {
    return {
        date: canonicalDate,
        durationSeconds: finiteNumber(day.duration),
        amount: finiteNumber(day.amount),
    };
}

function exactWeekDays(
    days: ClockifyApi.DailyTotalDto[],
    rangeStart: string,
    budget: ReportsAppBudget,
): WeeklyDay[] {
    const dates = sevenDateKeys(rangeStart);
    const requestedDates = new Set(dates);
    const byDate = new Map<string, WeeklyDay>();
    const scanCount = Math.min(days.length, WEEKLY_DAY_SCAN_LIMIT);
    let ignored = days.length - scanCount;
    for (let index = 0; index < scanCount; index += 1) {
        const day = days[index];
        assertDailyTotal(day);
        const key = dateKey(typeof day.date === "string" ? day.date : undefined);
        if (!requestedDates.has(key)) {
            ignored += 1;
            continue;
        }
        if (byDate.has(key)) ignored += 1;
        byDate.set(key, weeklyDay(day, key));
    }
    if (ignored > 0) noteReportsAppBudget(budget, BUDGET_WARNINGS.weeklyDays);
    return dates.map((date) => byDate.get(date) ?? { date, durationSeconds: null, amount: null });
}

function sevenDateKeys(rangeStart: string): string[] {
    const parsed = parseWeeklyCalendarValue(rangeStart);
    if (parsed === undefined) {
        return Array.from({ length: 7 }, (_, index) => `day-${index + 1}`);
    }
    const dates: string[] = [];
    for (let index = 0; index < 7; index += 1) {
        const value = new Date((parsed.day + index) * WEEKLY_DAY_MS).toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
            return Array.from({ length: 7 }, (_, day) => `day-${day + 1}`);
        }
        dates.push(value);
    }
    return dates;
}

function dateKey(value: string | undefined): string {
    const parsed = parseWeeklyCalendarValue(value);
    return parsed === undefined ? "" : parsed.raw.slice(0, 10);
}

function parseWeeklyCalendarValue(value: unknown) {
    if (typeof value !== "string") return undefined;
    const parsed = parseWeeklyDateTime(value);
    if (parsed !== undefined) return parsed;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
    return parseWeeklyDateTime(`${value}T00:00:00`);
}

function requireArray<T>(value: unknown, label: string, scanLimit: number): T[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new TypeError(`Weekly report ${label} must be an array.`);
    }
    const checkCount = Math.min(value.length, scanLimit);
    for (let index = 0; index < checkCount; index += 1) {
        if (!Object.hasOwn(value, index)) {
            throw new TypeError(`Weekly report ${label} must not contain sparse entries.`);
        }
    }
    return value as T[];
}

function assertGroup(value: unknown): asserts value is ClockifyApi.GroupOneDto {
    if (!isRecord(value)) {
        throw new TypeError("Weekly report group entries must be objects.");
    }
    if (value.children !== undefined && !Array.isArray(value.children)) {
        throw new TypeError("Weekly report group children must be an array.");
    }
}

function assertUser(value: unknown): asserts value is ClockifyApi.UserDto {
    if (!isRecord(value)) {
        throw new TypeError("Weekly report usersWithoutTime entries must be objects.");
    }
}

function assertDailyTotal(value: unknown): asserts value is ClockifyApi.DailyTotalDto {
    if (!isRecord(value)) {
        throw new TypeError("Weekly report totalsByDay entries must be objects.");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
