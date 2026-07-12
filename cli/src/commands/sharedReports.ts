/**
 * `clk115 shared-reports {list,view,create,update,delete}` — the shareable
 * (public-link) report definitions surfaced under the reports host. `list`,
 * `create`, `update`, and `delete` are workspace-scoped; `view` is keyed only
 * by the shared-report id (NO workspace scope — the generated method carries
 * the reports-host baseUrl) and returns the rendered report payload. Mirrors
 * the seven P1-7 MCP `clockify_shared_reports_*` tools.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";
import { z } from "zod";

import { printObject, type OutputRecord } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

/**
 * The `view` route returns a binary response (the rendered report). Decode
 * it as text and parse JSON when possible so the CLI prints structured data;
 * fall back to a small descriptor for non-JSON export types.
 */
async function readReportBody(response: {
    arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<OutputRecord> {
    const text = new TextDecoder().decode(await response.arrayBuffer());
    if (!text) return { body: "" };
    try {
        const parsed: unknown = JSON.parse(text);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed as OutputRecord;
        }
        return { body: parsed };
    } catch {
        return { body: text };
    }
}

const SHARED_REPORT_TYPES = [
    "SUMMARY",
    "DETAILED",
    "WEEKLY",
    "EXPENSE_DETAILED",
    "INVOICE_TIME",
    "KIOSK_PIN_LIST",
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "INVOICE_AMOUNT_LIST",
    "INVOICE_DETAILED",
    "TIMEOFF_DETAILED",
    "TIMEOFF_HOLIDAY",
    "TIMEOFF_BALANCE",
    "EXPENSE_SUMMARY",
] as const;

const SHARED_REPORT_EXPORT_TYPES = ["JSON_V1", "JSON", "CSV", "XLSX", "PDF"] as const;
const SUMMARY_GROUPS = [
    "CLIENT",
    "PROJECT",
    "TASK",
    "DATE",
    "WEEK",
    "MONTH",
    "TIMEENTRY",
    "USER",
    "TAG",
] as const;

const nonEmptyStringSchema = z
    .string()
    .refine((value) => value.trim() !== "", "must be a non-empty string.");
const dateStringSchema = nonEmptyStringSchema.refine(
    (value) => !Number.isNaN(Date.parse(value)),
    "must be a valid date string.",
);
const upperCaseString = (value: unknown): unknown =>
    typeof value === "string" ? value.toUpperCase() : value;
const sharedReportTypeSchema = z.preprocess(upperCaseString, z.enum(SHARED_REPORT_TYPES));
const sharedReportExportTypeSchema = z.preprocess(
    upperCaseString,
    z.enum(SHARED_REPORT_EXPORT_TYPES),
);
const openObjectSchema = z.record(z.unknown());
const sharedUsersFilterSchema = z
    .object({
        contains: z.enum(["CONTAINS", "DOES_NOT_CONTAIN", "CONTAINS_ONLY"]).optional(),
        ids: z.array(z.string()).optional(),
        status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
    })
    .strict();
const sharedAttendanceFilterSchema = z
    .object({
        page: z.number().finite().int().optional(),
        pageSize: z.number().finite().int().optional(),
        users: sharedUsersFilterSchema.optional(),
    })
    .strict();
const sharedDetailedFilterSchema = z
    .object({
        auditFilter: openObjectSchema.optional(),
        options: openObjectSchema.optional(),
        page: z.number().finite().int().optional(),
        pageSize: z.number().finite().int().optional(),
        sortColumn: nonEmptyStringSchema.optional(),
        sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional(),
    })
    .strict();
const sharedSummaryFilterSchema = z
    .object({
        groups: z.array(z.enum(SUMMARY_GROUPS)).min(1).max(3),
        sortColumn: nonEmptyStringSchema.optional(),
    })
    .strict();
const sharedWeeklyFilterSchema = z
    .object({
        group: z.enum(["PROJECT", "USER"]),
        subgroup: z.literal("TIME"),
    })
    .strict();
const sharedReportFilterSchema = z
    .object({
        attendanceFilter: sharedAttendanceFilterSchema.optional(),
        dateRangeEnd: dateStringSchema,
        dateRangeStart: dateStringSchema,
        detailedFilter: sharedDetailedFilterSchema.optional(),
        exportType: sharedReportExportTypeSchema,
        summaryFilter: sharedSummaryFilterSchema.optional(),
        weeklyFilter: sharedWeeklyFilterSchema.optional(),
    })
    .strict();
const sharedReportBodyShape = {
    filter: sharedReportFilterSchema,
    isPublic: z.boolean().optional(),
    name: nonEmptyStringSchema,
    type: sharedReportTypeSchema,
} as const;
const sharedReportCreateBodySchema = z.object(sharedReportBodyShape).strict();
const sharedReportUpdateBodySchema = z.object(sharedReportBodyShape).strict();

type ValidatedSharedReportBody = z.infer<typeof sharedReportCreateBodySchema>;
type SharedReportBody = ClockifyRequestBody<ClockifyApi.SharedReportCreate>;

function toSharedReportFilter(
    value: z.infer<typeof sharedReportFilterSchema>,
): ClockifyApi.SharedReportFilter {
    return {
        dateRangeEnd: value.dateRangeEnd,
        dateRangeStart: value.dateRangeStart,
        exportType: value.exportType,
        ...(value.attendanceFilter !== undefined
            ? {
                  attendanceFilter: {
                      ...(value.attendanceFilter.page !== undefined
                          ? { page: value.attendanceFilter.page }
                          : {}),
                      ...(value.attendanceFilter.pageSize !== undefined
                          ? { pageSize: value.attendanceFilter.pageSize }
                          : {}),
                      ...(value.attendanceFilter.users !== undefined
                          ? { users: value.attendanceFilter.users }
                          : {}),
                  },
              }
            : {}),
        ...(value.detailedFilter !== undefined
            ? {
                  detailedFilter: {
                      ...(value.detailedFilter.auditFilter !== undefined
                          ? { auditFilter: value.detailedFilter.auditFilter }
                          : {}),
                      ...(value.detailedFilter.options !== undefined
                          ? { options: value.detailedFilter.options }
                          : {}),
                      ...(value.detailedFilter.page !== undefined
                          ? { page: value.detailedFilter.page }
                          : {}),
                      ...(value.detailedFilter.pageSize !== undefined
                          ? { pageSize: value.detailedFilter.pageSize }
                          : {}),
                      ...(value.detailedFilter.sortColumn !== undefined
                          ? { sortColumn: value.detailedFilter.sortColumn }
                          : {}),
                      ...(value.detailedFilter.sortOrder !== undefined
                          ? { sortOrder: value.detailedFilter.sortOrder }
                          : {}),
                  },
              }
            : {}),
        ...(value.summaryFilter !== undefined
            ? {
                  summaryFilter: {
                      groups: value.summaryFilter.groups,
                      ...(value.summaryFilter.sortColumn !== undefined
                          ? { sortColumn: value.summaryFilter.sortColumn }
                          : {}),
                  },
              }
            : {}),
        ...(value.weeklyFilter !== undefined
            ? {
                  weeklyFilter: {
                      group: value.weeklyFilter.group,
                      subgroup: value.weeklyFilter.subgroup,
                  },
              }
            : {}),
    };
}

function toSharedReportBody(value: ValidatedSharedReportBody): SharedReportBody {
    return {
        filter: toSharedReportFilter(value.filter),
        name: value.name,
        type: value.type,
        ...(value.isPublic !== undefined ? { isPublic: value.isPublic } : {}),
    };
}

function parseFilterJson(raw: unknown): unknown {
    if (typeof raw !== "string") {
        throw new Error("--filter must be a JSON object.");
    }
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(
            `--filter must be a JSON object, e.g. '{"dateRangeStart":"…","dateRangeEnd":"…"}'`,
        );
    }
}

