#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/axioms-contract.json", "contract")) ?? {};

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

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

async function existsRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath === "") return false;
    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
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
    }
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function assertStringArray(label, values, { min = 0 } = {}) {
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

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.contains`, entry.contains, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, { min: 1 });
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-axioms-evidence-paths",
        "typed-axiom-document-contract",
        "typed-axiom-entries",
        "typed-supporting-evidence",
        "typed-wiring-contract",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    validateMarkerEntry("axiomsDocument", contract.axiomsDocument);

    if (!Array.isArray(contract.axioms) || contract.axioms.length !== 10) {
        fail("axioms", "must contain exactly 10 entries");
    }
    assertUnique(
        "axioms.id",
        (contract.axioms ?? []).map((axiom) => axiom?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, axiom] of (contract.axioms ?? []).entries()) {
        const label = axiom?.id ?? `axioms[${index}]`;
        if (!assertObject(label, axiom)) continue;
        assertNonEmptyString(`${label}.id`, axiom.id);
        assertStringArray(`${label}.markers`, axiom.markers, { min: 1 });
        assertStringArray(`${label}.evidence`, axiom.evidence, { min: 1 });
    }

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    assertUnique(
        "supportingEvidence.id",
        (contract.supportingEvidence ?? [])
            .map((evidence) => evidence?.id)
            .filter((evidenceId) => typeof evidenceId === "string"),
    );
    for (const [index, evidence] of (contract.supportingEvidence ?? []).entries()) {
        validateMarkerEntry(`supportingEvidence[${index}]`, evidence);
        assertNonEmptyString(`supportingEvidence[${index}].id`, evidence?.id);
    }

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Axioms contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const axiomsDoc = await readRel(contract.axiomsDocument.path);
includesAll(axiomsDoc, contract.axiomsDocument.contains, contract.axiomsDocument.path);
for (const marker of contract.axiomsDocument.forbiddenMarkers ?? []) {
    if (axiomsDoc.includes(marker)) fail(contract.axiomsDocument.path, `contains forbidden marker ${marker}`);
}
for (const axiom of contract.axioms ?? []) {
    includesAll(axiomsDoc, axiom.markers, `${contract.axiomsDocument.path} axiom ${axiom.id}`);
}

const evidenceById = new Map((contract.supportingEvidence ?? []).map((evidence) => [evidence.id, evidence]));
for (const axiom of contract.axioms ?? []) {
    for (const evidenceId of axiom.evidence ?? []) {
        if (!evidenceById.has(evidenceId)) fail(`axioms.${axiom.id}.evidence`, `missing supportingEvidence ${evidenceId}`);
    }
}
for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path, evidence.path))) {
        fail("supportingEvidence", `missing ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path), evidence.contains, evidence.path);
}

const makefile = await readRel("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget}`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker}`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = await readRel("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}
if (!docsIndex.includes("./axioms.md")) fail("docs/README.md", "missing axioms.md");

if (!(await readRel("docs/quality-gates.md")).includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!(await readRel("docs/enterprise-hardening-audit.json")).includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Axioms contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Axioms contract passed (${contract.axioms.length} axioms checked).`);
