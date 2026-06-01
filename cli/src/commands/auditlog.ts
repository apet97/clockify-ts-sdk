/**
 * `clk115 audit-log search` — query the workspace audit log.
 *
 * Clockify caps the audit window at 31 days and requires both
 * `actions` and `authors` filters; this surface mirrors that contract
 * so a missing flag fails locally instead of round-tripping to a 400.
 */
import type { Command } from "commander";

import { printRecords } from "../output.js";

import { resolveContext } from "./helpers.js";
import type { Registrar } from "./types.js";

export const registerAuditLogCommand: Registrar = (program, services) => {
    const audit = program.command("audit-log").description("Workspace audit log.");

    audit
        .command("search")
        .description("Search the workspace audit log.")
        .requiredOption("--start <date>", "Window start (RFC3339, e.g. 2026-05-01T00:00:00Z).")
        .requiredOption("--end <date>", "Window end (RFC3339).")
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
        .option("--page <n>", "Page number.", (v) => Number.parseInt(v, 10), 1)
        .option("--limit <n>", "Page size.", (v) => Number.parseInt(v, 10), 50)
        .action(async function (this: Command, opts) {
            const { client, workspaceId, output } = resolveContext(this, services);
            const actions = splitList(opts.actions);
            if (actions.length === 0) {
                throw new Error("--actions must include at least one action name");
            }
            const authorIds = opts.authors ? splitList(opts.authors) : [];
            const authors: Record<string, unknown> = {
                authorIds,
                contains: opts.authorsMode === "DOES_NOT_CONTAIN" ? "DOES_NOT_CONTAIN" : "CONTAINS",
            };
            const req: Record<string, unknown> = {
                workspaceId,
                start: opts.start,
                end: opts.end,
                actions,
                authors,
                page: opts.page,
                "page-size": Math.min(Math.max(1, opts.limit), 200),
            };
            const response = (await client.auditLogReport.search(req as never)) as
                | { entries?: unknown[] }
                | unknown[];
            const items = Array.isArray(response) ? response : response.entries ?? [];
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

function splitList(value: string): string[] {
    return String(value)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