function schemaIssueLabel(issue: z.ZodIssue, operation: string): string {
    const [root, ...path] = issue.path;
    if (root === "filter") {
        return path.length > 0 ? `--filter ${path.join(".")}` : "--filter";
    }
    if (root === "name") return "--name";
    if (root === "type") return "--type";
    return operation;
}

function sharedReportValidationError(
    error: z.ZodError,
    operation: string,
    rawType: unknown,
): Error {
    const invalidTypeIssue = error.issues.find(
        (issue) => issue.path[0] === "type" && issue.code === z.ZodIssueCode.invalid_enum_value,
    );
    if (invalidTypeIssue !== undefined) {
        return new Error(
            `Unknown --type "${String(rawType)}". Use one of: ${SHARED_REPORT_TYPES.join(", ")}.`,
        );
    }
    const issue = error.issues[0];
    if (issue === undefined) return new Error(`${operation}: invalid request.`);
    if (
        issue.path.length === 1 &&
        issue.path[0] === "filter" &&
        issue.code === z.ZodIssueCode.invalid_type &&
        issue.expected === "object"
    ) {
        return new Error("--filter must be a JSON object.");
    }
    const label = schemaIssueLabel(issue, operation);
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
        const fieldKind = issue.path[0] === "filter" ? "filter field(s)" : "field(s)";
        return new Error(`${label} has unknown ${fieldKind}: ${issue.keys.join(", ")}.`);
    }
    return new Error(`${label}: ${issue.message}`);
}

