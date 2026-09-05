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
    reportLimits,
    reportQuery,
    reportTotals,
} from "./model-shared.js";
import type {
    ReportsAppBaseInput,
    ReportsAppModelV1,
    ReportsGroup,
    SummaryChartRow,
    SummaryRow,
} from "./model-types.js";

const SUMMARY_ROW_LIMIT = 100;
const SUMMARY_NODE_LIMIT = 2_048;
const SUMMARY_DEPTH_LIMIT = 32;
const SUMMARY_CHART_SCAN_LIMIT = 2_048;

export function normalizeSummaryReport(
    data: ClockifyApi.SummaryReportResponse,
    input: ReportsAppBaseInput & { groups: ReportsGroup[] },
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceGroups = requireGroups(data.groupOne);
    const flattened = flattenSummaryGroups(sourceGroups, input.groups, budget);
    const rows = flattened.rows;
    if (flattened.count > rows.length) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    }
    if (!flattened.complete) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.summaryTraversal);
    }
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_summary",
        kind: "summary",
        query: reportQuery(input, budget),
        totals: reportTotals(data.totals, budget),
        limits: reportLimits(rows.length, flattened.complete ? flattened.count : null),
        warnings: [],
        view: {
            kind: "summary",
            groupBy: [...input.groups],
            topLevelAvailable: finiteNumber(data.groupTotals?.groupOneTotalCount),
            rows,
            chart: summaryChart(sourceGroups, budget),
        },
    };
    return fitReportsAppModel(model, budget);
}

function flattenSummaryGroups(
    groups: ClockifyApi.GroupOneDto[],
    groupBy: ReportsGroup[],
    budget: ReportsAppBudget,
): { rows: SummaryRow[]; count: number; complete: boolean } {
    const rows: SummaryRow[] = [];
    let count = 0;
    let complete = true;
    interface Frame {
        values: ClockifyApi.GroupOneDto[];
        index: number;
        depth: number;
        parentPath: string[];
    }
    const stack: Frame[] = [{ values: groups, index: 0, depth: 0, parentPath: [] }];

    while (stack.length > 0) {
        const frame = stack.at(-1);
        if (frame === undefined) break;
        if (frame.index >= frame.values.length) {
            stack.pop();
            continue;
        }
        if (count >= SUMMARY_NODE_LIMIT) {
            complete = false;
            break;
        }
        const index = frame.index;
        frame.index += 1;
        const value = frame.values[index];
        assertGroup(value);
        count += 1;

        const label = displayText(value.name, budget, "(unnamed)");
        const path = [...frame.parentPath, label];
        if (rows.length < SUMMARY_ROW_LIMIT) {
            const id = optionalText(value.id, budget);
            rows.push({
                key: `${frame.depth}:${id ?? path.join("/")}:${index}`,
                id,
                label,
                path,
                depth: frame.depth,
                groupType: groupBy[frame.depth] ?? groupBy[groupBy.length - 1] ?? "PROJECT",
                clientName: optionalText(value.clientName, budget),
                durationSeconds: finiteNumber(value.duration),
                amount: finiteNumber(value.amount),
                childCount: value.children?.length ?? 0,
            });
        }

        const children = value.children;
        if (children === undefined || children.length === 0) continue;
        if (frame.depth >= SUMMARY_DEPTH_LIMIT) {
            complete = false;
            continue;
        }
        stack.push({
            values: children,
            index: 0,
            depth: frame.depth + 1,
            parentPath: path,
        });
    }
    return { rows, count, complete };
}

function requireGroups(value: unknown): ClockifyApi.GroupOneDto[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new TypeError("Summary report groupOne must be an array.");
    }
    return value as ClockifyApi.GroupOneDto[];
}

function assertGroup(value: unknown): asserts value is ClockifyApi.GroupOneDto {
    if (!isRecord(value)) {
        throw new TypeError("Summary report group entries must be objects.");
    }
    if (value.children !== undefined && !Array.isArray(value.children)) {
        throw new TypeError("Summary report group children must be an array.");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summaryChart(
    groups: ClockifyApi.GroupOneDto[],
    budget: ReportsAppBudget,
): SummaryChartRow[] {
    const top: SummaryChartRow[] = [];
    let otherDuration: number | null | undefined;
    let otherAmount: number | null | undefined;
    let otherCount = 0;
    let unknownOther = false;
    const scanCount = Math.min(groups.length, SUMMARY_CHART_SCAN_LIMIT);
    for (let index = 0; index < scanCount; index += 1) {
        const group = groups[index];
        assertGroup(group);
        const row: SummaryChartRow = {
            key: optionalText(group.id, budget) ?? `group-${index}`,
            label: displayText(group.name, budget, "(unnamed)"),
            durationSeconds: finiteNumber(group.duration),
            amount: finiteNumber(group.amount),
            aggregated: false,
        };
        if (top.length < CHART_ROW_LIMIT) {
            insertChartRow(top, row);
            continue;
        }
        const last = top[top.length - 1];
        if (last !== undefined && chartScore(row) > chartScore(last)) {
            top.pop();
            otherDuration = addNullable(otherDuration, last.durationSeconds);
            otherAmount = addNullable(otherAmount, last.amount);
            otherCount += 1;
            insertChartRow(top, row);
        } else {
            otherDuration = addNullable(otherDuration, row.durationSeconds);
            otherAmount = addNullable(otherAmount, row.amount);
            otherCount += 1;
        }
    }
    if (groups.length > scanCount) {
        otherCount += groups.length - scanCount;
        unknownOther = true;
    }
    if (otherCount === 0) return top;
    noteReportsAppBudget(budget, BUDGET_WARNINGS.chart);
    return [
        ...top,
        {
            key: "other",
            label: "Other",
            durationSeconds: unknownOther ? null : (otherDuration ?? null),
            amount: unknownOther ? null : (otherAmount ?? null),
            aggregated: true,
        },
    ];
}

function insertChartRow(rows: SummaryChartRow[], row: SummaryChartRow): void {
    const index = rows.findIndex((candidate) => chartScore(row) > chartScore(candidate));
    if (index < 0) rows.push(row);
    else rows.splice(index, 0, row);
}

function chartScore(row: SummaryChartRow): number {
    return row.durationSeconds ?? row.amount ?? 0;
}

function addNullable(
    total: number | null | undefined,
    value: number | null,
): number | null | undefined {
    if (total === null || value === null) return null;
    const next = (total ?? 0) + value;
    return Number.isFinite(next) ? next : null;
}
