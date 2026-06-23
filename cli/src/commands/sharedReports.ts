/**
 * `clk115 shared-reports {list,view,create,update,delete}` — the shareable
 * (public-link) report definitions surfaced under the reports host. `list`,
 * `create`, `update`, and `delete` are workspace-scoped; `view` is keyed only
 * by the shared-report id (NO workspace scope — the generated method carries
 * the reports-host baseUrl) and returns the rendered report payload. Mirrors
 * the seven P1-7 MCP `clockify_shared_reports_*` tools.
 */
import { wireBody, type ClockifyApi, type ClockifyRequestBody } from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

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
    "ATTENDANCE_DETAILED",
    "ATTENDANCE_SUMMARY",
    "ASSIGNMENT_LIST",
    "ASSIGNMENT_SCHEDULE",
    "APPROVAL_DETAILED",
    "APPROVAL_SUMMARY",
    "BALANCE_LIST",
    "TIMEOFF_DETAILED",
    "EXPENSE_SUMMARY",
];

function parseFilter(raw: string): ClockifyRequestBody<ClockifyApi.SharedReportCreate>["filter"] {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("not an object");
        }
        return parsed as ClockifyRequestBody<ClockifyApi.SharedReportCreate>["filter"];
    } catch {
        throw new Error(
            `--filter must be a JSON object, e.g. '{"dateRangeStart":"…","dateRangeEnd":"…"}'`,
        );
    }
}

function requireType(raw: string): ClockifyRequestBody<ClockifyApi.SharedReportCreate>["type"] {
    const type = String(raw).toUpperCase();
    if (!SHARED_REPORT_TYPES.includes(type)) {
        throw new Error(`Unknown --type "${raw}". Use one of: ${SHARED_REPORT_TYPES.join(", ")}.`);
    }
    return type as ClockifyRequestBody<ClockifyApi.SharedReportCreate>["type"];
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
            const body: ClockifyRequestBody<ClockifyApi.SharedReportCreate> = {
                name: opts.name,
                type: requireType(opts.type),
                filter: parseFilter(opts.filter),
            };
            // Wire field is `isPublic` (live-verified); sending `public` is a no-op.
            if (opts.public) body.isPublic = true;
            const created = (await client.sharedReports.create(
                wireBody<ClockifyApi.SharedReportCreate>({ workspaceId, body }),
            )) as {
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
            const body: ClockifyRequestBody<ClockifyApi.UpdateSharedReportsRequest> = {
                name: opts.name,
                type: requireType(opts.type),
                filter: parseFilter(opts.filter),
            };
            // Wire field is `isPublic` (live-verified); sending `public` is a no-op.
            if (opts.public) body.isPublic = true;
            const updated = (await client.sharedReports.update(
                wireBody<ClockifyApi.UpdateSharedReportsRequest>({
                    workspaceId,
                    sharedReportId: id,
                    body,
                }),
            )) as { id?: string; name?: string };
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
