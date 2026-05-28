#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/openapi-evidence-contract.json", "contract") ?? {};

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

function validateLedger() {
    if (!assertObject("ledger", contract.ledger)) return;
    safeRelativePath("ledger.path", contract.ledger.path);
    assertStringArray("ledger.mustContain", contract.ledger.mustContain, { min: 1 });
    assertStringArray("ledger.requiredFindings", contract.ledger.requiredFindings, { min: 1 });
    assertStringArray("ledger.requiredStatusMarkers", contract.ledger.requiredStatusMarkers, { min: 1 });
}

function validateSupportingEvidence() {
    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
        return;
    }
    for (const [index, evidence] of contract.supportingEvidence.entries()) {
        validateEntry(`supportingEvidence[${index}]`, evidence);
    }
    assertUnique(
        "supportingEvidence.path",
        contract.supportingEvidence.map((evidence) => evidence?.path).filter((evidencePath) => typeof evidencePath === "string"),
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntry("policyDocument", contract.policyDocument);
    validateLedger();
    validateSupportingEvidence();
    assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function checkContains(id, text, markers) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(id, `missing marker ${JSON.stringify(marker)}`);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("OpenAPI evidence contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policyText = readRelative(contract.policyDocument.path);
checkContains(contract.policyDocument.path, policyText, contract.policyDocument.mustContain);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policyText.includes(marker)) fail(contract.policyDocument.path, `contains forbidden marker ${marker}`);
}

const ledgerText = readRelative(contract.ledger.path);
checkContains(contract.ledger.path, ledgerText, contract.ledger.mustContain);
checkContains(contract.ledger.path, ledgerText, contract.ledger.requiredFindings);
checkContains(contract.ledger.path, ledgerText, contract.ledger.requiredStatusMarkers);

for (const evidence of contract.supportingEvidence ?? []) {
    const text = readRelative(evidence.path);
    checkContains(evidence.path, text, evidence.mustContain);
}

const makefile = readRelative("Makefile");
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("OpenAPI evidence contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("OpenAPI evidence contract passed");
