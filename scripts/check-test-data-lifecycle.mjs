#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/test-data-lifecycle-contract.json", "contractPath");

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
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

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
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
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function checkEntry(entry) {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return "";

    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }
    return text;
}

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const mustContain = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, mustContain);
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 2) fail("schemaVersion", "must be 2");
    assertNonEmptyString("purpose", contract.purpose);

    validateMarkerEntry("policyDocument", contract.policyDocument);
    validateMarkerEntry("orchestrator", contract.orchestrator);
    validateMarkerEntry("cleanupLibrary", contract.cleanupLibrary);

    const prefixes = assertStringArray("prefixes", contract.prefixes, { allowEmpty: false });
    assertUnique("prefixes", prefixes);
    const entityOrder = assertStringArray("entityOrder", contract.entityOrder, { allowEmpty: false });
    assertUnique("entityOrder", entityOrder);

    for (const section of ["liveTests", "supportingEvidence"]) {
        if (!Array.isArray(contract[section]) || contract[section].length === 0) {
            fail(section, "must be a non-empty array");
            continue;
        }
        assertUnique(
            `${section}.path`,
            contract[section].map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
        );
        for (const [index, entry] of contract[section].entries()) {
            validateMarkerEntry(`${section}[${index}]`, entry);
        }
    }

    const requiredMakeTargets = assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, {
        allowEmpty: false,
    });
    assertUnique("requiredMakeTargets", requiredMakeTargets);

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        const docsIndex = assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, {
            allowEmpty: false,
        });
        assertUnique("wiring.docsIndex", docsIndex);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Test data lifecycle contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policyText = checkEntry(contract.policyDocument);
const orchestratorText = checkEntry(contract.orchestrator);
const cleanupText = checkEntry(contract.cleanupLibrary);
for (const prefix of contract.prefixes ?? []) {
    if (!policyText.includes(prefix)) fail(contract.policyDocument.path, `missing prefix ${prefix}`);
    if (!orchestratorText.includes(prefix)) fail(contract.orchestrator.path, `missing prefix ${prefix}`);
}

let priorOrderIndex = -1;
for (const entityType of contract.entityOrder ?? []) {
    const index = cleanupText.indexOf(JSON.stringify(entityType));
    if (index < 0) {
        fail(contract.cleanupLibrary.path, `missing cleanup entity ${entityType}`);
    } else if (index <= priorOrderIndex) {
        fail(contract.cleanupLibrary.path, `cleanup entity ${entityType} is out of dependency order`);
    }
    priorOrderIndex = index;
}
for (const entry of contract.liveTests ?? []) checkEntry(entry);
for (const entry of contract.supportingEvidence ?? []) checkEntry(entry);

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Test data lifecycle contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Test data lifecycle contract passed");
