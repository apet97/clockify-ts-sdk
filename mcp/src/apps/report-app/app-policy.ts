import type { ReportsAppModelV1 } from "./model-types.js";
import { canonicalReportsAppPaging } from "./paging.js";
import type { ReportsMessageIntent } from "./renderer.js";

export const REPORTS_APP_DIRECT_TOOLS = [
    "clockify_reports_summary",
    "clockify_reports_detailed",
    "clockify_reports_weekly",
    "clockify_reports_attendance",
    "clockify_reports_expense",
] as const;

export type ReportsAppSourceTool = (typeof REPORTS_APP_DIRECT_TOOLS)[number];

export function isReportsAppDirectTool(value: string): value is ReportsAppSourceTool {
    return REPORTS_APP_DIRECT_TOOLS.some((tool) => tool === value);
}

export function boundedReportArguments(
    name: ReportsAppSourceTool,
    input: Record<string, unknown>,
): Record<string, unknown> {
    const args = structuredClone(input);
    switch (name) {
        case "clockify_reports_detailed": {
            const filter = record(args.detailedFilter);
            args.detailedFilter = {
                ...filter,
                ...canonicalReportsAppPaging(filter.page, filter.pageSize),
            };
            break;
        }
        case "clockify_reports_attendance": {
            const filter = record(args.attendanceFilter);
            args.attendanceFilter = {
                ...filter,
                ...canonicalReportsAppPaging(filter.page, filter.pageSize),
            };
            break;
        }
        case "clockify_reports_expense":
            Object.assign(args, canonicalReportsAppPaging(args.page, args.pageSize));
            break;
        case "clockify_reports_summary":
        case "clockify_reports_weekly":
            break;
    }
    return args;
}

export function reportsMessagePrompt(
    intent: ReportsMessageIntent,
    model: ReportsAppModelV1,
): string {
    const range = `${model.query.dateRangeStart} to ${model.query.dateRangeEnd}`;
    const prompts: Record<ReportsMessageIntent, string> = {
        dates: `Help me rerun this ${model.kind} Clockify report for a different date range. The current exact range is ${range}. Ask me for the replacement range and preserve the current compatible filters.`,
        filters: `Help me change the complex filters for this ${model.kind} Clockify report over ${range}. Keep the report read-only.`,
        share: `Help me save or share this ${model.kind} Clockify report for ${range}. Use the governed shared-report workflow and preview every write before confirmation.`,
        switch: `Help me switch from this ${model.kind} Clockify report over ${range} to another report type. Ask for any inputs that are not compatible rather than guessing.`,
    };
    return prompts[intent];
}

function record(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
