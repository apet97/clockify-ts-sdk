#!/usr/bin/env node
// docs-counts contract checker.
//
// Two layers:
//   1. Cross-source consistency — the generated count sources must agree
//      (operations, MCP tool split, product-surface declared counts). Catches a
//      generator that drifts one surface but not another.
//   2. Stale-prose denylist — hand-written docs must not contain a known-stale
//      headline-count string (e.g. "47 exports", "15 subpaths").
// Plus the standard five-anchor wiring assertions. The checker prints the
// authoritative counts derived from the generated metadata.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}
function readRelative(rel, label = rel) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
        fail(`${label}: missing`);
        return "";
    }
    return fs.readFileSync(abs, "utf8");
}
function readJson(rel) {
    const text = readRelative(rel);
    if (text === "") return null;
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${rel}: invalid JSON (${error.message})`);
        return null;
    }
}

// Resolve a pointer like "summary.totalTools", "rootSymbols#length",
// "subpaths#keys", "commands#length" against a parsed JSON object.
function resolvePointer(obj, pointer) {
    const [dotted, op] = pointer.split("#");
    let value = obj;
    for (const key of dotted.split(".").filter(Boolean)) {
        value = value?.[key];
    }
    if (op === "length") return Array.isArray(value) ? value.length : undefined;
    if (op === "keys") return value && typeof value === "object" ? Object.keys(value).length : undefined;
    return value;
}

const contract = readJson("docs/docs-counts-contract.json") ?? {};
if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
if (typeof contract.purpose !== "string" || !contract.purpose.trim()) fail("purpose: required");

const wiring = contract.wiring ?? {};
for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
    if (typeof wiring[key] !== "string" || !wiring[key].trim()) fail(`wiring.${key}: required`);
}

if (failures.length > 0) {
    console.error("docs counts contract shape failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

// --- load generated sources ---
const openapiOps = readJson("docs/openapi-operations.json") ?? {};
const parity = readJson("docs/operation-parity.json") ?? {};
const mcpTools = readJson("docs/mcp-tools.json") ?? {};
const productSurface = readJson("docs/product-surface.json") ?? {};
const cliCommands = readJson("docs/cli-commands.json") ?? {};
const sdkApi = readJson("docs/sdk-public-api.json") ?? {};

// --- layer 1: cross-source consistency ---
function eq(label, a, b) {
    if (a !== b) fail(`consistency: ${label} (${a} != ${b})`);
}
const tsMcp = productSurface?.packages?.tsMcp ?? {};
const domainSum = Array.isArray(mcpTools?.domainGroups)
    ? mcpTools.domainGroups.reduce((acc, g) => acc + (g?.count ?? 0), 0)
    : NaN;

eq("operations openapi-operations vs operation-parity", openapiOps.operationCount, parity?.summary?.operations);
eq("mcp totalTools vs workflow+domain", mcpTools?.summary?.totalTools, (mcpTools?.summary?.workflowTools ?? NaN) + (mcpTools?.summary?.domainTools ?? NaN));
eq("mcp workflowTools count vs array", mcpTools?.summary?.workflowTools, Array.isArray(mcpTools?.workflowTools) ? mcpTools.workflowTools.length : NaN);
eq("mcp domainTools vs domainGroups sum", mcpTools?.summary?.domainTools, domainSum);
eq("product-surface declaredToolCount vs mcp totalTools", tsMcp.declaredToolCount, mcpTools?.summary?.totalTools);
eq("product-surface declaredWorkflowToolCount vs mcp workflowTools", tsMcp.declaredWorkflowToolCount, mcpTools?.summary?.workflowTools);
eq("product-surface declaredDomainToolCount vs mcp domainTools", tsMcp.declaredDomainToolCount, mcpTools?.summary?.domainTools);

// --- layer 2: stale-prose denylist ---
const proseDocs = Array.isArray(contract.proseDocs) ? contract.proseDocs : [];
const forbidden = Array.isArray(contract.forbiddenStrings) ? contract.forbiddenStrings : [];
for (const doc of proseDocs) {
    const text = readRelative(doc);
    for (const stale of forbidden) {
        if (text.includes(stale)) fail(`${doc}: contains stale count string ${JSON.stringify(stale)}`);
    }
}

// --- five-anchor wiring ---
const makefile = readRelative("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile: missing target ${wiring.makeTarget}`);
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile: missing ${wiring.checker} invocation`);
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${aggregate}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile: ${aggregate} missing ${wiring.makeTarget}`);
}
const docsIndex = Array.isArray(wiring.docsIndex) ? wiring.docsIndex : [];
const docsIndexText = readRelative("docs/README.md");
for (const doc of docsIndex) {
    if (!docsIndexText.includes(`./${doc}`)) fail(`docs/README.md: missing link ./${doc}`);
}
if (!readRelative("docs/quality-gates.md").includes(wiring.qualityGate)) {
    fail(`docs/quality-gates.md: missing ${wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json: missing id ${wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json: missing id ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("docs counts contract failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

// --- print authoritative counts ---
const sources = {
    "docs/openapi-operations.json": openapiOps,
    "docs/mcp-tools.json": mcpTools,
    "docs/cli-commands.json": cliCommands,
    "docs/sdk-public-api.json": sdkApi,
};
const printed = (contract.authoritativeCounts ?? [])
    .map((c) => `${c.label}=${resolvePointer(sources[c.source] ?? {}, c.pointer)}`)
    .join(", ");
console.log(`docs counts contract passed (${printed})`);
