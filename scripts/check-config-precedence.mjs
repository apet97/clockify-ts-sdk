#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/config-precedence-contract.json", "contract")) ?? {};

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relPath).replace(/\\/g, "/");
    const segments = relPath.split(/[\\/]+/);
    if (path.isAbsolute(relPath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relPath}`);
        return "";
    }

    return normalized;
}

async function readRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath === "") return "";

    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(label, "missing");
        return "";
    }
}

async function readJsonRel(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

async function existsRel(relPath) {
    const safePath = safeRelativePath("existsRel", relPath);
    if (safePath === "") return false;

    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
    }
}

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
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

function validatePolicyDocument() {
    if (!assertObject("policyDocument", contract.policyDocument)) return;
    safeRelativePath("policyDocument.path", contract.policyDocument.path);
    assertStringArray("policyDocument.contains", contract.policyDocument.contains, { min: 1 });
    assertStringArray("policyDocument.forbiddenMarkers", contract.policyDocument.forbiddenMarkers, {
        required: false,
    });
}

function validateSurface(index, surface) {
    const label = `surfaces[${index}]`;
    if (!assertObject(label, surface)) return;
    assertNonEmptyString(`${label}.id`, surface.id);
    safeRelativePath(`${label}.evidence`, surface.evidence);
    assertStringArray(`${label}.markers`, surface.markers, { min: 1 });
}

function validateSupportingEvidence(index, evidence) {
    const label = `supportingEvidence[${index}]`;
    if (!assertObject(label, evidence)) return;
    safeRelativePath(`${label}.path`, evidence.path);
    assertStringArray(`${label}.contains`, evidence.contains, { min: 1 });
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validatePolicyDocument();
    assertStringArray("requiredTargets", contract.requiredTargets, { min: 1 });
    for (const [index, docPath] of assertStringArray("requiredDocs", contract.requiredDocs, { min: 1 }).entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }

    if (!Array.isArray(contract.surfaces) || contract.surfaces.length === 0) {
        fail("surfaces", "must be a non-empty array");
    }
    for (const [index, surface] of (contract.surfaces ?? []).entries()) validateSurface(index, surface);
    assertUnique(
        "surfaces.id",
        (contract.surfaces ?? []).map((surface) => surface?.id).filter((id) => typeof id === "string"),
    );
    assertUnique(
        "surfaces.evidence",
        (contract.surfaces ?? [])
            .map((surface) => surface?.evidence)
            .filter((evidence) => typeof evidence === "string"),
    );

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    for (const [index, evidence] of (contract.supportingEvidence ?? []).entries()) {
        validateSupportingEvidence(index, evidence);
    }
    assertUnique(
        "supportingEvidence.path",
        (contract.supportingEvidence ?? [])
            .map((evidence) => evidence?.path)
            .filter((evidencePath) => typeof evidencePath === "string"),
    );

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Configuration precedence contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const policy = await readRel(contract.policyDocument.path);
includesAll(policy, contract.policyDocument.contains, contract.policyDocument.path);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) fail(contract.policyDocument.path, `contains forbidden marker ${marker}`);
}

for (const surface of contract.surfaces ?? []) {
    if (!(await existsRel(surface.evidence))) {
        fail(surface.id, `missing evidence ${surface.evidence}`);
        continue;
    }
    includesAll(await readRel(surface.evidence), surface.markers, surface.evidence);
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path))) {
        fail("supportingEvidence", `missing ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path), evidence.contains, evidence.path);
}

for (const target of contract.requiredTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
    fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
}
if (!makefile.includes(`node ${contract.wiring.checker}`)) {
    fail("Makefile", `missing ${contract.wiring.checker} invocation`);
}
if (!makefile.includes("perfect-fast:") || !makefile.includes("config-precedence")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing config-precedence");
}
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}
if (!contractInventory.includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!enterpriseAudit.includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Configuration precedence contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Configuration precedence contract passed (${contract.surfaces.length} surfaces checked).`);