function parseSharedReportBody(
    schema: typeof sharedReportCreateBodySchema,
    opts: Record<string, unknown>,
    operation: string,
): SharedReportBody {
    const candidate = {
        name: opts.name,
        type: opts.type,
        filter: parseFilterJson(opts.filter),
        ...(opts.public === true ? { isPublic: true } : {}),
    };
    const result = schema.safeParse(candidate);
    if (!result.success) {
        throw sharedReportValidationError(result.error, operation, opts.type);
    }
    return toSharedReportBody(result.data);
}

export const registerSharedReportsCommand: Registrar = (program, services) => {
    const shared = program
        .command("shared-reports")
        .description("Manage shared (public-link) reports.");

    shared
        .command("list")
        .description("List the workspace's shared (public-link) reports.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const result = await client.sharedReports.list({ workspaceId });
            printObject(result, output);
        });

    shared
        .command("view")
        .argument("<id>", "Shared-report ID.")
        .option(
            "--export-type <type>",
            "Export type: JSON_V1, JSON, CSV, XLSX, or PDF (default JSON_V1).",
        )
        .description(
            "View a shared report's rendered data by ID (reports host; not workspace-scoped).",
        )
        .action(async function (this: Command, id: string, opts) {
            // `view` is NOT workspace-scoped — pass only the shared-report id.
            const { client, output } = await resolveContext(this, services);
            const exportType = (
                opts.exportType ? String(opts.exportType).toUpperCase() : "JSON_V1"
            ) as NonNullable<ClockifyApi.ViewSharedReportsRequest["exportType"]>;
            const response = await client.sharedReports.view({
                sharedReportId: id,
                exportType,
            });
            printObject(await readReportBody(response), output);
        });

    shared
        .command("create")
        .requiredOption("--name <text>", "Shared-report name.")
        .requiredOption("--type <type>", `Report type: ${SHARED_REPORT_TYPES.join(", ")}.`)
        .requiredOption("--filter <json>", "Report filter object as a JSON string.")
        .option("--public", "Make the report publicly accessible.")
        .description("Create a shared (public-link) report.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.SharedReportCreate> =
                parseSharedReportBody(sharedReportCreateBodySchema, opts, "shared-reports.create");
            const request: ClockifyApi.SharedReportCreate = { workspaceId, body };
            const created = (await client.sharedReports.create(request)) as {
                id?: string;
                name?: string;
            };
            const data = { id: created.id ?? "", name: created.name ?? opts.name };
            printReceipt(
                {
                    ok: true,
                    action: "shared-reports.create",
                    entity: "shared_report",
                    ids: { sharedReportId: data.id },
                    data,
                    changed: { created: [{ type: "shared_report", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: "clk115 shared-reports list --json",
                            reason: "Verify the report appears.",
                        },
                    ],
                },
                output,
            );
        });

    shared
        .command("update")
        .argument("<id>", "Shared-report ID.")
        .requiredOption("--name <text>", "Shared-report name.")
        .requiredOption("--type <type>", `Report type: ${SHARED_REPORT_TYPES.join(", ")}.`)
        .requiredOption("--filter <json>", "Report filter object as a JSON string (full replace).")
        .option("--public", "Make the report publicly accessible.")
        .description("Replace a shared report by ID (full replace of name, type, and filter).")
        .action(async function (this: Command, id: string, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.UpdateSharedReportsRequest> =
                parseSharedReportBody(sharedReportUpdateBodySchema, opts, "shared-reports.update");
            const request: ClockifyApi.UpdateSharedReportsRequest = {
                workspaceId,
                sharedReportId: id,
                body,
            };
            const updated = (await client.sharedReports.update(request)) as {
                id?: string;
                name?: string;
            };
            const data = { id: updated.id ?? id, name: updated.name ?? opts.name };
            printReceipt(
                {
                    ok: true,
                    action: "shared-reports.update",
                    entity: "shared_report",
                    ids: { sharedReportId: data.id },
                    data,
                    changed: { updated: [{ type: "shared_report", id: data.id, name: data.name }] },
                    next: [
                        {
                            command: "clk115 shared-reports list --json",
                            reason: "Verify the update.",
                        },
                    ],
                },
                output,
            );
        });

    shared
        .command("delete")
        .argument("<id>", "Shared-report ID.")
        .description("Delete a shared report by ID.")
        .action(async function (this: Command, id: string) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            await client.sharedReports.delete({ workspaceId, sharedReportId: id });
            printReceipt(
                {
                    ok: true,
                    action: "shared-reports.delete",
                    entity: "shared_report",
                    ids: { sharedReportId: id },
                    data: { id, deleted: true, message: `deleted shared report ${id}` },
                    changed: { deleted: [{ type: "shared_report", id }] },
                    next: [
                        {
                            command: "clk115 shared-reports list --json",
                            reason: "Verify the report no longer appears.",
                        },
                    ],
                },
                output,
            );
        });
};
