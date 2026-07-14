#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/mcp-contract.json", "contractPath");

function fail(message) {
    failures.push(message);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label} must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${safePath} is missing`);
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label} invalid JSON: ${error.message}`);
        return {};
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertNonNegativeInteger(label, value) {
    if (!Number.isInteger(value) || value < 0) {
        fail(`${label} must be a non-negative integer`);
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label} must be an object`);
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(`${label} must be an array`);
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(`${label} must be a non-empty array`);
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(`${label} contains a non-string or empty entry`);
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
        seen.add(value);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    safeRelativePath("toolsMetadata", contract.toolsMetadata);
    if (assertObject("expected", contract.expected)) {
        for (const field of ["totalTools", "workflowTools", "domainTools"]) {
            assertNonNegativeInteger(`expected.${field}`, contract.expected[field]);
        }
        const resources = assertStringArray("expected.resources", contract.expected.resources, {
            allowEmpty: false,
        });
        assertUnique("expected.resources", resources);
        const prompts = assertStringArray("expected.prompts", contract.expected.prompts, {
            allowEmpty: false,
        });
        assertUnique("expected.prompts", prompts);
        assertNonEmptyString("expected.outputSchemaExport", contract.expected.outputSchemaExport);
    }

    if (assertObject("sourceEvidence", contract.sourceEvidence)) {
        const requiredEvidence = ["resources", "prompts", "outputSchema", "serverTest", "readme"];
        for (const key of requiredEvidence) {
            safeRelativePath(`sourceEvidence.${key}`, contract.sourceEvidence[key]);
        }
        assertUnique("sourceEvidence", Object.values(contract.sourceEvidence).filter((value) => typeof value === "string"));
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("MCP contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const tools = readJson(contract.toolsMetadata, "toolsMetadata");
const summary = tools.summary ?? {};
if (summary.totalTools !== contract.expected.totalTools) {
    fail(`expected ${contract.expected.totalTools} total tools, got ${summary.totalTools}`);
}
if (summary.workflowTools !== contract.expected.workflowTools) {
    fail(`expected ${contract.expected.workflowTools} workflow tools, got ${summary.workflowTools}`);
}
if (summary.domainTools !== contract.expected.domainTools) {
    fail(`expected ${contract.expected.domainTools} domain tools, got ${summary.domainTools}`);
}

const actualWorkflowTools = tools.workflowTools?.length ?? 0;
if (actualWorkflowTools !== contract.expected.workflowTools) {
    fail(`workflowTools array has ${actualWorkflowTools} entries`);
}

const actualDomainTools = (tools.domainGroups ?? []).reduce((sum, group) => sum + Number(group.count ?? 0), 0);
if (actualDomainTools !== contract.expected.domainTools) {
    fail(`domainGroups counts sum to ${actualDomainTools}`);
}

for (const [label, relativePath] of Object.entries(contract.sourceEvidence ?? {})) {
    readRelative(relativePath, `sourceEvidence.${label}`);
}

const resourcesText = readEvidence("resources");
const promptsText = readEvidence("prompts");
const outputSchemaText = readEvidence("outputSchema");
const serverTestText = readEvidence("serverTest");
const readmeText = readEvidence("readme");

for (const uri of contract.expected.resources ?? []) {
    if (!resourcesText.includes(uri)) fail(`resources source missing ${uri}`);
    if (!serverTestText.includes(uri)) fail(`server test missing ${uri}`);
    if (!readmeText.includes(uri)) fail(`README missing ${uri}`);
}

for (const prompt of contract.expected.prompts ?? []) {
    if (!promptsText.includes(prompt)) fail(`prompts source missing ${prompt}`);
    if (!serverTestText.includes(prompt)) fail(`server test missing ${prompt}`);
    if (!readmeText.includes(prompt)) fail(`README missing ${prompt}`);
}

if (!outputSchemaText.includes(contract.expected.outputSchemaExport)) {
    fail(`output schema source missing ${contract.expected.outputSchemaExport}`);
}
if (!serverTestText.includes("outputSchema")) {
    fail("server test does not assert advertised outputSchema");
}
if (!readmeText.includes("output schema")) {
    fail("README does not document output schema");
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget} target`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(wiring.makeTarget)) fail(`Makefile contract-gates missing ${wiring.makeTarget}`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile ${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile ${wiring.makeTarget} target does not run checker`);

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) fail(`docs/README.md missing ${wiring.docsIndexContract}`);

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("MCP contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`MCP contract passed (${summary.totalTools} tools, ${contract.expected.resources.length} resources, ${contract.expected.prompts.length} prompts)`);

function readEvidence(label) {
    const relativePath = contract.sourceEvidence?.[label];
    if (!relativePath) return "";
    return readRelative(relativePath, `sourceEvidence.${label}`);
}
