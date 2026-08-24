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

export function normalizeSummaryReport(
    data: ClockifyApi.SummaryReportResponse,
    input: ReportsAppBaseInput & { groups: ReportsGroup[] },
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceGroups = data.groupOne ?? [];
    const flattened = flattenSummaryGroups(sourceGroups, input.groups, budget);
    const rows = flattened.rows;
    if (flattened.count > rows.length) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    }
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_summary",
        kind: "summary",
        query: reportQuery(input, budget),
        totals: reportTotals(data.totals, budget),
        limits: reportLimits(rows.length, flattened.count),
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
): { rows: SummaryRow[]; count: number } {
    const rows: SummaryRow[] = [];
    let count = 0;
    const visit = (values: ClockifyApi.GroupOneDto[], depth: number, parentPath: string[]) => {
        for (const [index, value] of values.entries()) {
            count += 1;
            const label = displayText(value.name, budget, "(unnamed)");
            const path = [...parentPath, label];
            if (rows.length < SUMMARY_ROW_LIMIT) {
                const id = optionalText(value.id, budget);
                rows.push({
                    key: `${depth}:${id ?? path.join("/")}:${index}`,
                    id,
                    label,
                    path,
                    depth,
                    groupType: groupBy[depth] ?? groupBy[groupBy.length - 1] ?? "PROJECT",
                    clientName: optionalText(value.clientName, budget),
                    durationSeconds: finiteNumber(value.duration),
                    amount: finiteNumber(value.amount),
                    childCount: value.children?.length ?? 0,
                });
            }
            if (value.children && value.children.length > 0) {
                visit(value.children, depth + 1, path);
            }
        }
    };
    visit(groups, 0, []);
    return { rows, count };
}

function summaryChart(
    groups: ClockifyApi.GroupOneDto[],
    budget: ReportsAppBudget,
): SummaryChartRow[] {
    const sorted = groups
        .map((group, index) => ({
            key: optionalText(group.id, budget) ?? `group-${index}`,
            label: displayText(group.name, budget, "(unnamed)"),
            durationSeconds: finiteNumber(group.duration),
            amount: finiteNumber(group.amount),
            aggregated: false,
        }))
        .sort(
            (left, right) =>
                (right.durationSeconds ?? right.amount ?? 0) -
                (left.durationSeconds ?? left.amount ?? 0),
        );
    const shown = sorted.slice(0, CHART_ROW_LIMIT);
    const remainder = sorted.slice(CHART_ROW_LIMIT);
    if (remainder.length === 0) return shown;
    noteReportsAppBudget(budget, BUDGET_WARNINGS.chart);
    return [
        ...shown,
        {
            key: "other",
            label: "Other",
            durationSeconds: sumNullable(remainder.map((row) => row.durationSeconds)),
            amount: sumNullable(remainder.map((row) => row.amount)),
            aggregated: true,
        },
    ];
}

function sumNullable(values: Array<number | null>): number | null {
    const finite = values.filter((value): value is number => value !== null);
    return finite.length === 0 ? null : finite.reduce((total, value) => total + value, 0);
}
