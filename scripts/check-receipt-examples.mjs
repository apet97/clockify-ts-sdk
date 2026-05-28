#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/receipt-examples-contract.json", "contractPath");

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

async function existsRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath == null) return false;
    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
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
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
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
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("examplesDocument", contract.examplesDocument);

    const requiredDocs = assertStringArray("requiredDocs", contract.requiredDocs, { allowEmpty: false });
    assertUnique("requiredDocs", requiredDocs);
    for (const [index, docPath] of requiredDocs.entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }

    if (!Array.isArray(contract.examples) || contract.examples.length === 0) {
        fail("examples", "must be a non-empty array");
    }
    assertUnique(
        "examples.id",
        (contract.examples ?? []).map((example) => example?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, example] of (contract.examples ?? []).entries()) {
        const label = example?.id ?? `examples[${index}]`;
        if (!assertObject(label, example)) continue;
        assertNonEmptyString(`${label}.id`, example.id);
        assertNonEmptyString(`${label}.surface`, example.surface);
        const requiredMarkers = assertStringArray(`${label}.requiredMarkers`, example.requiredMarkers, {
            allowEmpty: false,
        });
        assertUnique(`${label}.requiredMarkers`, requiredMarkers);
    }

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    assertUnique(
        "supportingEvidence.path",
        (contract.supportingEvidence ?? [])
            .map((evidence) => evidence?.path)
            .filter((evidencePath) => typeof evidencePath === "string"),
    );
    for (const [index, evidence] of (contract.supportingEvidence ?? []).entries()) {
        validateMarkerEntry(`supportingEvidence[${index}]`, evidence);
    }

    const requiredTargets = assertStringArray("requiredTargets", contract.requiredTargets, {
        allowEmpty: false,
    });
    assertUnique("requiredTargets", requiredTargets);

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexDoc", contract.wiring.docsIndexDoc);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Receipt examples contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const examplesDoc = await readRel(contract.examplesDocument.path);
includesAll(examplesDoc, contract.examplesDocument.contains, contract.examplesDocument.path);
for (const marker of contract.examplesDocument.forbiddenMarkers ?? []) {
    if (examplesDoc.includes(marker)) fail(contract.examplesDocument.path, `contains forbidden marker ${marker}`);
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const example of contract.examples ?? []) {
    if (!example.id || !example.surface) fail(example.id ?? "example", "missing id or surface");
    includesAll(examplesDoc, example.requiredMarkers, `${contract.examplesDocument.path} example ${example.id}`);
}

for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path))) {
        fail("supportingEvidence", `missing ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path), evidence.contains, evidence.path);
}

const makefile = await readRel("Makefile");
for (const target of contract.requiredTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}

const wiring = contract.wiring ?? {};
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) {
    fail("Makefile", `${wiring.makeTarget} target does not run checker`);
}

const qualityGates = await readRel("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);
}

const docsIndex = await readRel("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexDoc}`)) {
    fail("docs/README.md", "missing receipt examples link");
}
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
    fail("docs/README.md", "missing receipt examples contract link");
}

const contractInventory = await readRel("docs/contract-inventory.json");
if (!contractInventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", "missing receipt-examples entry");
}

const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");
if (!enterpriseAudit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", "missing receipt-examples audit entry");
}

if (failures.length > 0) {
    console.error("Receipt examples contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const exampleCount = Array.isArray(contract.examples) ? contract.examples.length : 0;
console.log(`Receipt examples contract passed (${exampleCount} examples checked).`);
