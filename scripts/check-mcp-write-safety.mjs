#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/mcp-write-safety-contract.json", "contractPath");

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

async function readRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath == null) return "";

    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(safePath, "missing file");
        return "";
    }
}

async function readJson(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value <= 0) {
        fail(label, "must be a positive integer");
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const markers = assertStringArray(`${label}.${markerField}`, entry[markerField], {
        allowEmpty: false,
    });
    assertUnique(`${label}.${markerField}`, markers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-mcp-write-evidence-paths",
        "typed-destructive-tool-threshold",
        "typed-workflow-tool-lists",
        "typed-required-file-evidence",
        "typed-workflow-marker-contracts",
        "typed-forbidden-policy-markers",
        "typed-wiring-contract",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    assertPositiveInteger("minimumDestructiveToolCount", contract.minimumDestructiveToolCount);

    for (const field of ["highRiskWorkflowTools", "idempotentWorkflowTools"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }

    if (!Array.isArray(contract.requiredFiles) || contract.requiredFiles.length === 0) {
        fail("requiredFiles", "must be a non-empty array");
    }
    assertUnique(
        "requiredFiles.path",
        (contract.requiredFiles ?? []).map((file) => file?.path).filter((filePath) => typeof filePath === "string"),
    );
    for (const [index, file] of (contract.requiredFiles ?? []).entries()) {
        validateMarkerEntry(`requiredFiles[${index}]`, file);
    }

    for (const field of ["workflowRequiredMarkers", "confirmationRequiredMarkers", "forbiddenPolicyMarkers"]) {
        const markers = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, markers);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        safeRelativePath("wiring.toolsDirectory", contract.wiring.toolsDirectory);
        assertNonEmptyString("wiring.workflowsFile", contract.wiring.workflowsFile);
        assertNonEmptyString("wiring.docsIndexPolicy", contract.wiring.docsIndexPolicy);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("MCP write-safety contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const file of contract.requiredFiles) {
    const text = await readRel(file.path);
    includesAll(text, file.contains, file.path);
    for (const marker of contract.forbiddenPolicyMarkers) {
        if (text.includes(marker)) failures.push(`${file.path} contains forbidden marker: ${marker}`);
    }
}

const wiring = contract.wiring ?? {};
const workflows = await readRel(wiring.workflowsFile);
includesAll(workflows, contract.confirmationRequiredMarkers, "mcp/src/tools/workflows.ts confirmation flow");

for (const toolName of contract.highRiskWorkflowTools) {
    const registration = registrationBlock(workflows, toolName);
    if (!registration) {
        failures.push(`mcp/src/tools/workflows.ts missing registration for ${toolName}`);
        continue;
    }
    includesAll(registration, contract.workflowRequiredMarkers.filter((marker) => marker !== "maybeConfirm"), `${toolName} registration`);
    if (!workflows.includes(`maybeConfirm(ctx, "${toolName}"`)) {
        failures.push(`${toolName} does not call maybeConfirm before execution`);
    }
    if (!workflows.includes(`successResult("${toolName}"`)) {
        failures.push(`${toolName} does not return a success receipt`);
    }
}

const destructiveTools = await discoverDestructiveTools();
if (destructiveTools.length < contract.minimumDestructiveToolCount) {
    failures.push(
        `expected at least ${contract.minimumDestructiveToolCount} destructive MCP tools, found ${destructiveTools.length}`,
    );
}

for (const tool of destructiveTools) {
    if (contract.highRiskWorkflowTools.includes(tool.name)) continue;
    if (contract.idempotentWorkflowTools.includes(tool.name)) {
        if (!tool.registration.includes("idempotentHint: true")) {
            failures.push(`${tool.name} is idempotent workflow but lacks idempotentHint: true`);
        }
        if (!tool.body.includes("clockify_demo_cleanup")) {
            failures.push(`${tool.name} does not point to demo cleanup`);
        }
        continue;
    }

    if (!/delete|remove|archive/i.test(tool.name) && !/delete|remove|archive/i.test(tool.registration)) {
        failures.push(`${tool.name} is destructive but does not advertise delete/remove/archive semantics`);
    }
    if (!/deleted|removed|archived/i.test(tool.body)) {
        failures.push(`${tool.name} is destructive but does not return a delete/remove/archive receipt`);
    }
    if (!/Id\b|Id:|id:/i.test(tool.registration)) {
        failures.push(`${tool.name} is destructive but does not appear ID-scoped`);
    }
}

if (!workflows.includes("confirm_token: issued.confirmToken")) {
    failures.push("confirmation preview does not expose confirm_token in receipt data");
}
if (!workflows.includes("store.validate(str(args.confirm_token), payload)")) {
    failures.push("confirmation execution does not validate confirm_token against stable payload");
}

const makefile = await readRel("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) failures.push(`Makefile missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) failures.push(`Makefile ${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) {
    failures.push(`Makefile ${wiring.makeTarget} target does not run checker`);
}

const qualityGates = await readRel("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    failures.push(`docs/quality-gates.md missing ${wiring.qualityGate}`);
}

const docsIndex = await readRel("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexPolicy}`)) {
    failures.push("docs/README.md missing MCP write safety policy link");
}
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
    failures.push("docs/README.md missing MCP write safety contract link");
}

const contractInventory = await readRel("docs/contract-inventory.json");
if (!contractInventory.includes(`"id": "${wiring.inventoryId}"`)) {
    failures.push("docs/contract-inventory.json missing mcp-write-safety entry");
}

const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");
if (!enterpriseAudit.includes(`"id": "${wiring.auditId}"`)) {
    failures.push("docs/enterprise-hardening-audit.json missing mcp-write-safety audit entry");
}

if (failures.length > 0) {
    console.error("MCP write-safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`MCP write-safety contract passed (${destructiveTools.length} destructive tools checked).`);

function registrationBlock(text, toolName) {
    const pattern = `server.registerTool(\n        "${toolName}"`;
    let start = text.indexOf(pattern);
    if (start === -1) {
        const looser = new RegExp(`server\\.registerTool\\(\\s*"${toolName}"`);
        const match = text.match(looser);
        if (!match) return "";
        start = match.index ?? -1;
        if (start === -1) return "";
    }
    const callbackStart = text.indexOf("async (args", start);
    const fallbackEnd = text.indexOf("server.registerTool", start + 1);
    const end = callbackStart === -1 ? (fallbackEnd === -1 ? start + 1600 : fallbackEnd) : callbackStart;
    return text.slice(start, end);
}

async function discoverDestructiveTools() {
    const toolsDirectory = safeRelativePath("wiring.toolsDirectory", contract.wiring?.toolsDirectory) ?? "mcp/src/tools";
    const dir = path.join(root, toolsDirectory);
    const files = (await readdir(dir)).filter((file) => file.endsWith(".ts")).sort();
    const tools = [];

    for (const file of files) {
        const relPath = `mcp/src/tools/${file}`;
        const text = await readRel(relPath);
        let offset = 0;
        while (offset < text.length) {
            const start = text.indexOf("server.registerTool", offset);
            if (start === -1) break;
            const next = text.indexOf("server.registerTool", start + 1);
            const whole = text.slice(start, next === -1 ? text.length : next);
            offset = start + 1;

            if (!/destructiveHint:\s*true/.test(whole)) continue;
            const nameMatch = whole.match(/server\.registerTool\(\s*"([^"]+)"/);
            if (!nameMatch) continue;
            const callbackStart = whole.indexOf("async (args");
            const registration = callbackStart === -1 ? whole.slice(0, 1600) : whole.slice(0, callbackStart);
            const body = callbackStart === -1 ? whole : whole.slice(callbackStart);
            tools.push({ name: nameMatch[1], file: relPath, registration, body });
        }
    }

    return tools;
}
