#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/cli-write-safety-contract.json", "contractPath");

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

function assertContains(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
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

    if (!Array.isArray(contract.writeCommands) || contract.writeCommands.length === 0) {
        fail("writeCommands", "must be a non-empty array");
    }
    assertUnique(
        "writeCommands.name",
        (contract.writeCommands ?? [])
            .map((command) => command?.name)
            .filter((commandName) => typeof commandName === "string"),
    );
    for (const [index, command] of (contract.writeCommands ?? []).entries()) {
        const label = command?.name ?? `writeCommands[${index}]`;
        if (!assertObject(label, command)) continue;
        assertNonEmptyString(`${label}.name`, command.name);
        safeRelativePath(`${label}.path`, command.path);
        assertNonEmptyString(`${label}.readmeCommand`, command.readmeCommand);
        const markers = assertStringArray(`${label}.markers`, command.markers, { allowEmpty: false });
        assertUnique(`${label}.markers`, markers);
    }

    const forbiddenPolicyMarkers = assertStringArray(
        "forbiddenPolicyMarkers",
        contract.forbiddenPolicyMarkers,
        { allowEmpty: false },
    );
    assertUnique("forbiddenPolicyMarkers", forbiddenPolicyMarkers);

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

validateContractShape();
if (failures.length > 0) {
    console.error("CLI write-safety contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const readme = await readRel("cli/README.md");

for (const file of contract.requiredFiles) {
    const text = await readRel(file.path);
    assertContains(text, file.contains, file.path);
    for (const marker of contract.forbiddenPolicyMarkers) {
        if (text.includes(marker)) failures.push(`${file.path} contains forbidden marker: ${marker}`);
    }
}

for (const command of contract.writeCommands) {
    const text = await readRel(command.path);
    assertContains(text, command.markers, command.name);
    if (!readme.includes(command.readmeCommand)) {
        failures.push(`cli/README.md missing command marker for ${command.name}: ${command.readmeCommand}`);
    }
}

for (const command of contract.writeCommands.filter((item) => item.name.includes("delete"))) {
    const text = await readRel(command.path);
    if (!text.includes(".argument(\"<id>\"")) {
        failures.push(`${command.name} is destructive but lacks explicit <id> argument`);
    }
    if (!/printSuccess\(`deleted /.test(text)) {
        failures.push(`${command.name} is destructive but lacks deleted-resource success receipt`);
    }
}

if (!readme.includes("Exit codes")) {
    failures.push("cli/README.md missing Exit codes section");
}
if (!readme.includes("Errors go to stderr")) {
    failures.push("cli/README.md missing JSON error stream contract");
}

const makefile = await readRel("Makefile");
const wiring = contract.wiring ?? {};
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
    failures.push("docs/README.md missing CLI write safety policy link");
}
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
    failures.push("docs/README.md missing CLI write safety contract link");
}

const contractInventory = await readRel("docs/contract-inventory.json");
if (!contractInventory.includes(`"id": "${wiring.inventoryId}"`)) {
    failures.push("docs/contract-inventory.json missing cli-write-safety entry");
}

const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");
if (!enterpriseAudit.includes(`"id": "${wiring.auditId}"`)) {
    failures.push("docs/enterprise-hardening-audit.json missing cli-write-safety audit entry");
}

if (failures.length > 0) {
    console.error("CLI write-safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const writeCommandCount = Array.isArray(contract.writeCommands) ? contract.writeCommands.length : 0;
console.log(`CLI write-safety contract passed (${writeCommandCount} write commands checked).`);
