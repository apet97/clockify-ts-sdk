#!/usr/bin/env node
// Generate docs/mcp-tool-schemas.json from the public MCP tools/list surface.
// The in-memory transport exercises the same protocol conversion a real host
// sees, so this artifact cannot drift from model-visible JSON Schema because a
// private SDK registration field or a different Zod serializer behaves
// differently.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import { buildServer, registeredToolsFor } from "../src/server.ts";

import { fakeContext } from "./introspect-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, "..", "..", "docs", "mcp-tool-schemas.json");
const args = new Set(process.argv.slice(2));

const EXPECTED_TOOL_COUNT = 163;

async function listPublicTools() {
    const server = buildServer(fakeContext(), {
        discoveryEnv: { CLOCKIFY_MCP_DISCOVERY: "0" },
    });
    // The search tool is intentionally disabled in default mode. Enable every
    // known handle only to construct the one complete protocol surface this
    // inventory records; schema serialization itself still comes exclusively
    // from the public tools/list response below.
    for (const handle of registeredToolsFor(server).values()) handle.enable();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "mcp-tool-schemas", version: "0.0.0" });
    await client.connect(clientTransport);

    try {
        return (await client.listTools()).tools;
    } finally {
        await client.close();
        await server.close();
    }
}

async function render() {
    const listed = await listPublicTools();
    if (listed.length !== EXPECTED_TOOL_COUNT) {
        throw new Error(
            `tool-schemas generator read ${listed.length} unique tools from tools/list (expected exactly ${EXPECTED_TOOL_COUNT}). ` +
                "buildServer() may have stopped registering tools; refusing to emit a silently incomplete manifest.",
        );
    }

    const tools = listed
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(({ name, inputSchema }) => ({
            name,
            paramCount: Object.keys(inputSchema.properties ?? {}).length,
            required: [...(inputSchema.required ?? [])].sort(),
            inputSchema,
        }));

    return `${JSON.stringify(
        {
            schemaVersion: 1,
            purpose:
                "Parameter-level JSON Schema for every registered MCP tool, captured from one public tools/list protocol result after enabling all registered handles for inventory. Complements docs/mcp-tool-manifest.json (tool metadata) with the actual model-visible accepted shape, for scripts/check-mcp-schema-parity.mjs.",
            generator: "mcp/scripts/generate-mcp-tool-schemas.mjs",
            toolCount: tools.length,
            tools,
        },
        null,
        2,
    )}\n`;
}

const content = await render();

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
