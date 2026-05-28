#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = "docs/mcp-agent-ux-contract.json";
const errors = [];
const contract = readJson(contractPath, "contractPath");

function safeRelativePath(label, relativePath) {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    errors.push(`${label}: must be a non-empty string`);
    return null;
  }
  const normalized = path.normalize(relativePath);
  if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    errors.push(`${label}: must be a repo-relative path without parent traversal`);
    return null;
  }
  return normalized;
}

function read(relativePath, label = relativePath) {
  const safePath = safeRelativePath(label, relativePath);
  if (safePath == null) return "";

  try {
    return fs.readFileSync(path.join(root, safePath), "utf8");
  } catch (error) {
    errors.push(`${safePath}: missing or unreadable (${error.message})`);
    return "";
  }
}

function readJson(relativePath, label = relativePath) {
  const text = read(relativePath, label);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${label}: missing or invalid JSON (${error.message})`);
    return {};
  }
}

function assertNonEmptyString(label, value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label}: must be a non-empty string`);
  }
}

function assertNonNegativeInteger(label, value) {
  if (!Number.isInteger(value) || value < 0) {
    errors.push(`${label}: must be a non-negative integer`);
  }
}

function assertObject(label, value) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label}: must be an object`);
    return false;
  }
  return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${label}: must be an array`);
    return [];
  }
  if (!allowEmpty && value.length === 0) {
    errors.push(`${label}: must be a non-empty array`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      errors.push(`${label}: contains a non-string or empty entry`);
    }
  }
  return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
  const seen = new Set();
  for (const value of values ?? []) {
    if (seen.has(value)) errors.push(`${label}: duplicate ${value}`);
    seen.add(value);
  }
}

function validateContractShape() {
  if (contract.schemaVersion !== 1) errors.push("schemaVersion: must be 1");
  assertNonEmptyString("purpose", contract.purpose);


  safeRelativePath("toolsMetadata", contract.toolsMetadata);

  if (assertObject("expectedToolSummary", contract.expectedToolSummary)) {
    for (const field of ["totalTools", "workflowTools", "domainTools"]) {
      assertNonNegativeInteger(`expectedToolSummary.${field}`, contract.expectedToolSummary[field]);
    }
    const requiredWorkflowTools = assertStringArray(
      "expectedToolSummary.requiredWorkflowTools",
      contract.expectedToolSummary.requiredWorkflowTools,
      { allowEmpty: false },
    );
    assertUnique("expectedToolSummary.requiredWorkflowTools", requiredWorkflowTools);
  }

  if (!Array.isArray(contract.checks) || contract.checks.length === 0) {
    errors.push("checks: must be a non-empty array");
  }
  assertUnique(
    "checks.id",
    (contract.checks ?? []).map((check) => check?.id).filter((id) => typeof id === "string"),
  );
  assertUnique(
    "checks.path",
    (contract.checks ?? []).map((check) => check?.path).filter((checkPath) => typeof checkPath === "string"),
  );
  for (const [index, check] of (contract.checks ?? []).entries()) {
    const label = check?.id ?? `checks[${index}]`;
    if (!assertObject(label, check)) continue;
    assertNonEmptyString(`${label}.id`, check.id);
    safeRelativePath(`${label}.path`, check.path);
    const markers = assertStringArray(`${label}.markers`, check.markers, { allowEmpty: false });
    assertUnique(`${label}.markers`, markers);
  }

  if (assertObject("wiring", contract.wiring)) {
    assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
    safeRelativePath("wiring.checker", contract.wiring.checker);
    assertNonEmptyString("wiring.docsIndexPolicy", contract.wiring.docsIndexPolicy);
    assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
    assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
    assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
    assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
  }
}

function toolName(tool) {
  if (!tool || typeof tool !== "object") return undefined;
  return tool.name || tool.id || tool.tool || tool.toolName;
}

validateContractShape();
if (errors.length) {
  console.error("MCP agent UX contract shape failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

for (const check of contract.checks ?? []) {
  const text = read(check.path);
  for (const marker of check.markers) {
    if (!text.includes(marker)) {
      errors.push(`${check.path}: missing marker for ${check.id}: ${marker}`);
    }
  }
}

const toolsPath = contract.toolsMetadata;
const tools = readJson(toolsPath, "toolsMetadata");

if (tools && Object.keys(tools).length > 0) {
  const expected = contract.expectedToolSummary;
  const summary = tools.summary || {};
  const workflowTools = Array.isArray(tools.workflowTools) ? tools.workflowTools : [];
  const domainGroups = Array.isArray(tools.domainGroups) ? tools.domainGroups : [];
  const workflowNames = new Set(workflowTools.map(toolName).filter(Boolean));
  const domainCount = domainGroups.reduce((count, group) => {
    if (Array.isArray(group.tools)) return count + group.tools.length;
    if (typeof group.count === "number") return count + group.count;
    return count;
  }, 0);

  if (summary.totalTools !== expected.totalTools) {
    errors.push(`${toolsPath}: expected ${expected.totalTools} total tools, found ${summary.totalTools}`);
  }
  if (summary.workflowTools !== expected.workflowTools) {
    errors.push(`${toolsPath}: expected ${expected.workflowTools} workflow tools, found ${summary.workflowTools}`);
  }
  if (summary.domainTools !== expected.domainTools) {
    errors.push(`${toolsPath}: expected ${expected.domainTools} domain tools, found ${summary.domainTools}`);
  }
  if (workflowTools.length !== expected.workflowTools) {
    errors.push(`${toolsPath}: workflowTools array has ${workflowTools.length} entries, expected ${expected.workflowTools}`);
  }
  if (domainCount !== expected.domainTools) {
    errors.push(`${toolsPath}: domainGroups contain ${domainCount} tools, expected ${expected.domainTools}`);
  }

  for (const name of expected.requiredWorkflowTools) {
    if (!workflowNames.has(name)) {
      errors.push(`${toolsPath}: missing required workflow tool ${name}`);
    }
  }
}

const makefile = read("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) errors.push(`Makefile: missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
  const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
  if (!line.includes(wiring.makeTarget)) errors.push(`Makefile: ${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) {
  errors.push(`Makefile: ${wiring.makeTarget} target does not run checker`);
}

const docsIndex = read("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexPolicy}`)) {
  errors.push(`docs/README.md: missing ${wiring.docsIndexPolicy}`);
}
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
  errors.push(`docs/README.md: missing ${wiring.docsIndexContract}`);
}

const qualityGates = read("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
  errors.push(`docs/quality-gates.md: missing ${wiring.qualityGate}`);
}

const inventory = read("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
  errors.push(`docs/contract-inventory.json: missing ${wiring.inventoryId}`);
}

const audit = read("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
  errors.push(`docs/enterprise-hardening-audit.json: missing ${wiring.auditId}`);
}

if (errors.length) {
  console.error("MCP agent UX contract failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("MCP agent UX contract passed");
