#!/usr/bin/env node
/** MCP stdio entrypoint; importing it does not start the server. */

import { serveStdio, type StdioServerHandle } from "@modelcontextprotocol/server/stdio";

import { loadContext, warnStartupDiagnostics } from "./client.js";
import { resolvesToModule } from "./direct-invocation.js";
import { buildServer } from "./server.js";

export function main(): StdioServerHandle {
    const ctx = loadContext();
    warnStartupDiagnostics(ctx);
    return serveStdio(() => buildServer(ctx, { discoveryEnv: process.env }), {
        legacy: "serve",
        onerror: reportFatalError,
    });
}

function reportFatalError(err: Error): void {
    process.stderr.write(`fatal: ${err.message}\n`);
    process.exitCode = 1;
}

export function isDirectInvocation(argv1: string | undefined): boolean {
    return resolvesToModule(argv1, import.meta.filename);
}

if (isDirectInvocation(process.argv[1])) {
    try {
        main();
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`fatal: ${message}\n`);
        process.exitCode = 1;
    }
}
