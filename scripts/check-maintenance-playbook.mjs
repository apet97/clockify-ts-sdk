#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildReport } from "./maintenance-plan.mjs";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/maintenance-playbook-contract.json", "contract")) ?? {};

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

function validatePlanner() {
    if (!assertObject("planner", contract.planner)) return;
    safeRelativePath("planner.path", contract.planner.path);
    assertStringArray("planner.markers", contract.planner.markers, { min: 1 });
    if (assertObject("planner.generatedReport", contract.planner.generatedReport)) {
        assertObject("planner.generatedReport.exactFields", contract.planner.generatedReport.exactFields);
        assertStringArray(
            "planner.generatedReport.requiredCadenceIds",
            contract.planner.generatedReport.requiredCadenceIds,
            { min: 1 },
        );
        assertStringArray(
            "planner.generatedReport.requiredCadenceFields",
            contract.planner.generatedReport.requiredCadenceFields,
            { min: 1 },
        );
        const requiredCadenceTextMarkers = contract.planner.generatedReport.requiredCadenceTextMarkers;
        if (requiredCadenceTextMarkers != null) {
            if (!isObject(requiredCadenceTextMarkers)) {
                fail("planner.generatedReport.requiredCadenceTextMarkers", "must be an object");
            } else {
                for (const [cadenceId, markers] of Object.entries(requiredCadenceTextMarkers)) {
                    assertStringArray(`planner.generatedReport.requiredCadenceTextMarkers.${cadenceId}`, markers, {
                        min: 1,
                    });
                }
            }
        }
    }
}

function validateProcedure(index, procedure) {
    const label = `procedures[${index}]`;
    if (!assertObject(label, procedure)) return;
    assertNonEmptyString(`${label}.id`, procedure.id);
    assertStringArray(`${label}.markers`, procedure.markers, { min: 1 });
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
    validatePlanner();
    assertStringArray("requiredTargets", contract.requiredTargets, { min: 1 });
    for (const [index, docPath] of assertStringArray("requiredDocs", contract.requiredDocs, { min: 1 }).entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }

    if (!Array.isArray(contract.procedures) || contract.procedures.length === 0) {
        fail("procedures", "must be a non-empty array");
    }
    for (const [index, procedure] of (contract.procedures ?? []).entries()) {
        validateProcedure(index, procedure);
    }
    assertUnique(
        "procedures.id",
        (contract.procedures ?? []).map((procedure) => procedure?.id).filter((id) => typeof id === "string"),
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

function assertExactFields(report, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = report[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(label, `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertCadenceIds(cadences, ids, label) {
    const actual = new Set((cadences ?? []).map((cadence) => cadence.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing cadence ${id}`);
    }
}

function assertCadenceFields(cadences, fields, label) {
    for (const cadence of cadences ?? []) {
        for (const field of fields ?? []) {
            if (typeof cadence[field] === "string") {
                if (cadence[field].trim().length === 0) fail(label, `${cadence.id}.${field} must be non-empty`);
                continue;
            }
            if (!Array.isArray(cadence[field]) || cadence[field].length === 0) {
                fail(label, `${cadence.id}.${field} must be a non-empty array`);
            }
        }
    }
}

function assertCadenceTextMarkers(cadences, requiredCadenceTextMarkers, label) {
    for (const [cadenceId, markers] of Object.entries(requiredCadenceTextMarkers ?? {})) {
        const cadence = (cadences ?? []).find((candidate) => candidate.id === cadenceId);
        if (!cadence) {
            fail(label, `missing cadence ${cadenceId}`);
            continue;
        }
        const text = JSON.stringify(cadence);
        for (const marker of markers ?? []) {
            if (!text.includes(marker)) fail(label, `${cadenceId} missing marker ${marker}`);
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Maintenance playbook contract shape failed:");
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

if (contract.planner) {
    if (!(await existsRel(contract.planner.path))) {
        fail("planner", `missing ${contract.planner.path}`);
    } else {
        includesAll(await readRel(contract.planner.path), contract.planner.markers, contract.planner.path);
    }
    const generatedReport = buildReport({ cadence: "all" });
    const generatedReportContract = contract.planner.generatedReport ?? {};
    assertExactFields(generatedReport, generatedReportContract.exactFields, "planner.generatedReport");
    assertCadenceIds(generatedReport.cadences, generatedReportContract.requiredCadenceIds, "planner.generatedReport");
    assertCadenceFields(
        generatedReport.cadences,
        generatedReportContract.requiredCadenceFields,
        "planner.generatedReport",
    );
    assertCadenceTextMarkers(
        generatedReport.cadences,
        generatedReportContract.requiredCadenceTextMarkers,
        "planner.generatedReport",
    );
}

for (const procedure of contract.procedures ?? []) {
    includesAll(policy, procedure.markers, `${contract.policyDocument.path} procedure ${procedure.id}`);
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
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
}
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!qualityGates.includes("make maintenance-plan")) {
    fail("docs/quality-gates.md", "missing make maintenance-plan");
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
    console.error("Maintenance playbook contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Maintenance playbook contract passed (${contract.procedures.length} procedures checked).`);
