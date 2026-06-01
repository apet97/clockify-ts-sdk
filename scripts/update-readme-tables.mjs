#!/usr/bin/env node
// update-readme-tables: regenerates the generated:cli-commands and
// generated:mcp-workflow-tools blocks in cli/README.md and mcp/README.md
// from docs/cli-commands.json and docs/mcp-tools.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function escapeCell(value) {
    return String(value).replaceAll("|", "\\|");
}

function betweenMarkers(name, body) {
    return `<!-- BEGIN generated:${name} -->\n${body.trim()}\n<!-- END generated:${name} -->`;
}

function replaceSection(readme, heading, nextHeading, generated) {
    const pattern = new RegExp(`(${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n)([\\s\\S]*?)(\\n${nextHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`);
    if (!pattern.test(readme)) throw new Error(`could not find section ${heading}`);
    return readme.replace(pattern, `$1\n${generated}\n$3`);
}

function cliCommandsTable() {
    const { commands } = readJson("docs/cli-commands.json");
    const lines = ["| Command | What it does |", "|---|---|"];
    for (const row of commands) {
        lines.push(`| \`${escapeCell(row.command)}\` | ${escapeCell(row.description)} |`);
    }
    return betweenMarkers("cli-commands", lines.join("\n"));
}

function mcpWorkflowTable() {
    const { workflowTools } = readJson("docs/mcp-tools.json");
    const lines = ["| Tool | Purpose |", "|---|---|"];
    for (const row of workflowTools) {
        lines.push(`| \`${escapeCell(row.tool)}\` | ${escapeCell(row.purpose)} |`);
    }
    return betweenMarkers("mcp-workflow-tools", lines.join("\n"));
}

function mcpDomainTable() {
    const { domainGroups } = readJson("docs/mcp-tools.json");
    const lines = ["| Resource group | Count | Tools |", "|---|---:|---|"];
    for (const row of domainGroups) {
        lines.push(`| \`${escapeCell(row.resourceGroup)}\` | ${row.count} | ${escapeCell(row.tools)} |`);
    }
    return betweenMarkers("mcp-domain-tools", lines.join("\n"));
}

function updateCliReadme(input) {
    return replaceSection(input, "## Commands", "## Examples", cliCommandsTable());
}

function updateMcpReadme(input) {
    let out = input;
    out = replaceSection(out, "## Workflow Tools", "## Workflow Examples", mcpWorkflowTable());
    out = replaceSection(out, "## Domain Tools", "## Result Envelope", mcpDomainTable());
    return out;
}

const updates = [
    { path: "cli/README.md", transform: updateCliReadme },
    { path: "mcp/README.md", transform: updateMcpReadme },
];

const stale = [];
for (const update of updates) {
    const absolute = path.join(root, update.path);
    const current = fs.readFileSync(absolute, "utf8");
    const next = update.transform(current);
    if (args.has("--write")) {
        fs.writeFileSync(absolute, next);
    } else if (current !== next) {
        stale.push(update.path);
    }
}

if (args.has("--write")) {
    console.log("updated generated README tables");
    process.exit(0);
}

if (args.has("--check")) {
    if (stale.length > 0) {
        console.error(`README table drift: ${stale.join(", ")}. Run make readme-tables.`);
        process.exit(1);
    }
    console.log("README tables are current");
    process.exit(0);
}

console.log("Pass --write or --check.");
