/**
 * `clk115 shared-reports {list,view,create,update,delete}` — the shareable
 * (public-link) report definitions surfaced under the reports host. `list`,
 * `create`, `update`, and `delete` are workspace-scoped; `view` is keyed only
 * by the shared-report id (NO workspace scope — the generated method carries
 * the reports-host baseUrl) and returns the rendered report payload.
 */
import { type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";
import { z } from "zod";

import { printObject, printRecords, type OutputRecord } from "../output.js";
import { printReceipt } from "../receipt.js";

import { resolveBaseContext, resolveContext } from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

/**
 * The `view` route wraps every payload in a binary response. Supported CLI
 * formats are text-safe, so decode once and parse JSON when possible.
 */
async function readReportBody(response: {
    arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<OutputRecord> {
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
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

const SHARED_REPORT_FILTER_EXPORT_TYPES = ["JSON_V1", "JSON", "CSV", "XLSX", "PDF"] as const;
const SHARED_REPORT_VIEW_EXPORT_TYPES = ["JSON_V1", "JSON", "CSV"] as const;
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
] as const satisfies readonly ClockifyApi.SummaryGroup[];

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
    z.enum(SHARED_REPORT_FILTER_EXPORT_TYPES),
);
const openObjectSchema = z.record(z.string(), z.unknown());
// zod 4 words this "Invalid input: expected int, received number". That does
// classify as invalid_request (it contains "invalid"), but "int" is jargon in a
// message a CLI user reads, and zod 3 said "integer". Pin our own wording so the
// migration is invisible here; "provide" is the invalid_request token.
const INT_MESSAGE = { error: "provide a whole integer" } as const;
const sharedUsersFilterSchema = z
    .object({
        contains: z.enum(["CONTAINS", "DOES_NOT_CONTAIN", "CONTAINS_ONLY"]).optional(),
        ids: z.array(z.string()).optional(),
        status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).optional(),
    })
    .strict();
const sharedAttendanceFilterSchema = z
    .object({
        page: z.number().int(INT_MESSAGE).optional(),
        pageSize: z.number().int(INT_MESSAGE).optional(),
        users: sharedUsersFilterSchema.optional(),
    })
    .strict();
const sharedDetailedFilterSchema = z
    .object({
        auditFilter: openObjectSchema.optional(),
        options: openObjectSchema.optional(),
        page: z.number().int(INT_MESSAGE).optional(),
        pageSize: z.number().int(INT_MESSAGE).optional(),
        sortColumn: nonEmptyStringSchema.optional(),
        sortOrder: z.enum(["ASCENDING", "DESCENDING"]).optional(),
    })
    .strict();
const sharedSummaryFilterSchema = z
    .object({
        // Explicit messages, not zod's defaults: zod 4 words size failures as
        // "Too small/Too big: expected array to have <=3 items", which matches
        // NO token in errorCodeForMessage and so classifies as the catch-all
        // `error` with its maintainer-facing recovery. zod 3's wording happened
        // to match. This is the only constraint in this schema whose message
        // reaches a user (sharedReportValidationError is the CLI's only site
        // that surfaces a raw zod issue message), so it is the only one that
        // needs pinning. "provide" is the invalid_request token.
        groups: z
            .array(z.enum(SUMMARY_GROUPS))
            .min(1, { error: `provide 1-3 of: ${SUMMARY_GROUPS.join(", ")}` })
            .max(3, { error: `provide at most 3 of: ${SUMMARY_GROUPS.join(", ")}` }),
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

function schemaIssueLabel(issue: z.core.$ZodIssue, operation: string): string {
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
        // zod 4 folded `invalid_enum_value` into `invalid_value`: a rejected
        // z.enum member now reports code "invalid_value" carrying the allowed
        // `values`. Matching on the path + code is enough here because `type`
        // is the only enum field in this schema.
        (issue) => issue.path[0] === "type" && issue.code === "invalid_value",
    );
    if (invalidTypeIssue !== undefined) {
        return new Error(
            `Unknown --type "${String(rawType)}". Provide one of: ${SHARED_REPORT_TYPES.join(", ")}.`,
        );
    }
    const issue = error.issues[0];
    if (issue === undefined) return new Error(`${operation}: invalid request.`);
    if (
        issue.path.length === 1 &&
        issue.path[0] === "filter" &&
        issue.code === "invalid_type" &&
        issue.expected === "object"
    ) {
        return new Error("--filter must be a JSON object.");
    }
    const label = schemaIssueLabel(issue, operation);
    if (issue.code === "unrecognized_keys") {
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
        // `!== undefined`, not `=== true`: `--no-public` must be able to turn a
        // public link OFF on this full-replace PUT. Neither flag given leaves
        // `opts.public` undefined, so `isPublic` stays omitted as before.
        ...(opts.public !== undefined ? { isPublic: opts.public } : {}),
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

    leafCommand(shared, "list", "read")
        .description("List the workspace's shared (public-link) reports.")
        .action(async function (this: Command) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const response = await client.sharedReports.list({ workspaceId });
            const rows = (response.reports ?? []).map((report) => ({
                id: report.id ?? "",
                name: report.name ?? "",
                type: report.type ?? "",
                isPublic: report.isPublic === true,
                link: report.link ?? "",
            }));
            printRecords(rows, output);
        });

    leafCommand(shared, "view", "read")
        .argument("<id>", "Shared-report ID.")
        .option(
            "--export-type <type>",
            "Text-safe export type: JSON_V1, JSON, or CSV (default JSON_V1).",
        )
        .description(
            "View a shared report's rendered data by ID (reports host; not workspace-scoped).",
        )
        .action(async function (this: Command, id: string, opts) {
            // `view` is NOT workspace-scoped — pass only the shared-report id,
            // and do not demand a configured workspace to run (resolveBaseContext,
            // as used by `api`, `status`, and `users me`).
            const candidate = opts.exportType ? String(opts.exportType).toUpperCase() : "JSON_V1";
            if (candidate === "XLSX" || candidate === "PDF") {
                throw new Error(
                    `--export-type ${candidate} is unavailable because the CLI cannot stream binary output to a file yet. Provide one of: ${SHARED_REPORT_VIEW_EXPORT_TYPES.join(", ")}. Run \`clk115 shared-reports list\` and open the report link for binary downloads.`,
                );
            }
            if (!(SHARED_REPORT_VIEW_EXPORT_TYPES as readonly string[]).includes(candidate)) {
                throw new Error(
                    `Unknown --export-type "${String(opts.exportType)}". Provide one of: ${SHARED_REPORT_VIEW_EXPORT_TYPES.join(", ")}.`,
                );
            }
            const { client, output } = await resolveBaseContext(this, services);
            const exportType = candidate as NonNullable<
                ClockifyApi.ViewSharedReportsRequest["exportType"]
            >;
            const response = await client.sharedReports.view({
                sharedReportId: id,
                exportType,
            });
            printObject(await readReportBody(response), output);
        });

    leafCommand(shared, "create", "write")
        .requiredOption("--name <text>", "Shared-report name.")
        .requiredOption("--type <type>", `Report type: ${SHARED_REPORT_TYPES.join(", ")}.`)
        .requiredOption("--filter <json>", "Report filter object as a JSON string.")
        .option("--public", "Make the report publicly accessible.")
        .option("--no-public", "Make the report private (no public link).")
        .description("Create a shared (public-link) report.")
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const body: ClockifyRequestBody<ClockifyApi.SharedReportCreate> = parseSharedReportBody(
                sharedReportCreateBodySchema,
                opts,
                "shared-reports.create",
            );
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

    leafCommand(shared, "update", "write")
        .argument("<id>", "Shared-report ID.")
        .requiredOption("--name <text>", "Shared-report name.")
        .requiredOption("--type <type>", `Report type: ${SHARED_REPORT_TYPES.join(", ")}.`)
        .requiredOption("--filter <json>", "Report filter object as a JSON string (full replace).")
        .option("--public", "Make the report publicly accessible.")
        .option("--no-public", "Make the report private (no public link).")
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

    leafCommand(shared, "delete", "destructive")
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
