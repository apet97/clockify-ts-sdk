#!/usr/bin/env node
/** MCP stdio entrypoint; importing it does not start the server. */
import { realpathSync } from "node:fs";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadContext, warnStartupDiagnostics } from "./client.js";
import { buildServer } from "./server.js";

export async function main(): Promise<void> {
    const ctx = loadContext();
    warnStartupDiagnostics(ctx);
    const server = buildServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

export function isDirectInvocation(argv1: string | undefined): boolean {
    try {
        // Resolve npm's bin symlink before comparing the exact module path.
        return argv1 !== undefined && realpathSync(argv1) === import.meta.filename;
    } catch {
        return false;
    }
}

if (isDirectInvocation(process.argv[1])) {
    main().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`fatal: ${message}\n`);
        process.exit(1);
    });
}
