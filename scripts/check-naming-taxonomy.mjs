#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/naming-taxonomy-contract.json"));
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
        "safe-naming-taxonomy-paths",
        "typed-vocabulary-groups",
        "required-target-wiring",
        "required-doc-evidence",
        "combined-vocabulary-evidence",
        "supporting-evidence-marker-contract",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    if (!isPlainObject(value.policyDocument)) {
        failShape("policyDocument must be an object");
    } else {
        assertSafeRelativePath(value.policyDocument.path, "policyDocument.path");
        if (value.policyDocument.path !== "docs/naming-taxonomy-policy.md") {
            failShape(`policyDocument.path must be docs/naming-taxonomy-policy.md, got ${value.policyDocument.path ?? "(missing)"}`);
        }
        assertStringArray(value.policyDocument.contains, "policyDocument.contains");
        assertStringArray(value.policyDocument.forbiddenMarkers, "policyDocument.forbiddenMarkers");
    }

    const requiredTargets = assertStringArray(value.requiredTargets, "requiredTargets");
    for (const target of [
        "naming-taxonomy",
        "product-surface-drift",
        "operation-parity-drift",
        "readme-tables-drift",
        "sdk-public-api",
        "cli-contract",
        "mcp-contract",
        "examples-matrix",
        "workflow-cookbook",
    ]) {
        if (!requiredTargets.includes(target)) {
            failShape(`requiredTargets must include ${target}`);
        }
    }

    for (const [index, docPath] of assertStringArray(value.requiredDocs, "requiredDocs").entries()) {
        assertSafeRelativePath(docPath, `requiredDocs[${index}]`);
    }

    for (const [index, docPath] of assertStringArray(value.combinedVocabularyDocs, "combinedVocabularyDocs").entries()) {
        assertSafeRelativePath(docPath, `combinedVocabularyDocs[${index}]`);
    }

    const requiredVocabularyIds = assertStringArray(value.requiredVocabularyIds, "requiredVocabularyIds");
    if (!Array.isArray(value.vocabulary) || value.vocabulary.length === 0) {
        failShape("vocabulary must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedVocabularyGroupCount) || value.expectedVocabularyGroupCount <= 0) {
        failShape("expectedVocabularyGroupCount must be a positive integer");
    } else if (Array.isArray(value.vocabulary) && value.expectedVocabularyGroupCount !== value.vocabulary.length) {
        failShape(`expectedVocabularyGroupCount ${value.expectedVocabularyGroupCount} does not match vocabulary.length ${value.vocabulary.length}`);
    }

    const vocabularyIds = new Set();
    for (const [index, item] of (Array.isArray(value.vocabulary) ? value.vocabulary : []).entries()) {
        const prefix = `vocabulary[${index}]`;
        if (!isPlainObject(item)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(item.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (vocabularyIds.has(item.id)) {
                failShape(`${prefix}.id duplicates ${item.id}`);
            }
            vocabularyIds.add(item.id);
        }

        assertStringArray(item.markers, `${prefix}.markers`);
    }

    for (const requiredVocabularyId of requiredVocabularyIds) {
        if (!vocabularyIds.has(requiredVocabularyId)) {
            failShape(`vocabulary must include requiredVocabularyId ${requiredVocabularyId}`);
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
        if (value.wiring.makeTarget !== "naming-taxonomy") {
            failShape(`wiring.makeTarget must be naming-taxonomy, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "naming-taxonomy") {
            failShape(`wiring.enterpriseAuditId must be naming-taxonomy, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-naming-taxonomy.mjs") {
            failShape(`wiring.checker must be scripts/check-naming-taxonomy.mjs, got ${value.wiring.checker ?? "(missing)"}`);
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
    console.error("Naming taxonomy contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
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

const combinedDocs = contract.combinedVocabularyDocs.map((relPath) => {
        try {
            return readFile(path.join(root, relPath), "utf8");
        } catch {
            return "";
        }
    });
const combinedText = (await Promise.all(combinedDocs)).join("\n");
for (const item of contract.vocabulary ?? []) {
    includesAll(combinedText, item.markers, `vocabulary ${item.id}`);
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

if (!makefile.includes("perfect-fast:") || !makefile.includes("naming-taxonomy")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing naming-taxonomy");
}
if (!qualityGates.includes("make naming-taxonomy")) {
    fail("docs/quality-gates.md", "missing make naming-taxonomy");
}
if (!docsIndex.includes("./naming-taxonomy-policy.md")) {
    fail("docs/README.md", "missing naming taxonomy policy link");
}
if (!docsIndex.includes("./naming-taxonomy-contract.json")) {
    fail("docs/README.md", "missing naming taxonomy contract link");
}
if (!contractInventory.includes('"id": "naming-taxonomy"')) {
    fail("docs/contract-inventory.json", "missing naming-taxonomy entry");
}
if (!enterpriseAudit.includes('"id": "naming-taxonomy"')) {
    fail("docs/enterprise-hardening-audit.json", "missing naming-taxonomy audit entry");
}

if (failures.length > 0) {
    console.error("Naming taxonomy contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Naming taxonomy contract passed (${contract.vocabulary.length} vocabulary groups checked).`);
