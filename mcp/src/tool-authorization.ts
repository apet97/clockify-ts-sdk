import type { McpServer } from "@modelcontextprotocol/server";

import { riskForTool, type TOOL_RISK_BY_NAME, type ToolRisk } from "./tool-risk.js";

export type ToolName = keyof typeof TOOL_RISK_BY_NAME;

interface ToolAuthorizationRequest {
    toolName: ToolName;
    risk: ToolRisk;
}

export type ToolAuthorizer = (request: ToolAuthorizationRequest) => void | Promise<void>;

/** A stable authorization failure that maps to an `auth_or_permission` receipt. */
export class ToolAuthorizationError extends Error {
    constructor(message = "permission denied for this tool call") {
        super(message);
        this.name = "ToolAuthorizationError";
    }
}

const authorizers = new WeakMap<McpServer, ToolAuthorizer>();

export function configureToolAuthorization(
    server: McpServer,
    authorizeTool: ToolAuthorizer | undefined,
): void {
    if (authorizeTool === undefined) {
        authorizers.delete(server);
    } else {
        authorizers.set(server, authorizeTool);
    }
}

export async function authorizeToolRequest(server: McpServer, toolName: ToolName): Promise<void> {
    const authorizeTool = authorizers.get(server);
    if (authorizeTool === undefined) return;

    await authorizeTool({
        toolName,
        risk: riskForTool(toolName),
    });
}
