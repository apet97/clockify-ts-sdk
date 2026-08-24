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
    boundedText,
    CHART_ROW_LIMIT,
    DESCRIPTION_BYTE_LIMIT,
    displayText,
    finiteNumber,
    optionalBoolean,
    optionalText,
    REPORT_ROW_LIMIT,
    reportLimits,
    reportPaging,
    reportQuery,
    requiredReportsAppPaging,
} from "./model-shared.js";
import type {
    ExpenseChartRow,
    ExpenseRow,
    ReportsAppModelV1,
    ReportsAppPagedInput,
} from "./model-types.js";

export function normalizeExpenseReport(
    data: ClockifyApi.ExpenseDetailedReportDtoV1,
    input: ReportsAppPagedInput,
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceRows = data.expenses ?? [];
    const appPaging = requiredReportsAppPaging(input);
    const pageRows = sourceRows.slice(0, REPORT_ROW_LIMIT);
    const rows = pageRows.map((row) => expenseRow(row, budget));
    if (sourceRows.length > rows.length) noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    const expenseTotals = {
        count: finiteNumber(data.totals?.expensesCount),
        totalAmount: finiteNumber(data.totals?.totalAmount),
        billableAmount: finiteNumber(data.totals?.totalAmountBillable),
    };
    const amounts: Array<{ type: string; value: number }> = [];
    if (expenseTotals.totalAmount !== null) {
        amounts.push({ type: "TOTAL", value: expenseTotals.totalAmount });
    }
    if (expenseTotals.billableAmount !== null) {
        amounts.push({ type: "BILLABLE", value: expenseTotals.billableAmount });
    }
    const available = expenseTotals.count;
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_expense",
        kind: "expense",
        query: reportQuery({ ...input, ...appPaging }, budget),
        totals: {
            durationSeconds: null,
            billableSeconds: null,
            entriesCount: expenseTotals.count,
            amounts,
        },
        limits: reportLimits(rows.length, available),
        warnings: [],
        view: {
            kind: "expense",
            rows,
            expenseTotals,
            chart: expenseChart(pageRows, budget),
            paging: reportPaging(appPaging.page, appPaging.pageSize, rows.length),
        },
    };
    return fitReportsAppModel(model, budget);
}

function expenseRow(row: ClockifyApi.ExpenseReportDtoV1, budget: ReportsAppBudget): ExpenseRow {
    return {
        id: optionalText(row.id, budget),
        date: optionalText(row.date, budget),
        time: optionalText(row.time, budget),
        userName: displayText(row.userName, budget),
        projectName: displayText(row.projectName, budget),
        projectColor: optionalText(row.projectColor, budget),
        categoryName: displayText(row.categoryName, budget, "(uncategorized)"),
        notes: boundedText(
            row.notes ?? "",
            DESCRIPTION_BYTE_LIMIT,
            budget,
            BUDGET_WARNINGS.descriptions,
        ),
        quantity: finiteNumber(row.quantity),
        categoryUnit: optionalText(row.categoryUnit, budget),
        amount: finiteNumber(row.amount),
        billable: optionalBoolean(row.billable),
        invoiced:
            row.invoicingInfo?.manuallyInvoiced === true ||
            optionalText(row.invoicingInfo?.invoiceId, budget) !== null,
        locked: optionalBoolean(row.locked),
        receiptFileName: optionalText(row.fileName, budget),
    };
}

function expenseChart(
    rows: ClockifyApi.ExpenseReportDtoV1[],
    budget: ReportsAppBudget,
): ExpenseChartRow[] {
    const byCategory = new Map<string, number>();
    for (const row of rows) {
        const label = displayText(row.categoryName, budget, "(uncategorized)");
        byCategory.set(label, (byCategory.get(label) ?? 0) + (finiteNumber(row.amount) ?? 0));
    }
    const sorted = [...byCategory.entries()]
        .map(([label, amount]) => ({ label, amount, aggregated: false }))
        .sort((left, right) => right.amount - left.amount);
    if (sorted.length <= CHART_ROW_LIMIT) return sorted;
    const shown = sorted.slice(0, CHART_ROW_LIMIT - 1);
    const remainder = sorted.slice(CHART_ROW_LIMIT - 1);
    noteReportsAppBudget(budget, BUDGET_WARNINGS.chart);
    return [
        ...shown,
        {
            label: "Other",
            amount: remainder.reduce((total, row) => total + row.amount, 0),
            aggregated: true,
        },
    ];
}
