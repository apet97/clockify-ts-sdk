#!/usr/bin/env node
// Generate docs/mcp-tool-manifest.json by introspecting the real MCP server.
// This makes tool-set discovery structural instead of syntax-coupled to
// registerTool/defineTool call shapes in mcp/src/tools.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildServer } from "../src/server.ts";

import { fakeContext } from "./introspect-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, "..", "..", "docs", "mcp-tool-manifest.json");
const mcpToolsPath = path.resolve(here, "..", "..", "docs", "mcp-tools.json");
const args = new Set(process.argv.slice(2));

function workflowNames() {
    const doc = JSON.parse(fs.readFileSync(mcpToolsPath, "utf8"));
    return new Set((doc.workflowTools ?? []).map((tool) => tool.tool));
}

// Fail closed if the MCP SDK private registration map vanishes or the server
// stops registering the known tool surface. Otherwise the generator could emit
// an empty manifest and rely on a later drift check to notice.
const MIN_REGISTERED_TOOLS = 134;

function render() {
    const server = buildServer(fakeContext());
    const registered = server._registeredTools ?? {};
    const registeredCount = Object.keys(registered).length;
    if (registeredCount < MIN_REGISTERED_TOOLS) {
        throw new Error(
            `tool-manifest generator read ${registeredCount} registered tools (expected >= ${MIN_REGISTERED_TOOLS}). ` +
                "The private McpServer `_registeredTools` map is missing or under-populated; " +
                "most likely a @modelcontextprotocol/sdk upgrade renamed that internal field, " +
                "or buildServer() stopped registering tools. Refusing to emit a silently-empty manifest.",
        );
    }
    const workflow = workflowNames();
    const tools = Object.keys(registered)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
            const reg = registered[name];
            const annotations = reg.annotations ?? {};
            return {
                name,
                title: typeof reg.title === "string" ? reg.title : "",
                group: workflow.has(name) ? "workflow" : "domain",
                annotations: {
                    readOnlyHint: annotations.readOnlyHint === true,
                    destructiveHint: annotations.destructiveHint === true,
                    idempotentHint: annotations.idempotentHint === true,
                },
                destructiveHint: annotations.destructiveHint === true,
            };
        });
    const summary = {
        totalTools: tools.length,
        workflowTools: tools.filter((tool) => tool.group === "workflow").length,
        domainTools: tools.filter((tool) => tool.group === "domain").length,
        destructiveTools: tools.filter((tool) => tool.destructiveHint).length,
    };
    return `${JSON.stringify({
        schemaVersion: 1,
        purpose:
            "Structural manifest of every registered MCP tool, built by runtime-introspecting buildServer(ctx). Source of truth for tool-set discovery in gate scripts.",
        generator: "mcp/scripts/generate-tool-manifest.mjs",
        summary,
        tools,
    }, null, 2)}\n`;
}

const content = render();

if (args.has("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== content) {
        console.error("docs/mcp-tool-manifest.json is stale. Run `make mcp-tool-manifest`.");
        process.exit(1);
    }
    console.log("mcp tool manifest is current");
    process.exit(0);
}

if (args.has("--write")) {
    fs.writeFileSync(outputPath, content);
    console.log("wrote docs/mcp-tool-manifest.json");
    process.exit(0);
}

process.stdout.write(content);
