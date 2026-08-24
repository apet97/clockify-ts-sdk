import { Buffer } from "node:buffer";

import { REPORTS_APP_MODEL_BYTE_LIMIT } from "./constants.js";
import type { ReportsAppModelV1, ReportsAppView } from "./model-types.js";

export type ReportsAppBudget = Set<string>;

export const BUDGET_WARNINGS = {
    labels: "Some labels or query fields were shortened to their UTF-8 byte limits.",
    descriptions: "Some descriptions or notes were shortened to their UTF-8 byte limits.",
    tags: "Additional tags were omitted from the bounded App view.",
    rows: "Rows beyond the bounded App limit were omitted.",
    chart: "Chart groups beyond the top 12 were combined into Other or omitted.",
    totals: "Additional amount totals were omitted from the bounded App view.",
    usersWithoutTime: "Additional users without time were omitted from the bounded App view.",
    optional:
        "Optional descriptions, notes, tags, secondary labels, or attendance timestamps were pruned before rows to keep the App view below 64 KiB.",
} as const;

export function createReportsAppBudget(): ReportsAppBudget {
    return new Set<string>();
}

export function noteReportsAppBudget(budget: ReportsAppBudget, warning: string): void {
    budget.add(warning);
}

export function fitReportsAppModel(
    model: ReportsAppModelV1,
    budget: ReportsAppBudget,
): ReportsAppModelV1 {
    for (;;) {
        syncBudgetReceipt(model, budget);
        if (reportsAppModelBytes(model) <= REPORTS_APP_MODEL_BYTE_LIMIT) return model;

        if (pruneOptional(model.view)) {
            noteReportsAppBudget(budget, BUDGET_WARNINGS.optional);
            continue;
        }
        if (model.totals.amounts.pop() !== undefined) {
            noteReportsAppBudget(budget, BUDGET_WARNINGS.totals);
            continue;
        }
        const ancillary = removeAncillary(model.view);
        if (ancillary === "chart") {
            noteReportsAppBudget(budget, BUDGET_WARNINGS.chart);
            continue;
        }
        if (ancillary === "usersWithoutTime") {
            noteReportsAppBudget(budget, BUDGET_WARNINGS.usersWithoutTime);
            continue;
        }
        if (model.view.rows.pop() !== undefined) {
            noteReportsAppBudget(budget, BUDGET_WARNINGS.rows);
            continue;
        }

        throw new Error("Reports App model could not be reduced below its 64 KiB budget.");
    }
}

export function reportsAppModelBytes(model: ReportsAppModelV1): number {
    return Buffer.byteLength(JSON.stringify(model), "utf8");
}

function syncBudgetReceipt(model: ReportsAppModelV1, budget: ReportsAppBudget): void {
    for (const warning of budget) {
        if (!model.warnings.includes(warning)) model.warnings.push(warning);
    }
    model.limits.shown = model.view.rows.length;
    model.limits.omitted =
        model.limits.available === null
            ? null
            : Math.max(model.limits.available - model.limits.shown, 0);
    model.limits.truncated =
        budget.size > 0 ||
        (model.limits.omitted !== null && model.limits.omitted > 0) ||
        (model.limits.available === null && pagedViewMayHaveMore(model.view));
}

function pagedViewMayHaveMore(view: ReportsAppView): boolean {
    return (
        (view.kind === "detailed" || view.kind === "attendance" || view.kind === "expense") &&
        view.paging.mayHaveNext
    );
}

function pruneOptional(view: ReportsAppView): boolean {
    switch (view.kind) {
        case "summary":
            return clearLastClientName(view.rows);
        case "detailed":
            for (let index = view.rows.length - 1; index >= 0; index -= 1) {
                const row = view.rows[index];
                if (!row) continue;
                if (row.tags.pop() !== undefined) return true;
                if (row.description !== "") {
                    row.description = "";
                    return true;
                }
                if (row.user.email !== "") {
                    row.user.email = "";
                    return true;
                }
            }
            return false;
        case "weekly":
            if (clearLastClientName(view.rows)) return true;
            for (let index = view.usersWithoutTime.length - 1; index >= 0; index -= 1) {
                const user = view.usersWithoutTime[index];
                if (user?.email) {
                    user.email = "";
                    return true;
                }
            }
            return false;
        case "attendance":
            for (let index = view.rows.length - 1; index >= 0; index -= 1) {
                const row = view.rows[index];
                if (!row) continue;
                if (row.endTime !== null) {
                    row.endTime = null;
                    return true;
                }
                if (row.startTime !== null) {
                    row.startTime = null;
                    return true;
                }
                if (row.date !== null) {
                    row.date = null;
                    return true;
                }
            }
            return false;
        case "expense":
            for (let index = view.rows.length - 1; index >= 0; index -= 1) {
                const row = view.rows[index];
                if (!row) continue;
                if (row.receiptFileName !== null) {
                    row.receiptFileName = null;
                    return true;
                }
                if (row.notes !== "") {
                    row.notes = "";
                    return true;
                }
                if (row.categoryUnit !== null) {
                    row.categoryUnit = null;
                    return true;
                }
            }
            return false;
    }
}

function clearLastClientName(rows: Array<{ clientName: string | null }>): boolean {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row && row.clientName !== null) {
            row.clientName = null;
            return true;
        }
    }
    return false;
}

function removeAncillary(
    view: ReportsAppView,
): "chart" | "usersWithoutTime" | undefined {
    switch (view.kind) {
        case "summary":
        case "attendance":
        case "expense":
            return view.chart.pop() === undefined ? undefined : "chart";
        case "weekly":
            return view.usersWithoutTime.pop() === undefined ? undefined : "usersWithoutTime";
        case "detailed":
            return undefined;
    }
}
