/**
 * Workspace audit log search. Clockify gates this endpoint by plan;
 * 403/404 responses surface verbatim through errorResult so the
 * caller can route accordingly.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import { AUDIT_LOG_ACTIONS, type ClockifyApi } from "clockify-sdk-ts-115/requests";
import { z } from "zod";

import { zNumberLike, zStringList } from "../arg-shapes.js";
import type { Context } from "../client.js";
import { defineTool, successResult } from "../result.js";

const AUTHORS_MODE = ["CONTAINS", "DOES_NOT_CONTAIN"] as const;

/** The API caps the audit window at 31 days. MCP-3: the description always
 *  claimed the cap but nothing enforced it, so the claim was checked only by
 *  the remote 400 — enforce it locally with a clear message instead. */
const MAX_AUDIT_WINDOW_MS = 31 * 86_400_000;

function assertAuditWindow(start: string, end: string): void {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        throw new Error("Audit log search requires valid RFC3339 start and end values.");
    }
    const elapsedMs = endMs - startMs;
    if (elapsedMs < 0) {
        throw new Error("Audit log search requires start ≤ end.");
    }
    if (elapsedMs > MAX_AUDIT_WINDOW_MS) {
        throw new Error(
            "Audit log search window must be 31 days or less; narrow the start/end range.",
        );
    }
}

export function registerAuditTools(server: McpServer, ctx: Context): void {
    defineTool(
        server,
        "clockify_audit_log_search",
        {
            title: "Search the workspace audit log",
            description:
                "Search the audit log. Window must be ≤ 31 days (enforced locally); actions filter is required, authors filter is optional (defaults to all authors).",
            inputSchema: {
                start: z.string().min(1).describe("RFC3339 window start."),
                end: z.string().min(1).describe("RFC3339 window end."),
                actions: zStringList(z.array(z.enum(AUDIT_LOG_ACTIONS)).min(1)).describe(
                    "Audit action names, e.g. CREATE_PROJECT, UPDATE_PROJECT.",
                ),
                authorIds: zStringList(z.array(z.string()))
                    .optional()
                    .describe("Author IDs; pass SYSTEM to include system events."),
                authorsMode: z.enum(AUTHORS_MODE).optional().default("CONTAINS"),
                page: zNumberLike(z.number().int().min(1).default(1)).optional(),
                pageSize: zNumberLike(z.number().int().min(1).max(50).default(50)).optional(),
            },
            idempotent: true,
        },
        async (args) => {
            assertAuditWindow(args.start, args.end);
            const req: ClockifyApi.SearchAuditLogReportRequest = {
                workspaceId: ctx.workspaceId,
                start: args.start,
                end: args.end,
                actions: args.actions,
                authors: {
                    authorIds: args.authorIds ?? [],
                    contains: args.authorsMode ?? "CONTAINS",
                },
                page: args.page ?? 1,
                "page-size": args.pageSize ?? 50,
            };
            const result = await ctx.client.auditLogReport.search(req);
            return successResult("clockify_audit_log_search", result, {
                workspaceId: ctx.workspaceId,
            });
        },
    );
}
