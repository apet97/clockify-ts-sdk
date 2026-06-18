#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isLiveTarget, loadRetiredGates } from "./lib/gate-targets.mjs";

const root = process.cwd();
let failures = [];
const contract = JSON.parse(await readRel("docs/data-handling-contract.json", "contractPath"));

async function readRel(relPath, label = relPath) {
    const safePath = dataHandlingRelativePath(label, relPath);
    if (safePath == null) return "";
    return readFile(path.join(root, safePath), "utf8");
}

async function existsRel(relPath, label = relPath) {
    const safePath = dataHandlingRelativePath(label, relPath);
    if (safePath == null) return false;
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

function dataHandlingRelativePath(label, relativePath) {
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

function assertStringArray(label, values, { allowEmpty = true } = {}) {
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && values.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return values.filter((value) => typeof value === "string" && value.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "data-handling") {
            fail("wiring.makeTarget", `must be data-handling, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "data-handling") {
            fail("wiring.enterpriseAuditId", `must be data-handling, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = dataHandlingRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-data-handling.mjs") {
            fail("wiring.checker", `must be scripts/check-data-handling.mjs, got ${contract.wiring.checker ?? "(missing)"}`);
        }
    }

    dataHandlingRelativePath("policy.path", contract.policy?.path);
    assertUnique(
        "policy.contains",
        assertStringArray("policy.contains", contract.policy?.contains, { allowEmpty: false }),
    );
    assertUnique(
        "policy.forbiddenMarkers",
        assertStringArray("policy.forbiddenMarkers", contract.policy?.forbiddenMarkers ?? []),
    );

    for (const field of ["requiredTargets", "requiredDocs"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
        if (field === "requiredDocs") {
            for (const [index, docPath] of values.entries()) {
                dataHandlingRelativePath(`${field}[${index}]`, docPath);
            }
        }
    }

    if (!Array.isArray(contract.dataClasses) || contract.dataClasses.length === 0) {
        fail("dataClasses", "must be a non-empty array");
    }
    assertUnique(
        "dataClasses.id",
        (contract.dataClasses ?? [])
            .map((dataClass) => dataClass?.id)
            .filter((dataClassId) => typeof dataClassId === "string"),
    );
    for (const [index, dataClass] of (contract.dataClasses ?? []).entries()) {
        const label = dataClass?.id ?? `dataClasses[${index}]`;
        if (dataClass == null || typeof dataClass !== "object" || Array.isArray(dataClass)) {
            fail(label, "data class must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.id`, dataClass.id);
        assertUnique(
            `${label}.markers`,
            assertStringArray(`${label}.markers`, dataClass.markers, { allowEmpty: false }),
        );
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
        const label = `supportingEvidence[${index}]`;
        if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
            fail(label, "must be an object");
            continue;
        }
        dataHandlingRelativePath(`${label}.path`, evidence.path);
        assertUnique(
            `${label}.contains`,
            assertStringArray(`${label}.contains`, evidence.contains, { allowEmpty: false }),
        );
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Data handling contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = await readRel("Makefile");
const retiredGates = await loadRetiredGates();
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const policy = await readRel(contract.policy?.path, "policy.path");
includesAll(policy, contract.policy?.contains ?? [], contract.policy?.path ?? "policy.path");
for (const marker of contract.policy?.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) fail(contract.policy?.path ?? "policy.path", `contains forbidden marker ${marker}`);
}

for (const dataClass of contract.dataClasses ?? []) {
    includesAll(policy, dataClass.markers, `${contract.policy?.path ?? "policy.path"} data class ${dataClass.id}`);
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath, docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path, evidence.path))) {
        fail("supportingEvidence", `missing ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path, evidence.path), evidence.contains, evidence.path);
}

for (const target of contract.requiredTargets ?? []) {
    if (!isLiveTarget(makefile, target, retiredGates)) fail("Makefile", `missing target ${target}`);
}

if (!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing data-handling");
}
if (!qualityGates.includes("make data-handling")) {
    fail("docs/quality-gates.md", "missing make data-handling");
}
if (!docsIndex.includes("./data-handling-policy.md")) {
    fail("docs/README.md", "missing data handling policy link");
}
if (!docsIndex.includes("./data-handling-contract.json")) {
    fail("docs/README.md", "missing data handling contract link");
}
if (!contractInventory.includes('"id": "data-handling"')) {
    fail("docs/contract-inventory.json", "missing data-handling entry");
}
if (!enterpriseAudit.includes('"id": "data-handling"')) {
    fail("docs/enterprise-hardening-audit.json", "missing data-handling audit entry");
}

if (failures.length > 0) {
    console.error("Data handling contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Data handling contract passed (${contract.dataClasses.length} data classes checked).`);
