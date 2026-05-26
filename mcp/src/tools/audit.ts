/**
 * Workspace audit log search. Clockify gates this endpoint by plan;
 * 403/404 responses surface verbatim through errorResult so the
 * caller can route accordingly.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Context } from "../client.js";
import { errorResult, successResult } from "../result.js";

const AUTHORS_MODE = ["CONTAINS", "DOES_NOT_CONTAIN"] as const;

export function registerAuditTools(server: McpServer, ctx: Context): void {
    server.registerTool(
        "clockify_audit_log_search",
        {
            title: "Search the workspace audit log",
            description: "Search the audit log. Window must be ≤ 31 days; actions + authors filters are required.",
            inputSchema: {
                start: z.string().min(1).describe("RFC3339 window start."),
                end: z.string().min(1).describe("RFC3339 window end."),
                actions: z
                    .array(z.string().min(1))
                    .min(1)
                    .describe("Audit action names, e.g. CREATE_PROJECT, UPDATE_PROJECT."),
                authorIds: z.array(z.string()).optional().describe("Author IDs; pass SYSTEM to include system events."),
                authorsMode: z.enum(AUTHORS_MODE).optional().default("CONTAINS"),
                page: z.number().int().min(1).default(1).optional(),
                pageSize: z.number().int().min(1).max(200).default(50).optional(),
            },
            annotations: { readOnlyHint: true, idempotentHint: true },
        },
        async (args) => {
            try {
                const req: Record<string, unknown> = {
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
                const result = await ctx.client.auditLogReport.search(req as never);
                return successResult("clockify_audit_log_search", result, {
                    workspaceId: ctx.workspaceId,
                });
            } catch (err) {
                return errorResult("clockify_audit_log_search", err);
            }
        },
    );
}
