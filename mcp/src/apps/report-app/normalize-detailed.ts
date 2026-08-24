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
    DESCRIPTION_BYTE_LIMIT,
    displayText,
    finiteNumber,
    optionalBoolean,
    optionalText,
    REPORT_ROW_LIMIT,
    reportLimits,
    reportPaging,
    reportQuery,
    reportTotals,
    requiredReportsAppPaging,
} from "./model-shared.js";
import type {
    DetailedRow,
    ReportsAppModelV1,
    ReportsAppPagedInput,
} from "./model-types.js";

const TAG_LIMIT = 20;

export function normalizeDetailedReport(
    data: ClockifyApi.DetailedReportResponse,
    input: ReportsAppPagedInput,
): ReportsAppModelV1 {
    const budget = createReportsAppBudget();
    const sourceRows = data.timeEntries ?? data.timeentries ?? [];
    const appPaging = requiredReportsAppPaging(input);
    const pageRows = sourceRows.slice(0, REPORT_ROW_LIMIT);
    const rows = pageRows.map((entry) => detailedRow(entry, budget));
    if (sourceRows.length > rows.length) noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
    const totals = reportTotals(data.totals, budget);
    const available = totals.entriesCount;
    const model: ReportsAppModelV1 = {
        version: REPORTS_APP_MODEL_VERSION,
        sourceTool: "clockify_reports_detailed",
        kind: "detailed",
        query: reportQuery({ ...input, ...appPaging }, budget),
        totals,
        limits: reportLimits(rows.length, available),
        warnings: [],
        view: {
            kind: "detailed",
            rows,
            paging: reportPaging(appPaging.page, appPaging.pageSize, rows.length),
        },
    };
    return fitReportsAppModel(model, budget);
}

function detailedRow(entry: ClockifyApi.TimeEntryDto, budget: ReportsAppBudget): DetailedRow {
    const start = optionalText(entry.timeInterval?.start, budget);
    const end = optionalText(entry.timeInterval?.end, budget);
    if ((entry.tags?.length ?? 0) > TAG_LIMIT) {
        noteReportsAppBudget(budget, BUDGET_WARNINGS.tags);
    }
    return {
        id: optionalText(entry.id, budget) ?? optionalText(entry.get_id, budget),
        start,
        end,
        durationSeconds: finiteNumber(entry.timeInterval?.duration),
        running: start !== null && end === null,
        description: boundedText(
            entry.description ?? "",
            DESCRIPTION_BYTE_LIMIT,
            budget,
            BUDGET_WARNINGS.descriptions,
        ),
        billable: optionalBoolean(entry.billable),
        locked: optionalBoolean(entry.locked),
        user: {
            id: optionalText(entry.userId, budget),
            name: displayText(entry.userName, budget),
            email: displayText(entry.userEmail, budget),
        },
        client: {
            id: optionalText(entry.clientId, budget),
            name: displayText(entry.clientName, budget),
        },
        project: {
            id: optionalText(entry.projectId, budget),
            name: displayText(entry.projectName, budget),
            color: optionalText(entry.projectColor, budget),
        },
        task: {
            id: optionalText(entry.taskId, budget),
            name: displayText(entry.taskName, budget),
        },
        tags: (entry.tags ?? []).slice(0, TAG_LIMIT).map((tag) => ({
            id: optionalText(tag.id, budget),
            name: displayText(tag.name, budget),
        })),
    };
}
