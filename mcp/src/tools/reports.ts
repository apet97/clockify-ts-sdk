/**
 * Reports domain. Each report POSTs a date range plus a required filter and
 * returns aggregated totals or rows. The generated request types carry 25+
 * optional filter fields. The tools expose the always-required core and accept
 * only operation-specific, schema-validated optional fields.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ClockifyApi, ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import type { Context } from "../client.js";
import { defineTool, successResult } from "../result.js";

const DATE_RANGE_TYPES = [
    "ABSOLUTE",
    "TODAY",
    "YESTERDAY",
    "THIS_WEEK",
    "LAST_WEEK",
    "PAST_TWO_WEEKS",
    "THIS_MONTH",
    "LAST_MONTH",
    "THIS_YEAR",
    "LAST_YEAR",
] as const;
const REPORT_EXPORT_TYPES = ["JSON", "JSON_V1", "PDF", "CSV", "XLSX", "ZIP"] as const;
const CONTAINS_TYPES = ["CONTAINS", "DOES_NOT_CONTAIN", "CONTAINS_ONLY"] as const;
const ENTITY_STATUSES = ["ACTIVE", "ARCHIVED", "ALL"] as const;
const USER_STATUSES = ["ALL", "ACTIVE_WITH_PENDING", "ACTIVE", "PENDING", "INACTIVE"] as const;

const archivedFilterSchema = z
    .object({
        contains: z.enum(CONTAINS_TYPES).optional(),
        ids: z.array(z.string()).optional(),
        status: z.enum(ENTITY_STATUSES).optional(),
    })
    .strict();
const usersFilterSchema = z
    .object({
        contains: z.enum(CONTAINS_TYPES).optional(),
        ids: z.array(z.string()).optional(),
        status: z.enum(USER_STATUSES).optional(),
    })
    .strict();
const tagFilterSchema = archivedFilterSchema.extend({
    containedInTimeentry: z.enum(CONTAINS_TYPES).optional(),
});
const customFieldFilterSchema = z
    .object({
        id: z.string().optional(),
        isEmpty: z.boolean().optional(),
        numberCondition: z.enum(["EQUAL", "GREATER_THAN", "LESS_THAN"]).optional(),
        type: z
            .enum(["TXT", "NUMBER", "DROPDOWN_SINGLE", "DROPDOWN_MULTIPLE", "CHECKBOX", "LINK"])
            .optional(),
        value: z
            .union([
                z.string(),
                z.number(),
                z.boolean(),
                z.array(z.unknown()),
                z.record(z.unknown()),
            ])
            .optional(),
    })
    .strict();

const commonReportExtraSchema = z
    .object({
        amountShown: z.enum(["EARNED", "COST", "PROFIT", "HIDE_AMOUNT", "EXPORT"]).optional(),
        amounts: z.array(z.enum(["EARNED", "COST", "PROFIT", "HIDE_AMOUNT", "EXPORT"])).optional(),
        approvalState: z.enum(["APPROVED", "UNAPPROVED", "ALL"]).optional(),
        archived: z.boolean().optional(),
        billable: z.boolean().optional(),
        clients: archivedFilterSchema.optional(),
        currency: archivedFilterSchema.optional(),
        customFields: z.array(customFieldFilterSchema).optional(),
        dateFormat: z.string().optional(),
        description: z.string().optional(),
        invoicingState: z.enum(["INVOICED", "UNINVOICED", "ALL"]).optional(),
        projects: archivedFilterSchema.optional(),
        rounding: z.boolean().optional(),
        sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional(),
        tags: tagFilterSchema.optional(),
        tasks: archivedFilterSchema.optional(),
        timeFormat: z.string().optional(),
        timeZone: z.string().optional(),
        userCustomFields: z.array(customFieldFilterSchema).optional(),
        userGroups: usersFilterSchema.optional(),
        userLocale: z.string().optional(),
        users: usersFilterSchema.optional(),
        weekStart: z
            .enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])
            .optional(),
        withoutDescription: z.boolean().optional(),
        zoomLevel: z.enum(["WEEK", "MONTH", "YEAR"]).optional(),
    })
    .strict();
const attendanceReportExtraSchema = commonReportExtraSchema.omit({ userCustomFields: true });

const expenseReportExtraSchema = z
    .object({
        approvalState: z.enum(["APPROVED", "UNAPPROVED", "ALL"]).optional(),
        billable: z.boolean().optional(),
        categories: archivedFilterSchema.optional(),
        clients: archivedFilterSchema.optional(),
        currency: archivedFilterSchema.optional(),
        invoicingState: z.enum(["INVOICED", "UNINVOICED", "ALL"]).optional(),
        note: z.string().optional(),
        projects: archivedFilterSchema.optional(),
        sortColumn: z.enum(["ID", "PROJECT", "USER", "CATEGORY", "DATE", "AMOUNT"]).optional(),
        sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional(),
        tasks: archivedFilterSchema.optional(),
        timeZone: z.string().optional(),
        userGroups: usersFilterSchema.optional(),
        userLocale: z.string().optional(),
        users: usersFilterSchema.optional(),
        weekStart: z
            .enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])
            .optional(),
        withoutNote: z.boolean().optional(),
        zoomLevel: z.enum(["WEEK", "MONTH", "YEAR"]).optional(),
    })
    .strict();

const reportBase = {
    dateRangeStart: z.string().describe("ISO start, e.g. 2026-06-01T00:00:00Z"),
    dateRangeEnd: z.string().describe("ISO end, e.g. 2026-06-30T23:59:59Z"),
    dateRangeType: z.enum(DATE_RANGE_TYPES).optional(),
    exportType: z.enum(REPORT_EXPORT_TYPES).optional(),
};
const reportCore = {
    ...reportBase,
    extra: commonReportExtraSchema.optional().describe("Validated optional report fields"),
};

const summaryFilterSchema = z
    .object({
        groups: z
            .array(
                z.enum(["CLIENT", "PROJECT", "USER", "WEEK", "DATE", "MONTH", "TIMEENTRY", "TASK"]),
            )
            .min(1)
            .max(3),
        sortColumn: z.enum(["GROUP", "DURATION", "AMOUNT", "EARNED", "COST", "PROFIT"]).optional(),
        summaryChartType: z.enum(["BILLABILITY", "PROJECT"]).optional(),
    })
    .strict();
const detailedFilterSchema = z
    .object({
        auditFilter: z
            .object({
                duration: z.number().optional(),
                durationShorter: z.boolean().optional(),
                withoutProject: z.boolean().optional(),
                withoutTask: z.boolean().optional(),
            })
            .strict()
            .optional(),
        options: z
            .object({ totals: z.enum(["CALCULATE", "EXCLUDE"]).optional() })
            .strict()
            .optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).optional(),
        sortColumn: z
            .enum([
                "ID",
                "DESCRIPTION",
                "USER",
                "DURATION",
                "DATE",
                "ZONED_DATE",
                "NATURAL",
                "USER_DATE",
            ])
            .optional(),
    })
    .strict();
const weeklyFilterSchema = z
    .object({ group: z.enum(["USER", "PROJECT"]), subgroup: z.literal("TIME") })
    .strict();
const compareFilterSchema = z
    .object({
        filtrationType: z.enum(["EXACTLY", "LARGER_THAN", "SMALLER_THAN"]),
        value: z.string(),
    })
    .strict();
const attendanceFilterSchema = z
    .object({
        breakFilters: z.array(compareFilterSchema).optional(),
        capacityFilters: z.array(compareFilterSchema).optional(),
        endFilters: z.array(compareFilterSchema).optional(),
        hasTimeOff: z.boolean().optional(),
        overtimeFilters: z.array(compareFilterSchema).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).optional(),
        sortColumn: z
            .enum([
                "USER",
                "DATE",
                "START",
                "END",
                "BREAK",
                "WORK",
                "CAPACITY",
                "OVERTIME",
                "TIME_OFF",
            ])
            .optional(),
        startFilters: z.array(compareFilterSchema).optional(),
        workFilters: z.array(compareFilterSchema).optional(),
    })
    .strict();

type CommonReportExtraInput = z.infer<typeof commonReportExtraSchema>;
type ExpenseReportExtraInput = z.infer<typeof expenseReportExtraSchema>;
type CommonReportFields = Omit<
    ClockifyRequestBody<ClockifyApi.SummaryReportsRequest>,
    "dateRangeEnd" | "dateRangeStart" | "summaryFilter"
>;
type ExpenseReportFields = Omit<
    ClockifyRequestBody<ClockifyApi.GenerateDetailedReportV1ExpenseReportRequest>,
    "dateRangeEnd" | "dateRangeStart"
>;
type AttendanceReportFields = Omit<
    ClockifyRequestBody<ClockifyApi.AttendanceReportsRequest>,
    "attendanceFilter" | "dateRangeEnd" | "dateRangeStart"
>;

function archivedFilter(
    value: z.infer<typeof archivedFilterSchema>,
): ClockifyApi.ContainsArchivedFilter {
    return {
        ...(value.contains !== undefined ? { contains: value.contains } : {}),
        ...(value.ids !== undefined ? { ids: value.ids } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
    };
}

function usersFilter(value: z.infer<typeof usersFilterSchema>): ClockifyApi.ContainsUsersFilter {
    return {
        ...(value.contains !== undefined ? { contains: value.contains } : {}),
        ...(value.ids !== undefined ? { ids: value.ids } : {}),
        ...(value.status !== undefined ? { status: value.status } : {}),
    };
}

function tagFilter(value: z.infer<typeof tagFilterSchema>): ClockifyApi.ContainsTagFilter {
    return {
        ...archivedFilter(value),
        ...(value.containedInTimeentry !== undefined
            ? { containedInTimeentry: value.containedInTimeentry }
            : {}),
    };
}

function customFieldFilter(
    value: z.infer<typeof customFieldFilterSchema>,
): ClockifyApi.CustomFieldFilter {
    return {
        ...(value.id !== undefined ? { id: value.id } : {}),
        ...(value.isEmpty !== undefined ? { isEmpty: value.isEmpty } : {}),
        ...(value.numberCondition !== undefined ? { numberCondition: value.numberCondition } : {}),
        ...(value.type !== undefined ? { type: value.type } : {}),
        ...(value.value !== undefined ? { value: value.value } : {}),
    };
}

function commonReportFields(extra: CommonReportExtraInput | undefined): CommonReportFields {
    if (!extra) return {};
    return {
        ...(extra.amountShown !== undefined ? { amountShown: extra.amountShown } : {}),
        ...(extra.amounts !== undefined ? { amounts: extra.amounts } : {}),
        ...(extra.approvalState !== undefined ? { approvalState: extra.approvalState } : {}),
        ...(extra.archived !== undefined ? { archived: extra.archived } : {}),
        ...(extra.billable !== undefined ? { billable: extra.billable } : {}),
        ...(extra.clients !== undefined ? { clients: archivedFilter(extra.clients) } : {}),
        ...(extra.currency !== undefined ? { currency: archivedFilter(extra.currency) } : {}),
        ...(extra.customFields !== undefined
            ? { customFields: extra.customFields.map(customFieldFilter) }
            : {}),
        ...(extra.dateFormat !== undefined ? { dateFormat: extra.dateFormat } : {}),
        ...(extra.description !== undefined ? { description: extra.description } : {}),
        ...(extra.invoicingState !== undefined ? { invoicingState: extra.invoicingState } : {}),
        ...(extra.projects !== undefined ? { projects: archivedFilter(extra.projects) } : {}),
        ...(extra.rounding !== undefined ? { rounding: extra.rounding } : {}),
        ...(extra.sortOrder !== undefined ? { sortOrder: extra.sortOrder } : {}),
        ...(extra.tags !== undefined ? { tags: tagFilter(extra.tags) } : {}),
        ...(extra.tasks !== undefined ? { tasks: archivedFilter(extra.tasks) } : {}),
        ...(extra.timeFormat !== undefined ? { timeFormat: extra.timeFormat } : {}),
        ...(extra.timeZone !== undefined ? { timeZone: extra.timeZone } : {}),
        ...(extra.userCustomFields !== undefined
            ? { userCustomFields: extra.userCustomFields.map(customFieldFilter) }
            : {}),
        ...(extra.userGroups !== undefined ? { userGroups: usersFilter(extra.userGroups) } : {}),
        ...(extra.userLocale !== undefined ? { userLocale: extra.userLocale } : {}),
        ...(extra.users !== undefined ? { users: usersFilter(extra.users) } : {}),
        ...(extra.weekStart !== undefined ? { weekStart: extra.weekStart } : {}),
        ...(extra.withoutDescription !== undefined
            ? { withoutDescription: extra.withoutDescription }
            : {}),
        ...(extra.zoomLevel !== undefined ? { zoomLevel: extra.zoomLevel } : {}),
    };
}

function expenseReportFields(extra: ExpenseReportExtraInput | undefined): ExpenseReportFields {
    if (!extra) return {};
    return {
        ...(extra.approvalState !== undefined ? { approvalState: extra.approvalState } : {}),
        ...(extra.billable !== undefined ? { billable: extra.billable } : {}),
        ...(extra.categories !== undefined ? { categories: archivedFilter(extra.categories) } : {}),
        ...(extra.clients !== undefined ? { clients: archivedFilter(extra.clients) } : {}),
        ...(extra.currency !== undefined ? { currency: archivedFilter(extra.currency) } : {}),
        ...(extra.invoicingState !== undefined ? { invoicingState: extra.invoicingState } : {}),
        ...(extra.note !== undefined ? { note: extra.note } : {}),
        ...(extra.projects !== undefined ? { projects: archivedFilter(extra.projects) } : {}),
        ...(extra.sortColumn !== undefined ? { sortColumn: extra.sortColumn } : {}),
        ...(extra.sortOrder !== undefined ? { sortOrder: extra.sortOrder } : {}),
        ...(extra.tasks !== undefined ? { tasks: archivedFilter(extra.tasks) } : {}),
        ...(extra.timeZone !== undefined ? { timeZone: extra.timeZone } : {}),
        ...(extra.userGroups !== undefined ? { userGroups: usersFilter(extra.userGroups) } : {}),
        ...(extra.userLocale !== undefined ? { userLocale: extra.userLocale } : {}),
        ...(extra.users !== undefined ? { users: usersFilter(extra.users) } : {}),
        ...(extra.weekStart !== undefined ? { weekStart: extra.weekStart } : {}),
        ...(extra.withoutNote !== undefined ? { withoutNote: extra.withoutNote } : {}),
        ...(extra.zoomLevel !== undefined ? { zoomLevel: extra.zoomLevel } : {}),
    };
}

function attendanceReportFields(
    extra: z.infer<typeof attendanceReportExtraSchema> | undefined,
): AttendanceReportFields {
    const { userCustomFields: _unsupported, ...fields } = commonReportFields(extra);
    return fields;
}

function summaryFilter(value: z.infer<typeof summaryFilterSchema>): ClockifyApi.SummaryFilter {
    return {
        groups: value.groups,
        ...(value.sortColumn !== undefined ? { sortColumn: value.sortColumn } : {}),
        ...(value.summaryChartType !== undefined
            ? { summaryChartType: value.summaryChartType }
            : {}),
    };
}

function detailedFilter(value: z.infer<typeof detailedFilterSchema>): ClockifyApi.DetailedFilter {
    return {
        ...(value.auditFilter !== undefined
            ? {
                  auditFilter: {
                      ...(value.auditFilter.duration !== undefined
                          ? { duration: value.auditFilter.duration }
                          : {}),
                      ...(value.auditFilter.durationShorter !== undefined
                          ? { durationShorter: value.auditFilter.durationShorter }
                          : {}),
                      ...(value.auditFilter.withoutProject !== undefined
                          ? { withoutProject: value.auditFilter.withoutProject }
                          : {}),
                      ...(value.auditFilter.withoutTask !== undefined
                          ? { withoutTask: value.auditFilter.withoutTask }
                          : {}),
                  },
              }
            : {}),
        ...(value.options !== undefined
            ? {
                  options: {
                      ...(value.options.totals !== undefined
                          ? { totals: value.options.totals }
                          : {}),
                  },
              }
            : {}),
        ...(value.page !== undefined ? { page: value.page } : {}),
        ...(value.pageSize !== undefined ? { pageSize: value.pageSize } : {}),
        ...(value.sortColumn !== undefined ? { sortColumn: value.sortColumn } : {}),
    };
}

function attendanceFilter(
    value: z.infer<typeof attendanceFilterSchema>,
): ClockifyApi.AttendanceFilter {
    return {
        ...(value.breakFilters !== undefined ? { breakFilters: value.breakFilters } : {}),
        ...(value.capacityFilters !== undefined ? { capacityFilters: value.capacityFilters } : {}),
        ...(value.endFilters !== undefined ? { endFilters: value.endFilters } : {}),
        ...(value.hasTimeOff !== undefined ? { hasTimeOff: value.hasTimeOff } : {}),
        ...(value.overtimeFilters !== undefined ? { overtimeFilters: value.overtimeFilters } : {}),
        ...(value.page !== undefined ? { page: value.page } : {}),
        ...(value.pageSize !== undefined ? { pageSize: value.pageSize } : {}),
        ...(value.sortColumn !== undefined ? { sortColumn: value.sortColumn } : {}),
        ...(value.startFilters !== undefined ? { startFilters: value.startFilters } : {}),
        ...(value.workFilters !== undefined ? { workFilters: value.workFilters } : {}),
    };
}

export function registerReportsTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_reports_summary",
        {
            title: "Summary report",
            description:
                "Run a summary report over a date range, grouped per summaryFilter.groups (e.g. PROJECT, CLIENT).",
            inputSchema: {
                ...reportCore,
                summaryFilter: summaryFilterSchema.describe(
                    'e.g. { "groups": ["PROJECT", "TASK"] }',
                ),
            },
            idempotent: true,
        },
        async (args) => {
            const request: ClockifyApi.SummaryReportsRequest = {
                ...commonReportFields(args.extra),
                ...(args.dateRangeType !== undefined ? { dateRangeType: args.dateRangeType } : {}),
                ...(args.exportType !== undefined ? { exportType: args.exportType } : {}),
                workspaceId: ctx.workspaceId,
                dateRangeStart: args.dateRangeStart,
                dateRangeEnd: args.dateRangeEnd,
                summaryFilter: summaryFilter(args.summaryFilter),
            };
            const data = await ctx.client.reports.summary(request);
            return successResult("clockify_reports_summary", data, undefined, {
                entity: "report",
                next: [
                    {
                        tool: "clockify_reports_detailed",
                        reason: "Drill into the time entries behind these totals.",
                    },
                ],
            });
        },
        "Confirm the date range and that summaryFilter.groups is set.",
    );

    defineTool(
        server,
        "clockify_reports_detailed",
        {
            title: "Detailed report",
            description:
                "Run a detailed report listing individual time entries over a date range, paginated via detailedFilter.",
            inputSchema: {
                ...reportCore,
                detailedFilter: detailedFilterSchema.describe('e.g. { "page": 1, "pageSize": 50 }'),
            },
            idempotent: true,
        },
        async (args) => {
            const request: ClockifyApi.DetailedReportsRequest = {
                ...commonReportFields(args.extra),
                ...(args.dateRangeType !== undefined ? { dateRangeType: args.dateRangeType } : {}),
                ...(args.exportType !== undefined ? { exportType: args.exportType } : {}),
                workspaceId: ctx.workspaceId,
                dateRangeStart: args.dateRangeStart,
                dateRangeEnd: args.dateRangeEnd,
                detailedFilter: detailedFilter(args.detailedFilter),
            };
            const data = await ctx.client.reports.detailed(request);
            return successResult("clockify_reports_detailed", data, undefined, {
                entity: "report",
            });
        },
        "Confirm the date range and that detailedFilter is set.",
    );

    defineTool(
        server,
        "clockify_reports_weekly",
        {
            title: "Weekly report",
            description:
                "Run a weekly report aggregating tracked time per week over a date range, grouped per weeklyFilter.",
            inputSchema: {
                ...reportCore,
                weeklyFilter: weeklyFilterSchema.describe(
                    'e.g. { "group": "USER", "subgroup": "TIME" }',
                ),
            },
            idempotent: true,
        },
        async (args) => {
            const request: ClockifyApi.WeeklyReportsRequest = {
                ...commonReportFields(args.extra),
                ...(args.dateRangeType !== undefined ? { dateRangeType: args.dateRangeType } : {}),
                ...(args.exportType !== undefined ? { exportType: args.exportType } : {}),
                workspaceId: ctx.workspaceId,
                dateRangeStart: args.dateRangeStart,
                dateRangeEnd: args.dateRangeEnd,
                weeklyFilter: args.weeklyFilter,
            };
            const data = await ctx.client.reports.weekly(request);
            return successResult("clockify_reports_weekly", data, undefined, { entity: "report" });
        },
        "Confirm the date range and that weeklyFilter is set.",
    );

    defineTool(
        server,
        "clockify_reports_attendance",
        {
            title: "Attendance report",
            description:
                "Run an attendance report of clock-in/out and break activity over a date range, scoped by attendanceFilter.",
            inputSchema: {
                ...reportBase,
                extra: attendanceReportExtraSchema
                    .optional()
                    .describe("Validated optional attendance-report fields"),
                attendanceFilter: attendanceFilterSchema.describe(
                    'e.g. { "page": 1, "pageSize": 50, "hasTimeOff": true }',
                ),
            },
            idempotent: true,
        },
        async (args) => {
            const request: ClockifyApi.AttendanceReportsRequest = {
                ...attendanceReportFields(args.extra),
                ...(args.dateRangeType !== undefined ? { dateRangeType: args.dateRangeType } : {}),
                ...(args.exportType !== undefined ? { exportType: args.exportType } : {}),
                workspaceId: ctx.workspaceId,
                dateRangeStart: args.dateRangeStart,
                dateRangeEnd: args.dateRangeEnd,
                attendanceFilter: attendanceFilter(args.attendanceFilter),
            };
            const data = await ctx.client.reports.attendance(request);
            return successResult("clockify_reports_attendance", data, undefined, {
                entity: "report",
            });
        },
        "Confirm the date range and that attendanceFilter is set.",
    );

    defineTool(
        server,
        "clockify_reports_expense",
        {
            title: "Expense detailed report",
            description:
                "Generate a detailed expenses report over a date range (served from the reports host). Pass approvalState, billable, clients, projects, categories, etc. via `extra`; exportType defaults to JSON.",
            inputSchema: {
                ...reportBase,
                page: z.number().int().min(1).optional(),
                pageSize: z.number().int().min(1).max(200).optional(),
                extra: expenseReportExtraSchema
                    .optional()
                    .describe("Validated optional expense-report fields"),
            },
            idempotent: true,
        },
        async (args) => {
            const request: ClockifyApi.GenerateDetailedReportV1ExpenseReportRequest = {
                ...expenseReportFields(args.extra),
                ...(args.dateRangeType !== undefined ? { dateRangeType: args.dateRangeType } : {}),
                ...(args.exportType !== undefined ? { exportType: args.exportType } : {}),
                ...(args.page !== undefined ? { page: args.page } : {}),
                ...(args.pageSize !== undefined ? { pageSize: args.pageSize } : {}),
                workspaceId: ctx.workspaceId,
                dateRangeStart: args.dateRangeStart,
                dateRangeEnd: args.dateRangeEnd,
            };
            const data = await ctx.client.expenseReport.generateDetailedReportV1(request);
            return successResult("clockify_reports_expense", data, undefined, { entity: "report" });
        },
        "Confirm the date range; the expenses report uses the reports host.",
    );
}
