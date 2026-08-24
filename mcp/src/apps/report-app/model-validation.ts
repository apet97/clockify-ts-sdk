import {
    REPORTS_APP_MODEL_BYTE_LIMIT,
    REPORTS_APP_MODEL_VERSION,
} from "./constants.js";
import type { ReportsAppModelV1 } from "./model-types.js";

export function isReportsAppModel(value: unknown): value is ReportsAppModelV1 {
    const model = record(value);
    if (
        model === undefined ||
        model.version !== REPORTS_APP_MODEL_VERSION ||
        !isQuery(model.query) ||
        !isTotals(model.totals) ||
        !isLimits(model.limits) ||
        !arrayOf(model.warnings, isString)
    ) {
        return false;
    }

    switch (model.kind) {
        case "summary":
            return (
                model.sourceTool === "clockify_reports_summary" &&
                isSummaryView(model.view)
            );
        case "detailed":
            return (
                model.sourceTool === "clockify_reports_detailed" &&
                isDetailedView(model.view)
            );
        case "weekly":
            return model.sourceTool === "clockify_reports_weekly" && isWeeklyView(model.view);
        case "attendance":
            return (
                model.sourceTool === "clockify_reports_attendance" &&
                isAttendanceView(model.view)
            );
        case "expense":
            return model.sourceTool === "clockify_reports_expense" && isExpenseView(model.view);
        default:
            return false;
    }
}

function isQuery(value: unknown): boolean {
    const query = record(value);
    return (
        query !== undefined &&
        isString(query.dateRangeStart) &&
        isString(query.dateRangeEnd) &&
        optional(query.dateRangeType, isString) &&
        optional(query.timeZone, isString) &&
        optional(query.page, isPositiveInteger) &&
        optional(query.pageSize, isPositiveInteger)
    );
}

function isTotals(value: unknown): boolean {
    const totals = record(value);
    return (
        totals !== undefined &&
        nullable(totals.durationSeconds, isFiniteNumber) &&
        nullable(totals.billableSeconds, isFiniteNumber) &&
        nullable(totals.entriesCount, isFiniteNumber) &&
        arrayOf(totals.amounts, (amount) => {
            const item = record(amount);
            return item !== undefined && isString(item.type) && isFiniteNumber(item.value);
        })
    );
}

function isLimits(value: unknown): boolean {
    const limits = record(value);
    return (
        limits !== undefined &&
        limits.byteLimit === REPORTS_APP_MODEL_BYTE_LIMIT &&
        isNonNegativeInteger(limits.shown) &&
        nullable(limits.available, isNonNegativeInteger) &&
        nullable(limits.omitted, isNonNegativeInteger) &&
        typeof limits.truncated === "boolean"
    );
}

function isSummaryView(value: unknown): boolean {
    const view = record(value);
    return (
        view?.kind === "summary" &&
        arrayOf(view.groupBy, isString) &&
        nullable(view.topLevelAvailable, isFiniteNumber) &&
        arrayOf(view.rows, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                isString(row.key) &&
                nullable(row.id, isString) &&
                isString(row.label) &&
                arrayOf(row.path, isString) &&
                isNonNegativeInteger(row.depth) &&
                isString(row.groupType) &&
                nullable(row.clientName, isString) &&
                nullable(row.durationSeconds, isFiniteNumber) &&
                nullable(row.amount, isFiniteNumber) &&
                isNonNegativeInteger(row.childCount)
            );
        }) &&
        arrayOf(view.chart, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                isString(row.key) &&
                isString(row.label) &&
                nullable(row.durationSeconds, isFiniteNumber) &&
                nullable(row.amount, isFiniteNumber) &&
                typeof row.aggregated === "boolean"
            );
        })
    );
}

function isDetailedView(value: unknown): boolean {
    const view = record(value);
    return (
        view?.kind === "detailed" &&
        isPaging(view.paging) &&
        arrayOf(view.rows, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                nullable(row.id, isString) &&
                nullable(row.start, isString) &&
                nullable(row.end, isString) &&
                nullable(row.durationSeconds, isFiniteNumber) &&
                typeof row.running === "boolean" &&
                isString(row.description) &&
                nullable(row.billable, isBoolean) &&
                nullable(row.locked, isBoolean) &&
                isNamedEntity(row.user, true) &&
                isNamedEntity(row.client, false) &&
                isProject(row.project) &&
                isNamedEntity(row.task, false) &&
                arrayOf(row.tags, (tag) => isNamedEntity(tag, false))
            );
        })
    );
}

function isWeeklyView(value: unknown): boolean {
    const view = record(value);
    return (
        view?.kind === "weekly" &&
        (view.group === "USER" || view.group === "PROJECT") &&
        arrayOf(view.days, isWeeklyDay) &&
        view.days.length === 7 &&
        arrayOf(view.rows, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                nullable(row.id, isString) &&
                isString(row.label) &&
                nullable(row.clientName, isString) &&
                nullable(row.durationSeconds, isFiniteNumber) &&
                nullable(row.amount, isFiniteNumber) &&
                arrayOf(row.days, isWeeklyDay) &&
                row.days.length === 7
            );
        }) &&
        arrayOf(view.usersWithoutTime, (user) => isNamedEntity(user, true)) &&
        nullable(view.decimalFormat, isBoolean) &&
        nullable(view.trackTimeDownToSeconds, isBoolean)
    );
}

