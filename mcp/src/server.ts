/**
 * Constructs the McpServer with every tool registered. Exported so
 * tests can wire a server against an injected Context, and so the
 * stdio entrypoint stays a thin shell.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Context } from "./client.js";
import { registerStatusTool } from "./tools/status.js";
import { registerProjectsTools } from "./tools/projects.js";
import { registerClientsTools } from "./tools/clients.js";
import { registerTagsTools } from "./tools/tags.js";
import { registerTasksTools } from "./tools/tasks.js";
import { registerEntriesTools } from "./tools/entries.js";
import { registerTimerTools } from "./tools/timer.js";

export const SERVER_INSTRUCTIONS =
    "This is a single-user Clockify MCP for one pinned workspace. " +
    "All tools operate on the workspace set by CLOCKIFY_WORKSPACE_ID. " +
    "Use clockify_status first to confirm credentials. " +
    "Use IDs returned by previous calls rather than re-resolving names. " +
    "If a feature is unavailable on the workspace plan, report it and continue.";

export function buildServer(ctx: Context): McpServer {
    const server = new McpServer(
        {
            name: "@clockify/mcp-server",
            version: "0.1.0",
        },
        {
            instructions: SERVER_INSTRUCTIONS,
            capabilities: { tools: {} },
        },
    );

    registerStatusTool(server, ctx);
    registerProjectsTools(server, ctx);
    registerClientsTools(server, ctx);
    registerTagsTools(server, ctx);
    registerTasksTools(server, ctx);
    registerEntriesTools(server, ctx);
    registerTimerTools(server, ctx);

    return server;
}
