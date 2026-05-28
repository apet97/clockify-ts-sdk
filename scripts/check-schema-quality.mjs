#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/schema-quality-contract.json", "contract") ?? {};

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(label, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(label, "must be a non-empty string");
        return false;
    }
    return true;
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value < 1) {
        fail(label, "must be a positive integer");
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(label, `must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { required = true, min = 0 } = {}) {
    if (values == null && !required) return [];
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (values.length < min) fail(label, `must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]`, "must be a non-empty string");
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateEntryCollection(label, entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        fail(label, "must be a non-empty array");
        return;
    }
    for (const [index, entry] of entries.entries()) validateEntry(`${label}[${index}]`, entry);
    assertUnique(
        `${label}.path`,
        entries.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntry("policyDocument", contract.policyDocument);
    validateEntry("correctedSpec", contract.correctedSpec);
    validateEntry("evidenceLedger", contract.evidenceLedger);
    validateEntryCollection("generatedSdkEvidence", contract.generatedSdkEvidence);
    validateEntryCollection("supportingEvidence", contract.supportingEvidence);

    if (assertObject("thresholds", contract.thresholds)) {
        assertPositiveInteger("thresholds.minimumAdditionalPropertiesMarkers", contract.thresholds.minimumAdditionalPropertiesMarkers);
        assertPositiveInteger("thresholds.minimumEnumBlocks", contract.thresholds.minimumEnumBlocks);
        assertPositiveInteger("thresholds.minimumSdkMethodStamps", contract.thresholds.minimumSdkMethodStamps);
    }

    assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function checkEntry(entry) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }
    return text;
}

validateContractShape();

if (failures.length > 0) {
    console.error("Schema quality contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
const specText = checkEntry(contract.correctedSpec);
checkEntry(contract.evidenceLedger);
// wrapper/src is gitignored and populated by `(cd wrapper && npm run sync)`
// from the Fern output. If it's absent, skip the generated evidence checks
// with a warning so perfect-fast can still run on non-SDK workflows.
if (fs.existsSync(path.join(root, "wrapper/src"))) {
    for (const entry of contract.generatedSdkEvidence ?? []) checkEntry(entry);
} else {
    console.warn(
        "Skipped generatedSdkEvidence: wrapper/src is not populated. " +
        "Run `(cd spec/fern && fern generate --group ts --local --force)` + `(cd wrapper && npm run sync)` first.",
    );
}
for (const entry of contract.supportingEvidence ?? []) checkEntry(entry);

const additionalPropertiesCount = (specText.match(/additionalProperties:/g) ?? []).length;
if (additionalPropertiesCount < contract.thresholds.minimumAdditionalPropertiesMarkers) {
    fail(contract.correctedSpec.path, `expected at least ${contract.thresholds.minimumAdditionalPropertiesMarkers} explicit additionalProperties marker(s) for review discipline`);
}

const enumCount = (specText.match(/^\s+enum:\s*$/gm) ?? []).length;
if (enumCount < contract.thresholds.minimumEnumBlocks) {
    fail(contract.correctedSpec.path, `expected at least ${contract.thresholds.minimumEnumBlocks} enum blocks, got ${enumCount}`);
}

const sdkStampCount = (specText.match(/x-fern-sdk-method-name:/g) ?? []).length;
if (sdkStampCount < contract.thresholds.minimumSdkMethodStamps) {
    fail(contract.correctedSpec.path, `expected at least ${contract.thresholds.minimumSdkMethodStamps} x-fern-sdk-method-name stamps, got ${sdkStampCount}`);
}

const makefile = readRelative("Makefile");
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(contract.wiring.makeTarget)) fail("Makefile", `${target} missing ${contract.wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Schema quality contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Schema quality contract passed");
