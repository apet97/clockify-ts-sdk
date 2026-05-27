#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/snippet-safety-contract.json"));
const failures = [];
const shapeFailures = [];

async function readRel(relPath) {
    return readFile(path.join(root, relPath), "utf8");
}

async function existsRel(relPath) {
    try {
        await stat(path.join(root, relPath));
        return true;
    } catch {
        return false;
    }
}

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function failShape(message) {
    shapeFailures.push(`contract: ${message}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function assertStringArray(value, field, { allowEmpty = false } = {}) {
    if (!Array.isArray(value)) {
        failShape(`${field} must be an array`);
        return [];
    }

    if (!allowEmpty && value.length === 0) {
        failShape(`${field} must not be empty`);
    }

    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        if (!isNonEmptyString(entry)) {
            failShape(`${field}[${index}] must be a non-empty string`);
            continue;
        }

        if (seen.has(entry)) {
            failShape(`${field} contains duplicate entry ${entry}`);
            continue;
        }

        seen.add(entry);
    }

    return value;
}

function assertSafeRelativePath(value, field) {
    if (!isNonEmptyString(value)) {
        failShape(`${field} must be a non-empty string path`);
        return;
    }

    if (path.isAbsolute(value)) {
        failShape(`${field} must be repo-relative, got ${value}`);
    }

    if (value.includes("\\") || value.includes("//")) {
        failShape(`${field} must use normalized forward-slash paths, got ${value}`);
    }

    if (value.split("/").includes("..")) {
        failShape(`${field} must not escape the repository, got ${value}`);
    }

    if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        failShape(`${field} contains unsupported path characters, got ${value}`);
    }
}

function assertMarkerObject(value, field) {
    if (!isPlainObject(value)) {
        failShape(`${field} must be an object`);
        return;
    }

    assertSafeRelativePath(value.path, `${field}.path`);
    assertStringArray(value.contains, `${field}.contains`);
}

function assertContractShape(value) {
    if (!isPlainObject(value)) {
        failShape("root must be a JSON object");
        return;
    }

    if (value.schemaVersion !== 1) {
        failShape(`schemaVersion must be 1, got ${value.schemaVersion ?? "(missing)"}`);
    }

    if (!isNonEmptyString(value.purpose)) {
        failShape("purpose must be a non-empty string");
    }

    const invariants = assertStringArray(value.contractInvariants, "contractInvariants");
    for (const requiredInvariant of [
        "safe-snippet-safety-paths",
        "typed-snippet-surfaces",
        "declared-forbidden-import-markers",
        "required-target-wiring",
        "required-doc-evidence",
        "supporting-evidence-marker-contract",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    if (!isPlainObject(value.policy)) {
        failShape("policy must be an object");
    } else {
        assertSafeRelativePath(value.policy.path, "policy.path");
        if (value.policy.path !== "docs/snippet-safety-policy.md") {
            failShape(`policy.path must be docs/snippet-safety-policy.md, got ${value.policy.path ?? "(missing)"}`);
        }
        assertStringArray(value.policy.contains, "policy.contains");
        assertStringArray(value.policy.forbiddenMarkers, "policy.forbiddenMarkers");
    }

    const requiredTargets = assertStringArray(value.requiredTargets, "requiredTargets");
    for (const target of [
        "snippet-safety",
        "examples-contract",
        "user-docs",
        "receipt-examples",
        "support-bundle",
        "live-safety",
        "docs-drift",
    ]) {
        if (!requiredTargets.includes(target)) {
            failShape(`requiredTargets must include ${target}`);
        }
    }

    for (const [index, docPath] of assertStringArray(value.requiredDocs, "requiredDocs").entries()) {
        assertSafeRelativePath(docPath, `requiredDocs[${index}]`);
    }

    const requiredSurfaceIds = assertStringArray(value.requiredSurfaceIds, "requiredSurfaceIds");
    if (!Array.isArray(value.snippetSurfaces) || value.snippetSurfaces.length === 0) {
        failShape("snippetSurfaces must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedSurfaceCount) || value.expectedSurfaceCount <= 0) {
        failShape("expectedSurfaceCount must be a positive integer");
    } else if (Array.isArray(value.snippetSurfaces) && value.expectedSurfaceCount !== value.snippetSurfaces.length) {
        failShape(`expectedSurfaceCount ${value.expectedSurfaceCount} does not match snippetSurfaces.length ${value.snippetSurfaces.length}`);
    }

    const surfaceIds = new Set();
    for (const [index, surface] of (Array.isArray(value.snippetSurfaces) ? value.snippetSurfaces : []).entries()) {
        const prefix = `snippetSurfaces[${index}]`;
        if (!isPlainObject(surface)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(surface.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (surfaceIds.has(surface.id)) {
                failShape(`${prefix}.id duplicates ${surface.id}`);
            }
            surfaceIds.add(surface.id);
        }

        assertSafeRelativePath(surface.path, `${prefix}.path`);
        assertStringArray(surface.contains, `${prefix}.contains`);
    }

    for (const requiredSurfaceId of requiredSurfaceIds) {
        if (!surfaceIds.has(requiredSurfaceId)) {
            failShape(`snippetSurfaces must include requiredSurfaceId ${requiredSurfaceId}`);
        }
    }

    assertStringArray(value.forbiddenImportMarkers, "forbiddenImportMarkers");

    if (!Array.isArray(value.supportingEvidence) || value.supportingEvidence.length === 0) {
        failShape("supportingEvidence must be a non-empty array");
    } else {
        for (const [index, evidence] of value.supportingEvidence.entries()) {
            assertMarkerObject(evidence, `supportingEvidence[${index}]`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "snippet-safety") {
            failShape(`wiring.makeTarget must be snippet-safety, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "snippet-safety") {
            failShape(`wiring.enterpriseAuditId must be snippet-safety, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-snippet-safety.mjs") {
            failShape(`wiring.checker must be scripts/check-snippet-safety.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("Snippet safety contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const policy = await readRel(contract.policy.path);
includesAll(policy, contract.policy.contains, contract.policy.path);
for (const marker of contract.policy.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) fail(contract.policy.path, `contains forbidden marker ${marker}`);
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const surface of contract.snippetSurfaces ?? []) {
    if (!(await existsRel(surface.path))) {
        fail(surface.id, `missing snippet surface ${surface.path}`);
        continue;
    }
    const text = await readRel(surface.path);
    includesAll(text, surface.contains, surface.path);
    for (const forbidden of contract.forbiddenImportMarkers) {
        if (text.includes(forbidden)) fail(surface.path, `forbidden generated/internal import marker ${forbidden}`);
    }
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

if (!makefile.includes("perfect-fast:") || !makefile.includes("snippet-safety")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing snippet-safety");
}
if (!qualityGates.includes("make snippet-safety")) {
    fail("docs/quality-gates.md", "missing make snippet-safety");
}
if (!docsIndex.includes("./snippet-safety-policy.md")) {
    fail("docs/README.md", "missing snippet safety policy link");
}
if (!docsIndex.includes("./snippet-safety-contract.json")) {
    fail("docs/README.md", "missing snippet safety contract link");
}
if (!contractInventory.includes('"id": "snippet-safety"')) {
    fail("docs/contract-inventory.json", "missing snippet-safety entry");
}
if (!enterpriseAudit.includes('"id": "snippet-safety"')) {
    fail("docs/enterprise-hardening-audit.json", "missing snippet-safety audit entry");
}

if (failures.length > 0) {
    console.error("Snippet safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Snippet safety contract passed (${contract.snippetSurfaces.length} surfaces checked).`);
