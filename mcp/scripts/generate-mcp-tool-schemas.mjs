#!/usr/bin/env node
// Generate docs/mcp-tool-schemas.json by introspecting the real MCP server's
// registered tools' actual Zod input schemas (not just their metadata --
// docs/mcp-tool-manifest.json already covers name/risk/annotations; this is
// the parameter-level shape those tools accept). Mirrors
// generate-tool-manifest.mjs's introspection pattern: build the real server
// with a call-guarded fake context, read the private
// `_registeredTools` map, fail closed if it is missing/under-populated.
//
// z.toJSONSchema() is the model-visible shape: the MCP SDK's own
// zod-to-json-schema conversion unwraps z.preprocess (used by
// mcp/src/arg-shapes.ts's zStringList/zNumberLike coercion helpers) to the
// INNER schema, so a coerced field serializes as its canonical array/number
// type here too -- there is nothing coercion-specific for this generator to
// special-case.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { buildServer } from "../src/server.ts";

import { fakeContext } from "./introspect-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, "..", "..", "docs", "mcp-tool-schemas.json");
const args = new Set(process.argv.slice(2));

const MIN_REGISTERED_TOOLS = 134;

function render() {
    const server = buildServer(fakeContext());
    const registered = server._registeredTools ?? {};
    const registeredCount = Object.keys(registered).length;
    if (registeredCount < MIN_REGISTERED_TOOLS) {
        throw new Error(
            `tool-schemas generator read ${registeredCount} registered tools (expected >= ${MIN_REGISTERED_TOOLS}). ` +
                "The private McpServer `_registeredTools` map is missing or under-populated; " +
                "most likely a @modelcontextprotocol/sdk upgrade renamed that internal field, " +
                "or buildServer() stopped registering tools. Refusing to emit a silently-empty manifest.",
        );
    }

    const tools = Object.keys(registered)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
            const reg = registered[name];
            const hasSchema = reg.inputSchema != null && typeof reg.inputSchema === "object";
            const jsonSchema = hasSchema ? z.toJSONSchema(reg.inputSchema) : { type: "object", properties: {} };
            return {
                name,
                paramCount: Object.keys(jsonSchema.properties ?? {}).length,
                required: [...(jsonSchema.required ?? [])].sort(),
                inputSchema: jsonSchema,
            };
        });

    return `${JSON.stringify(
        {
            schemaVersion: 1,
            purpose:
                "Parameter-level JSON Schema for every registered MCP tool's inputSchema, built by runtime-introspecting buildServer(ctx) and serializing each tool's real Zod schema via z.toJSONSchema(). Complements docs/mcp-tool-manifest.json (tool metadata) with the actual accepted shape, for scripts/check-mcp-schema-parity.mjs.",
            generator: "mcp/scripts/generate-mcp-tool-schemas.mjs",
            toolCount: tools.length,
            tools,
        },
        null,
        2,
    )}\n`;
}

const content = render();

if (args.has("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== content) {
        console.error("docs/mcp-tool-schemas.json is stale. Run `make mcp-tool-schemas`.");
        process.exit(1);
    }
    console.log("mcp tool schemas are current");
    process.exit(0);
}

if (args.has("--write")) {
    fs.writeFileSync(outputPath, content);
    console.log("wrote docs/mcp-tool-schemas.json");
    process.exit(0);
}

process.stdout.write(content);
