/**
 * Constructs the McpServer with every tool registered. Exported so
 * tests can wire a server against an injected Context, and so the
 * stdio entrypoint stays a thin shell.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "./client.js";
import { installDefaultOutputSchema } from "./output-schema.js";
import { registerClockifyPrompts } from "./prompts.js";
import { registerClockifyResources } from "./resources.js";
import { registerAgentDocsTools } from "./tools/agent-docs.js";
import { registerApprovalsTools } from "./tools/approvals.js";
import { registerAuditTools } from "./tools/audit.js";
import { registerClientsTools } from "./tools/clients.js";
import { registerCustomFieldsTools } from "./tools/customFields.js";
import { registerDoctorTool } from "./tools/doctor.js";
import { registerEntriesTools } from "./tools/entries.js";
import { registerExpensesTools } from "./tools/expenses.js";
import { registerGroupsTools } from "./tools/groups.js";
import { registerHolidaysTools } from "./tools/holidays.js";
import { registerInvoicesTools } from "./tools/invoices.js";
import { registerProjectsTools } from "./tools/projects.js";
import { registerReportsTools } from "./tools/reports.js";
import { registerSchedulingTools } from "./tools/scheduling.js";
import { registerSharedReportsTools } from "./tools/sharedReports.js";
import { registerStatusTool } from "./tools/status.js";
import { registerTagsTools } from "./tools/tags.js";
import { registerTasksTools } from "./tools/tasks.js";
import { registerTimeOffTools } from "./tools/timeOff.js";
import { registerTimerTools } from "./tools/timer.js";
import { registerUsersTools } from "./tools/users.js";
import { registerWebhooksTools } from "./tools/webhooks.js";
import { registerWorkflowTools } from "./tools/workflows.js";

// SERVER_INSTRUCTIONS is the MCP serverInstructions string. Receipts return structuredContent envelopes per the MCP output schema contract.
export const SERVER_INSTRUCTIONS =
    "This is a single-user Clockify MCP for one pinned workspace. " +
    "All tools operate on the workspace set by CLOCKIFY_WORKSPACE_ID. " +
    "Use clockify_status first to confirm credentials, workspace, and running timer state. " +
    "On first run, get the clockify-getting-started prompt and read the clockify://guide/which-tool resource. " +
    "Prefer workflow tools before low-level domain tools. " +
    "Use IDs returned by previous structured receipts rather than re-resolving names. " +
    "For invoices, expenses, time off, scheduling, and webhooks, run dry_run first and reuse the returned confirm_token. " +
    "Inspect ids, changed, warnings, next, stable error codes, and recovery hints. " +
    "If a feature is unavailable on the workspace plan, report the recovery hint and continue.";

export function buildServer(ctx: Context): McpServer {
    const server = new McpServer(
        {
            name: "@apet97/clockify-mcp-115",
            version: "0.4.0",
        },
        {
            instructions: SERVER_INSTRUCTIONS,
            capabilities: { tools: {}, resources: {}, prompts: {} },
        },
    );
    installDefaultOutputSchema(server);
    registerClockifyResources(server);
    registerClockifyPrompts(server);

    registerWorkflowTools(server, ctx);
    registerAgentDocsTools(server);
    registerStatusTool(server, ctx);
    registerDoctorTool(server, ctx);
    registerProjectsTools(server, ctx);
    registerClientsTools(server, ctx);
    registerTagsTools(server, ctx);
    registerTasksTools(server, ctx);
    registerEntriesTools(server, ctx);
    registerTimerTools(server, ctx);
    registerInvoicesTools(server, ctx);
    registerExpensesTools(server, ctx);
    registerWebhooksTools(server, ctx);
    registerCustomFieldsTools(server, ctx);
    registerTimeOffTools(server, ctx);
    registerSchedulingTools(server, ctx);
    registerReportsTools(server, ctx);
    registerSharedReportsTools(server, ctx);
    registerUsersTools(server, ctx);
    registerGroupsTools(server, ctx);
    registerHolidaysTools(server, ctx);
    registerApprovalsTools(server, ctx);
    registerAuditTools(server, ctx);

    return server;
}
