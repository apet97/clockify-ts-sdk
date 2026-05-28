#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/quickstart-receipt-contract.json");

function fail(file, message) {
    failures.push(`${file}: ${message}`);
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
        fail(safePath, "missing file");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    return JSON.parse(text);
}

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const markers = assertStringArray(`${label}.${markerField}`, entry[markerField], {
        allowEmpty: false,
    });
    assertUnique(`${label}.${markerField}`, markers);
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("document", contract.document);
    validateMarkerEntry("receiptTemplate", contract.receiptTemplate, "requiredFields");

    if (!Array.isArray(contract.supportingSurfaces) || contract.supportingSurfaces.length === 0) {
        fail("supportingSurfaces", "must be a non-empty array");
    }
    assertUnique(
        "supportingSurfaces.path",
        (contract.supportingSurfaces ?? [])
            .map((surface) => surface?.path)
            .filter((surfacePath) => typeof surfacePath === "string"),
    );
    for (const [index, surface] of (contract.supportingSurfaces ?? []).entries()) {
        validateMarkerEntry(`supportingSurfaces[${index}]`, surface);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexDoc", contract.wiring.docsIndexDoc);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Quickstart receipt contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const documentText = readRelative(contract.document.path);
for (const marker of contract.document.contains ?? []) {
    if (!documentText.includes(marker)) fail(contract.document.path, `missing marker ${marker}`);
}
for (const marker of contract.document.forbiddenMarkers ?? []) {
    if (documentText.includes(marker)) fail(contract.document.path, `contains forbidden marker ${marker}`);
}

const receiptTemplateText = readRelative(contract.receiptTemplate.path);
for (const marker of contract.receiptTemplate.requiredFields ?? []) {
    if (!receiptTemplateText.includes(marker)) fail(contract.receiptTemplate.path, `missing receipt field ${marker}`);
}
for (const marker of contract.receiptTemplate.forbiddenMarkers ?? []) {
    if (receiptTemplateText.includes(marker)) fail(contract.receiptTemplate.path, `contains forbidden quickstart marker ${marker}`);
}

for (const surface of contract.supportingSurfaces ?? []) {
    const text = readRelative(surface.path);
    for (const marker of surface.contains ?? []) {
        if (!text.includes(marker)) fail(surface.path, `missing supporting marker ${marker}`);
    }
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
if (!makefile.includes(`node ${wiring.checker}`)) {
    fail("Makefile", "quickstart-receipt target does not run checker");
}
for (const target of ["perfect-fast", "perfect-full"]) {
    if (!targetLine(makefile, target).includes(wiring.makeTarget)) {
        fail("Makefile", `${target} missing ${wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const marker of [wiring.docsIndexDoc, wiring.docsIndexContract]) {
    if (!docsIndex.includes(marker)) fail("docs/README.md", `missing ${marker}`);
}

const docIndexChecker = readRelative("scripts/check-doc-index.mjs");
for (const marker of [wiring.docsIndexDoc, wiring.docsIndexContract]) {
    if (!docIndexChecker.includes(marker)) fail("scripts/check-doc-index.mjs", `missing ${marker}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail("docs/quality-gates.md", "missing make quickstart-receipt");
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Quickstart receipt contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Quickstart receipt contract passed");

function targetLine(text, target) {
    return text.split("\n").find((line) => line.startsWith(`${target}:`)) ?? "";
}
