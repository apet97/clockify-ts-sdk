#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildPlan } from "./examples-plan.mjs";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/examples-matrix-contract.json"));
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


    if (!isPlainObject(value.matrixDocument)) {
        failShape("matrixDocument must be an object");
    } else {
        assertSafeRelativePath(value.matrixDocument.path, "matrixDocument.path");
        if (value.matrixDocument.path !== "docs/examples-matrix.md") {
            failShape(`matrixDocument.path must be docs/examples-matrix.md, got ${value.matrixDocument.path ?? "(missing)"}`);
        }
        assertStringArray(value.matrixDocument.contains, "matrixDocument.contains");
        assertStringArray(value.matrixDocument.forbiddenMarkers, "matrixDocument.forbiddenMarkers");
    }

    const requiredTargets = assertStringArray(value.requiredTargets, "requiredTargets");
    for (const target of [
        "examples-plan",
        "examples-matrix",
        "examples-contract",
        "snippet-safety",
        "workflow-cookbook",
        "mutation-safety",
        "user-docs",
    ]) {
        if (!requiredTargets.includes(target)) {
            failShape(`requiredTargets must include ${target}`);
        }
    }

    const requiredDocs = assertStringArray(value.requiredDocs, "requiredDocs");
    for (const [index, docPath] of requiredDocs.entries()) {
        assertSafeRelativePath(docPath, `requiredDocs[${index}]`);
    }

    const requiredRowIds = assertStringArray(value.requiredRowIds, "requiredRowIds");
    if (!Array.isArray(value.rows) || value.rows.length === 0) {
        failShape("rows must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedRowCount) || value.expectedRowCount <= 0) {
        failShape("expectedRowCount must be a positive integer");
    } else if (Array.isArray(value.rows) && value.expectedRowCount !== value.rows.length) {
        failShape(`expectedRowCount ${value.expectedRowCount} does not match rows.length ${value.rows.length}`);
    }

    const rowIds = new Set();
    for (const [index, row] of (Array.isArray(value.rows) ? value.rows : []).entries()) {
        const prefix = `rows[${index}]`;
        if (!isPlainObject(row)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(row.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (rowIds.has(row.id)) {
                failShape(`${prefix}.id duplicates ${row.id}`);
            }
            rowIds.add(row.id);
        }

        assertStringArray(row.markers, `${prefix}.markers`);
    }

    for (const requiredRowId of requiredRowIds) {
        if (!rowIds.has(requiredRowId)) {
            failShape(`rows must include requiredRowId ${requiredRowId}`);
        }
    }

    if (!isPlainObject(value.planner)) {
        failShape("planner must be an object");
    } else {
        assertSafeRelativePath(value.planner.path, "planner.path");
        if (value.planner.path !== "scripts/examples-plan.mjs") {
            failShape(`planner.path must be scripts/examples-plan.mjs, got ${value.planner.path ?? "(missing)"}`);
        }
        if (value.planner.makeTarget !== "examples-plan") {
            failShape(`planner.makeTarget must be examples-plan, got ${value.planner.makeTarget ?? "(missing)"}`);
        }
        assertStringArray(value.planner.contains, "planner.contains");

        const generatedPlan = value.planner.generatedPlan;
        if (!isPlainObject(generatedPlan)) {
            failShape("planner.generatedPlan must be an object");
        } else {
            const exactFields = generatedPlan.exactFields;
            if (!isPlainObject(exactFields)) {
                failShape("planner.generatedPlan.exactFields must be an object");
            } else {
                const expectedExactFields = {
                    schemaVersion: 1,
                    network: "none",
                    commandsExecuted: [],
                    envValuesCaptured: false,
                    example: "all",
                };
                for (const [field, expected] of Object.entries(expectedExactFields)) {
                    if (JSON.stringify(exactFields[field]) !== JSON.stringify(expected)) {
                        failShape(`planner.generatedPlan.exactFields.${field} must be ${JSON.stringify(expected)}`);
                    }
                }
            }

            const requiredExampleIds = assertStringArray(generatedPlan.requiredExampleIds, "planner.generatedPlan.requiredExampleIds");
            for (const exampleId of [
                "auth-status",
                "pagination",
                "time-entry",
                "work-package",
                "business-admin",
                "retry-idempotency",
                "observability",
                "webhooks",
                "demo-cleanup",
            ]) {
                if (!requiredExampleIds.includes(exampleId)) {
                    failShape(`planner.generatedPlan.requiredExampleIds must include ${exampleId}`);
                }
            }

            const requiredFields = assertStringArray(generatedPlan.requiredExampleFields, "planner.generatedPlan.requiredExampleFields");
            for (const field of ["job", "sdk", "cli", "mcp", "safety", "proof"]) {
                if (!requiredFields.includes(field)) {
                    failShape(`planner.generatedPlan.requiredExampleFields must include ${field}`);
                }
            }
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
        if (value.wiring.makeTarget !== "examples-matrix") {
            failShape(`wiring.makeTarget must be examples-matrix, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "examples-matrix") {
            failShape(`wiring.enterpriseAuditId must be examples-matrix, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-examples-matrix.mjs") {
            failShape(`wiring.checker must be scripts/check-examples-matrix.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

function assertExactFields(plan, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = plan[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(label, `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertExampleIds(examples, ids, label) {
    const actual = new Set((examples ?? []).map((example) => example.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing example ${id}`);
    }
}

function assertExampleFields(examples, fields, label) {
    for (const example of examples ?? []) {
        for (const field of fields ?? []) {
            if (typeof example[field] === "string") {
                if (example[field].trim().length === 0) fail(label, `${example.id}.${field} must be non-empty`);
                continue;
            }
            if (!Array.isArray(example[field]) || example[field].length === 0) {
                fail(label, `${example.id}.${field} must be a non-empty array`);
            }
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("Examples matrix contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const matrix = await readRel(contract.matrixDocument.path);
includesAll(matrix, contract.matrixDocument.contains, contract.matrixDocument.path);
for (const marker of contract.matrixDocument.forbiddenMarkers ?? []) {
    if (matrix.includes(marker)) fail(contract.matrixDocument.path, `contains forbidden marker ${marker}`);
}

for (const row of contract.rows ?? []) {
    includesAll(matrix, row.markers, `${contract.matrixDocument.path} row ${row.id}`);
}

if (contract.planner) {
    if (!(await existsRel(contract.planner.path))) {
        fail("planner", `missing ${contract.planner.path}`);
    } else {
        includesAll(await readRel(contract.planner.path), contract.planner.contains, contract.planner.path);
    }
    const generatedPlan = buildPlan({ example: "all" });
    const generatedPlanContract = contract.planner.generatedPlan ?? {};
    assertExactFields(generatedPlan, generatedPlanContract.exactFields, "planner.generatedPlan");
    assertExampleIds(generatedPlan.examples, generatedPlanContract.requiredExampleIds, "planner.generatedPlan");
    assertExampleFields(generatedPlan.examples, generatedPlanContract.requiredExampleFields, "planner.generatedPlan");
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

if (!makefile.includes("perfect-fast:") || !makefile.includes("examples-matrix")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing examples-matrix");
}
if (!qualityGates.includes("make examples-matrix")) {
    fail("docs/quality-gates.md", "missing make examples-matrix");
}
if (!docsIndex.includes("./examples-matrix.md")) {
    fail("docs/README.md", "missing examples matrix link");
}
if (!docsIndex.includes("./examples-matrix-contract.json")) {
    fail("docs/README.md", "missing examples matrix contract link");
}
if (!contractInventory.includes('"id": "examples-matrix"')) {
    fail("docs/contract-inventory.json", "missing examples-matrix entry");
}
if (!enterpriseAudit.includes('"id": "examples-matrix"')) {
    fail("docs/enterprise-hardening-audit.json", "missing examples-matrix audit entry");
}

if (failures.length > 0) {
    console.error("Examples matrix contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Examples matrix contract passed (${contract.rows.length} rows checked).`);
