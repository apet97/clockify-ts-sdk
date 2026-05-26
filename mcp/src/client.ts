/**
 * Configured Clockify SDK client + the workspace pin every tool
 * operates against. Both come from environment variables so the
 * stdio MCP entrypoint can be launched without arguments by an MCP
 * client (Claude Desktop, etc.).
 */
import { createClockifyClient } from "clockify-sdk-ts";

export type ClockifyClient = ReturnType<typeof createClockifyClient>;

export interface Context {
    client: ClockifyClient;
    workspaceId: string;
}

export function loadContext(env: NodeJS.ProcessEnv = process.env): Context {
    const apiKey = env.CLOCKIFY_API_KEY;
    const workspaceId = env.CLOCKIFY_WORKSPACE_ID;
    if (!apiKey) {
        throw new Error(
            "CLOCKIFY_API_KEY is not set. Configure it in your MCP client's env block, e.g.\n" +
                `  "@clockify/mcp-server": { "command": "clockify-mcp", "env": { "CLOCKIFY_API_KEY": "...", "CLOCKIFY_WORKSPACE_ID": "..." } }`,
        );
    }
    if (!workspaceId) {
        throw new Error("CLOCKIFY_WORKSPACE_ID is not set. The one-user server is pinned to a single workspace.");
    }
    return { client: createClockifyClient({ apiKey }), workspaceId };
}
