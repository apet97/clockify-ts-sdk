/**
 * `clk115 audit-log search` — query the workspace audit log.
 *
 * Clockify caps the audit window at 31 days and requires both
 * `actions` and `authors` filters; this surface mirrors that contract
 * so a missing flag fails locally instead of round-tripping to a 400.
 */
import {
    AUDIT_LOG_ACTIONS,
    type AuditLogAction,
    type ClockifyApi,
} from "clockify-sdk-ts-115/requests";
import type { Command } from "commander";

import { printRecords } from "../output.js";

import {
    clampPageSize,
    parseIntArg,
    promoteDateBoundary,
    resolveContext,
    splitList,
} from "./helpers.js";
import { leafCommand } from "./leaf-command.js";
import type { Registrar } from "./types.js";

export const registerAuditLogCommand: Registrar = (program, services) => {
    const audit = program.command("audit-log").description("Workspace audit log.");

    leafCommand(audit, "search", "read")
        .description("Search the workspace audit log.")
        .requiredOption(
            "--start <date>",
            "Window start (YYYY-MM-DD or RFC3339, e.g. 2026-05-01T00:00:00Z).",
        )
        .requiredOption(
            "--end <date>",
            "Window end (YYYY-MM-DD or RFC3339); the server caps the window at 31 days.",
        )
        .requiredOption(
            "--actions <list>",
            "Comma-separated action names (e.g. CREATE_PROJECT,UPDATE_PROJECT).",
        )
        .option(
            "--authors <ids>",
            "Comma-separated author IDs to include. Pass SYSTEM to include system audit events.",
        )
        .option(
            "--authors-mode <mode>",
            "Author filter mode (CONTAINS|DOES_NOT_CONTAIN). Defaults to CONTAINS when authors are provided.",
            "CONTAINS",
        )
        .option("--page <n>", "Page number.", parseIntArg, 1)
        .option(
            "--limit <n>",
            "Items per page (default 50, max 50 — the audit-log server caps page size).",
            parseIntArg,
            50,
        )
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = await resolveContext(this, services);
            const actions = splitList(opts.actions);
            if (actions.length === 0) {
                throw new Error("--actions must include at least one action name");
            }
            const knownActions = new Set<string>(AUDIT_LOG_ACTIONS);
            const invalidActions = actions.filter((action) => !knownActions.has(action));
            if (invalidActions.length > 0) {
                throw new Error(`Unknown audit action(s): ${invalidActions.join(", ")}; provide known audit action names such as CREATE_PROJECT or UPDATE_PROJECT`);
            }
            const authorIds = opts.authors ? splitList(opts.authors) : [];
            const mode = String(opts.authorsMode).toUpperCase();
            if (mode !== "CONTAINS" && mode !== "DOES_NOT_CONTAIN") {
                throw new Error(
                    `--authors-mode must be CONTAINS or DOES_NOT_CONTAIN (got "${String(opts.authorsMode)}").`,
                );
            }
            const authors: Record<string, unknown> = {
                authorIds,
                contains: mode,
            };
            const req: ClockifyApi.SearchAuditLogReportRequest = {
                workspaceId,
                start: promoteDateBoundary(opts.start, "start", "start"),
                end: promoteDateBoundary(opts.end, "end", "end"),
                actions: actions as AuditLogAction[],
                authors,
                page: opts.page,
                "page-size": clampPageSize(opts.limit, 50),
            };
            const response = (await client.auditLogReport.search(req)) as
                | { entries?: unknown[] }
                | unknown[];
            const items = Array.isArray(response) ? response : (response.entries ?? []);
            const rows = items.map((raw) => {
                const e = raw as {
                    id?: string;
                    timestamp?: string;
                    action?: string;
                    authorId?: string;
                    authorName?: string;
                    entityType?: string;
                    entityId?: string;
                };
                return {
                    id: e.id ?? "",
                    timestamp: e.timestamp ?? "",
                    action: e.action ?? "",
                    author: e.authorName ?? e.authorId ?? "",
                    entityType: e.entityType ?? "",
                    entityId: e.entityId ?? "",
                };
            });
            printRecords(rows, output);
        });
};
