import { Buffer } from "node:buffer";

import type { ClockifyApi } from "clockify-sdk-ts-115/requests";

import { REPORTS_APP_MODEL_BYTE_LIMIT } from "./constants.js";
import {
    BUDGET_WARNINGS,
    noteReportsAppBudget,
    type ReportsAppBudget,
} from "./model-budget.js";
import type {
    ReportsAppLimits,
    ReportsAppPagedInput,
    ReportsAppPaging,
    ReportsAppQuery,
    ReportsAppTotals,
} from "./model-types.js";
import { canonicalReportsAppPaging } from "./paging.js";

export const REPORT_ROW_LIMIT = 50;
export const CHART_ROW_LIMIT = 12;
export const DESCRIPTION_BYTE_LIMIT = 512;

const AMOUNT_TOTAL_LIMIT = 20;
const LABEL_BYTE_LIMIT = 256;

export function reportQuery(
    input: ReportsAppPagedInput,
    budget: ReportsAppBudget,
): ReportsAppQuery {
    return {
        dateRangeStart: boundedText(
            input.dateRangeStart,
            LABEL_BYTE_LIMIT,
            budget,
            BUDGET_WARNINGS.labels,
        ),
        dateRangeEnd: boundedText(
            input.dateRangeEnd,
            LABEL_BYTE_LIMIT,
            budget,
            BUDGET_WARNINGS.labels,
        ),
        ...(input.dateRangeType !== undefined
            ? {
                  dateRangeType: boundedText(
                      input.dateRangeType,
                      LABEL_BYTE_LIMIT,
                      budget,
                      BUDGET_WARNINGS.labels,
                  ),
              }
            : {}),
        ...(input.timeZone !== undefined
            ? {
                  timeZone: boundedText(
                      input.timeZone,
                      LABEL_BYTE_LIMIT,
                      budget,
                      BUDGET_WARNINGS.labels,
                  ),
              }
            : {}),
        ...(input.page !== undefined ? { page: positiveInteger(input.page, 1) } : {}),
        ...(input.pageSize !== undefined
            ? { pageSize: positiveInteger(input.pageSize, REPORT_ROW_LIMIT) }
            : {}),
    };
}

export function reportTotals(
    totals: Array<ClockifyApi.TimeEntryReportTotals | null> | undefined,
    budget: ReportsAppBudget,
): ReportsAppTotals {
    const total = totals?.find((candidate) => candidate !== null);
    const sourceAmounts = total?.amounts ?? [];
    if (sourceAmounts.length > AMOUNT_TOTAL_LIMIT) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.totals);
    }
    return {
        durationSeconds: finiteNumber(total?.totalTime),
        billableSeconds: finiteNumber(total?.totalBillableTime),
        entriesCount: finiteNumber(total?.entriesCount),
        amounts: sourceAmounts.slice(0, AMOUNT_TOTAL_LIMIT).flatMap((amount) => {
            const value = finiteNumber(amount.value);
            return value === null
                ? []
                : [{ type: displayText(amount.type, budget, "AMOUNT"), value }];
        }),
    };
}

export function requiredReportsAppPaging(
    input: ReportsAppPagedInput,
): ReturnType<typeof canonicalReportsAppPaging> {
    const paging = canonicalReportsAppPaging(input.page, input.pageSize);
    if (input.page !== paging.page || input.pageSize !== paging.pageSize) {
        throw new Error("report App rows require an exact 50-row paging window");
    }
    return paging;
}

export function reportPaging(
    page: number | undefined,
    pageSize: number,
    returned: number,
): ReportsAppPaging {
    return {
        page: positiveInteger(page, 1),
        pageSize,
        returned,
        mayHaveNext: returned >= pageSize,
    };
}

export function reportLimits(shown: number, available: number | null): ReportsAppLimits {
    const omitted = available === null ? null : Math.max(available - shown, 0);
    return {
        byteLimit: REPORTS_APP_MODEL_BYTE_LIMIT,
        shown,
        available,
        omitted,
        truncated: omitted !== null && omitted > 0,
    };
}

export function boundedText(
    value: string,
    maxBytes: number,
    budget: ReportsAppBudget,
    warning: string,
): string {
    if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
    noteReportsAppBudget(budget, warning);
    const suffix = "…";
    const contentLimit = Math.max(maxBytes - Buffer.byteLength(suffix, "utf8"), 0);
    let out = "";
    let bytes = 0;
    for (const character of value) {
        const size = Buffer.byteLength(character, "utf8");
        if (bytes + size > contentLimit) break;
        out += character;
        bytes += size;
    }
    return out + suffix;
}

export function optionalText(
    value: string | null | undefined,
    budget: ReportsAppBudget,
): string | null {
    return typeof value === "string" && value.length > 0
        ? boundedText(value, LABEL_BYTE_LIMIT, budget, BUDGET_WARNINGS.labels)
        : null;
}

export function displayText(
    value: string | null | undefined,
    budget: ReportsAppBudget,
    fallback = "",
): string {
    return optionalText(value, budget) ?? fallback;
}

export function optionalBoolean(value: boolean | undefined): boolean | null {
    return typeof value === "boolean" ? value : null;
}

export function finiteNumber(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
