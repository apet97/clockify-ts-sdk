#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isLiveTarget, loadRetiredGates } from "./lib/gate-targets.mjs";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/security-threat-model-contract.json"));
const failures = [];
const shapeFailures = [];
// Hoisted to module top so it is in scope for both the shape-validator
// (mechanism B, runs early) and the bottom-of-file target checks (mechanism A).
const retiredGates = await loadRetiredGates();

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

    if (!isNonEmptyString(value.id)) {
        failShape(`${field}.id must be a non-empty string`);
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


    if (!isPlainObject(value.threatModelDocument)) {
        failShape("threatModelDocument must be an object");
    } else {
        assertSafeRelativePath(value.threatModelDocument.path, "threatModelDocument.path");
        if (value.threatModelDocument.path !== "docs/security-threat-model.md") {
            failShape(`threatModelDocument.path must be docs/security-threat-model.md, got ${value.threatModelDocument.path ?? "(missing)"}`);
        }
        assertStringArray(value.threatModelDocument.contains, "threatModelDocument.contains");
        assertStringArray(value.threatModelDocument.forbiddenMarkers, "threatModelDocument.forbiddenMarkers");
    }

    const requiredTargets = assertStringArray(value.requiredTargets, "requiredTargets");
    for (const target of [
        "security-threat-model",
        "secret-hygiene",
        "env-contract",
        "mcp-write-safety",
        "cli-write-safety",
        "live-safety",
        "supply-chain",
        "receipts-contract",
    ]) {
        if (!requiredTargets.includes(target) && !retiredGates[target]) {
            failShape(`requiredTargets must include ${target}`);
        }
    }

    for (const [index, docPath] of assertStringArray(value.requiredDocs, "requiredDocs").entries()) {
        assertSafeRelativePath(docPath, `requiredDocs[${index}]`);
    }

    assertStringArray(value.allowedNonMakeProofTargets, "allowedNonMakeProofTargets");

    const requiredRiskSurfaceIds = assertStringArray(value.requiredRiskSurfaceIds, "requiredRiskSurfaceIds");
    if (!Array.isArray(value.riskSurfaces) || value.riskSurfaces.length === 0) {
        failShape("riskSurfaces must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedRiskSurfaceCount) || value.expectedRiskSurfaceCount <= 0) {
        failShape("expectedRiskSurfaceCount must be a positive integer");
    } else if (Array.isArray(value.riskSurfaces) && value.expectedRiskSurfaceCount !== value.riskSurfaces.length) {
        failShape(`expectedRiskSurfaceCount ${value.expectedRiskSurfaceCount} does not match riskSurfaces.length ${value.riskSurfaces.length}`);
    }

    const riskSurfaceIds = new Set();
    for (const [index, surface] of (Array.isArray(value.riskSurfaces) ? value.riskSurfaces : []).entries()) {
        const prefix = `riskSurfaces[${index}]`;
        if (!isPlainObject(surface)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(surface.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (riskSurfaceIds.has(surface.id)) {
                failShape(`${prefix}.id duplicates ${surface.id}`);
            }
            riskSurfaceIds.add(surface.id);
        }

        if (!isNonEmptyString(surface.attackPath)) {
            failShape(`${prefix}.attackPath must be a non-empty string`);
        }
        assertStringArray(surface.mitigations, `${prefix}.mitigations`);
        assertStringArray(surface.proofTargets, `${prefix}.proofTargets`);
    }

    for (const requiredRiskSurfaceId of requiredRiskSurfaceIds) {
        if (!riskSurfaceIds.has(requiredRiskSurfaceId)) {
            failShape(`riskSurfaces must include requiredRiskSurfaceId ${requiredRiskSurfaceId}`);
        }
    }

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
        if (value.wiring.makeTarget !== "security-threat-model") {
            failShape(`wiring.makeTarget must be security-threat-model, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "security-threat-model") {
            failShape(`wiring.enterpriseAuditId must be security-threat-model, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-security-threat-model.mjs") {
            failShape(`wiring.checker must be scripts/check-security-threat-model.mjs, got ${value.wiring.checker ?? "(missing)"}`);
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
    console.error("Security threat model contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const threatDoc = await readRel(contract.threatModelDocument.path);
includesAll(threatDoc, contract.threatModelDocument.contains, contract.threatModelDocument.path);
for (const marker of contract.threatModelDocument.forbiddenMarkers ?? []) {
    if (threatDoc.includes(marker)) fail(contract.threatModelDocument.path, `contains forbidden marker ${marker}`);
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path))) {
        fail(evidence.id, `missing evidence path ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path), evidence.contains, evidence.path);
}

for (const surface of contract.riskSurfaces ?? []) {
    for (const target of surface.proofTargets ?? []) {
        if (!isLiveTarget(makefile, target, retiredGates) && !contract.allowedNonMakeProofTargets.includes(target)) {
            fail(surface.id, `proof target is not a Makefile target: ${target}`);
        }
    }
}

for (const target of contract.requiredTargets ?? []) {
    if (!isLiveTarget(makefile, target, retiredGates)) fail("Makefile", `missing required target ${target}`);
}

for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.split(/\s+/).includes("security-threat-model")) {
        fail("Makefile", `${aggregateTarget} wiring missing security-threat-model`);
    }
}
if (!qualityGates.includes("make security-threat-model")) {
    fail("docs/quality-gates.md", "missing make security-threat-model");
}
if (!docsIndex.includes("./security-threat-model.md")) {
    fail("docs/README.md", "missing security threat model link");
}
if (!docsIndex.includes("./security-threat-model-contract.json")) {
    fail("docs/README.md", "missing security threat model contract link");
}
if (!contractInventory.includes("\"id\": \"security-threat-model\"")) {
    fail("docs/contract-inventory.json", "missing security-threat-model entry");
}
if (!enterpriseAudit.includes("\"id\": \"security-threat-model\"")) {
    fail("docs/enterprise-hardening-audit.json", "missing security-threat-model requirement");
}

if (failures.length > 0) {
    console.error("Security threat model contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Security threat model contract passed (${contract.riskSurfaces.length} risks checked).`);
