#!/usr/bin/env node
/**
 * Entrypoint for @clockify115/mcp-server. Loads the Clockify SDK
 * client + workspace pin from the environment, wires the McpServer,
 * and connects it to stdio so an MCP client (Claude Desktop, the
 * MCP inspector, etc.) can drive it over JSON-RPC.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadContext, warnIfSetupRequired } from "./client.js";
import { buildServer } from "./server.js";

export async function main(): Promise<void> {
    const ctx = loadContext();
    warnIfSetupRequired(ctx);
    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

export function isDirectInvocation(argv1: string | undefined): boolean {
    return argv1 !== undefined && /(?:^|\/)(?:clockify115-mcp|index\.js)$/.test(argv1);
}

const invokedDirectly = typeof process !== "undefined" && Array.isArray(process.argv) && isDirectInvocation(process.argv[1]);

if (invokedDirectly) {
    main().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`fatal: ${message}\n`);
        process.exit(1);
    });
}
