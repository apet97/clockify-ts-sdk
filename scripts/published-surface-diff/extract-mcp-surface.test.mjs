import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { extractMcpSurface } from "./extract-mcp-surface.mjs";

function fixtureRoot(serverSource, riskNames = []) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "clockify-mcp-surface-"));
    fs.mkdirSync(path.join(root, "dist", "tools"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module", version: "1.2.3" }));
    fs.writeFileSync(path.join(root, "dist", "server.js"), serverSource);
    fs.writeFileSync(
        path.join(root, "dist", "tool-risk.js"),
        `export const TOOL_RISK_BY_NAME = ${JSON.stringify(Object.fromEntries(riskNames.map((name) => [name, "read"])))}`,
    );
    fs.writeFileSync(
        path.join(root, "dist", "tools", "discovery.js"),
        'export const SEARCH_TOOL_NAME = "clockify_tools_search";',
    );
    fs.symlinkSync(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
    return root;
}

test("extractMcpSurface uses the owned registry when available", async (t) => {
    const root = fixtureRoot(`
        export function buildServer() { return {}; }
        export function registeredToolsFor() { return new Map([["owned_tool", {}]]); }
    `);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(await extractMcpSurface(root), { version: "1.2.3", tools: ["owned_tool"] });
});

test("extractMcpSurface queries legacy builds through public tools/list", async (t) => {
    const root = fixtureRoot(`
        import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
        import { z } from "zod";
        export function buildServer() {
            const server = new McpServer({ name: "fixture", version: "1.0.0" });
            server.registerTool("legacy_tool", { inputSchema: z.object({}) }, async () => ({ content: [] }));
            server.registerTool("clockify_tools_search", { inputSchema: z.object({}) }, async () => ({ content: [] })).disable();
            return server;
        }
    `, ["legacy_tool", "clockify_tools_search"]);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(await extractMcpSurface(root), {
        version: "1.2.3",
        tools: ["clockify_tools_search", "legacy_tool"],
    });
});

test("extractMcpSurface ignores ambient stdio discovery mode", async (t) => {
    const previousDiscovery = process.env.CLOCKIFY_MCP_DISCOVERY;
    process.env.CLOCKIFY_MCP_DISCOVERY = "1";
    t.after(() => {
        if (previousDiscovery === undefined) {
            delete process.env.CLOCKIFY_MCP_DISCOVERY;
        } else {
            process.env.CLOCKIFY_MCP_DISCOVERY = previousDiscovery;
        }
    });
    const root = fixtureRoot(`
        import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
        import { z } from "zod";
        export function buildServer() {
            const env = process.env;
            const server = new McpServer({ name: "fixture", version: "1.0.0" });
            const legacy = server.registerTool(
                "legacy_tool",
                { inputSchema: z.object({}) },
                async () => ({ content: [] }),
            );
            const search = server.registerTool(
                "clockify_tools_search",
                { inputSchema: z.object({}) },
                async () => ({ content: [] }),
            );
            if (env.CLOCKIFY_MCP_DISCOVERY) {
                legacy.disable();
            } else {
                search.disable();
            }
            return server;
        }
    `, ["legacy_tool", "clockify_tools_search"]);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    assert.deepEqual(await extractMcpSurface(root), {
        version: "1.2.3",
        tools: ["clockify_tools_search", "legacy_tool"],
    });
});

test("extractMcpSurface rejects an undeclared hidden legacy tool", async (t) => {
    const root = fixtureRoot(`
        import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
        import { z } from "zod";
        export function buildServer() {
            const server = new McpServer({ name: "fixture", version: "1.0.0" });
            server.registerTool("visible_tool", { inputSchema: z.object({}) }, async () => ({ content: [] }));
            return server;
        }
    `, ["visible_tool", "clockify_tools_search", "unexpected_hidden_tool"]);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));

    await assert.rejects(extractMcpSurface(root), /hides unexpected tools: .*unexpected_hidden_tool/);
});

for (const missingArtifact of ["dist/tool-risk.js", "dist/tools/discovery.js"]) {
    test(`extractMcpSurface rejects legacy packages missing ${missingArtifact}`, async (t) => {
        const root = fixtureRoot(`
            import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
            import { z } from "zod";
            export function buildServer() {
                const server = new McpServer({ name: "fixture", version: "1.0.0" });
                server.registerTool("visible_tool", { inputSchema: z.object({}) }, async () => ({ content: [] }));
                return server;
            }
        `, ["visible_tool"]);
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        fs.rmSync(path.join(root, missingArtifact));

        await assert.rejects(extractMcpSurface(root), new RegExp(`missing: ${missingArtifact.replace(".", "\\.")}`));
    });
}

test("extractMcpSurface rejects a malformed legacy discovery contract", async (t) => {
    const root = fixtureRoot(`
        import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
        import { z } from "zod";
        export function buildServer() {
            const server = new McpServer({ name: "fixture", version: "1.0.0" });
            server.registerTool("visible_tool", { inputSchema: z.object({}) }, async () => ({ content: [] }));
            return server;
        }
    `, ["visible_tool"]);
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, "dist", "tools", "discovery.js"), "export const WRONG_NAME = 'x';");

    await assert.rejects(extractMcpSurface(root), /no usable governed SEARCH_TOOL_NAME/);
});