function isWeeklyDay(value: unknown): boolean {
    const day = record(value);
    return (
        day !== undefined &&
        isString(day.date) &&
        nullable(day.durationSeconds, isFiniteNumber) &&
        nullable(day.amount, isFiniteNumber)
    );
}

function isAttendanceView(value: unknown): boolean {
    const view = record(value);
    const aggregates = record(view?.aggregates);
    return (
        view?.kind === "attendance" &&
        isPaging(view.paging) &&
        aggregates !== undefined &&
        isNonNegativeInteger(aggregates.users) &&
        isFiniteNumber(aggregates.workSeconds) &&
        isFiniteNumber(aggregates.breakSeconds) &&
        isFiniteNumber(aggregates.overtimeSeconds) &&
        isFiniteNumber(aggregates.timeOffSeconds) &&
        isNonNegativeInteger(aggregates.runningEntries) &&
        arrayOf(view.rows, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                nullable(row.userId, isString) &&
                isString(row.userName) &&
                nullable(row.date, isString) &&
                nullable(row.startTime, isString) &&
                nullable(row.endTime, isString) &&
                nullable(row.workSeconds, isFiniteNumber) &&
                nullable(row.breakSeconds, isFiniteNumber) &&
                nullable(row.capacitySeconds, isFiniteNumber) &&
                nullable(row.remainingSeconds, isFiniteNumber) &&
                nullable(row.overtimeSeconds, isFiniteNumber) &&
                nullable(row.timeOffSeconds, isFiniteNumber) &&
                typeof row.running === "boolean"
            );
        }) &&
        arrayOf(view.chart, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                nullable(row.userId, isString) &&
                isString(row.label) &&
                isFiniteNumber(row.workSeconds) &&
                isFiniteNumber(row.overtimeSeconds)
            );
        })
    );
}

function isExpenseView(value: unknown): boolean {
    const view = record(value);
    const totals = record(view?.expenseTotals);
    return (
        view?.kind === "expense" &&
        isPaging(view.paging) &&
        totals !== undefined &&
        nullable(totals.count, isFiniteNumber) &&
        nullable(totals.totalAmount, isFiniteNumber) &&
        nullable(totals.billableAmount, isFiniteNumber) &&
        arrayOf(view.rows, isExpenseRow) &&
        arrayOf(view.chart, (value_) => {
            const row = record(value_);
            return (
                row !== undefined &&
                isString(row.label) &&
                isFiniteNumber(row.amount) &&
                typeof row.aggregated === "boolean"
            );
        })
    );
}

function isExpenseRow(value: unknown): boolean {
    const row = record(value);
    return (
        row !== undefined &&
        nullable(row.id, isString) &&
        nullable(row.date, isString) &&
        nullable(row.time, isString) &&
        isString(row.userName) &&
        isString(row.projectName) &&
        nullable(row.projectColor, isString) &&
        isString(row.categoryName) &&
        isString(row.notes) &&
        nullable(row.quantity, isFiniteNumber) &&
        nullable(row.categoryUnit, isString) &&
        nullable(row.amount, isFiniteNumber) &&
        nullable(row.billable, isBoolean) &&
        typeof row.invoiced === "boolean" &&
        nullable(row.locked, isBoolean) &&
        nullable(row.receiptFileName, isString)
    );
}

function isPaging(value: unknown): boolean {
    const paging = record(value);
    return (
        paging !== undefined &&
        isPositiveInteger(paging.page) &&
        isPositiveInteger(paging.pageSize) &&
        isNonNegativeInteger(paging.returned) &&
        typeof paging.mayHaveNext === "boolean"
    );
}

function isNamedEntity(value: unknown, emailRequired: boolean): boolean {
    const entity = record(value);
    return (
        entity !== undefined &&
        nullable(entity.id, isString) &&
        isString(entity.name) &&
        (!emailRequired || isString(entity.email))
    );
}

function isProject(value: unknown): boolean {
    const project = record(value);
    return (
        project !== undefined &&
        nullable(project.id, isString) &&
        isString(project.name) &&
        nullable(project.color, isString)
    );
}

function record(value: unknown): Record<string, unknown> | undefined {
    return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOf(value: unknown, predicate: (item: unknown) => boolean): value is unknown[] {
    return Array.isArray(value) && value.every(predicate);
}

function optional(value: unknown, predicate: (item: unknown) => boolean): boolean {
    return value === undefined || predicate(value);
}

function nullable(value: unknown, predicate: (item: unknown) => boolean): boolean {
    return value === null || predicate(value);
}

function isString(value: unknown): value is string {
    return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
    return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
    return isNonNegativeInteger(value) && value > 0;
}
