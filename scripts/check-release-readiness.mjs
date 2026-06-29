#!/usr/bin/env node
// check-release-readiness: validates release readiness contract shape and the
// release-decision plan output.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildReport as buildReleaseDecisionPlan } from "./release-decision-plan.mjs";

const root = process.cwd();
let failures = [];
const contract = JSON.parse(await readRel("docs/release-readiness-contract.json", "contractPath"));

async function readRel(relPath, label = relPath) {
    const safePath = releaseRelativePath(label, relPath);
    if (safePath == null) return "";
    return readFile(path.join(root, safePath), "utf8");
}

async function existsRel(relPath, label = relPath) {
    const safePath = releaseRelativePath(label, relPath);
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

function releaseRelativePath(label, relPath) {
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

function assertUnique(items, label) {
    const seen = new Set();
    for (const item of items ?? []) {
        if (seen.has(item)) fail(label, `duplicate ${item}`);
        seen.add(item);
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
            fail(
                label,
                `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
            );
        }
    }
}

function assertIds(items, ids, label) {
    const actual = new Set((items ?? []).map((item) => item.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing id ${id}`);
    }
}

function assertTextMarkers(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing generated marker ${marker}`);
    }
}

function assertArrayContains(actualItems, expectedItems, label) {
    const actual = new Set(actualItems ?? []);
    for (const expected of expectedItems ?? []) {
        if (!actual.has(expected)) fail(label, `missing ${expected}`);
    }
}

function assertDecisionFlags(decisions, requiredFlags, label) {
    for (const [id, expectedFlags] of Object.entries(requiredFlags ?? {})) {
        const decision = (decisions ?? []).find((candidate) => candidate.id === id);
        if (!decision) {
            fail(label, `missing decision ${id}`);
            continue;
        }
        for (const [field, expected] of Object.entries(expectedFlags)) {
            if (decision[field] !== expected) {
                fail(
                    label,
                    `${id}.${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(decision[field])}`,
                );
            }
        }
    }
}

function validateGeneratedReportContract(label, generatedReport) {
    if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
        fail(label, "must be an object");
        return;
    }
    if (
        generatedReport.exactFields == null ||
        typeof generatedReport.exactFields !== "object" ||
        Array.isArray(generatedReport.exactFields)
    ) {
        fail(`${label}.exactFields`, "must be an object");
    }
    for (const field of [
        "requiredPreflightIds",
        "requiredProofIds",
        "requiredFinalProofCommandOrder",
        "requiredSignalIds",
        "requiredBlockingFields",
        "requiredDecisionIds",
        "requiredReadinessContextFields",
        "warningMustContain",
    ]) {
        if (generatedReport[field] != null) {
            const values = assertStringArray(`${label}.${field}`, generatedReport[field]);
            assertUnique(values, `${label}.${field}`);
        }
    }
    if (generatedReport.requiredDecisionFlags != null) {
        if (
            typeof generatedReport.requiredDecisionFlags !== "object" ||
            Array.isArray(generatedReport.requiredDecisionFlags)
        ) {
            fail(`${label}.requiredDecisionFlags`, "must be an object");
        }
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);
    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "release-readiness") {
            fail("wiring.makeTarget", `must be release-readiness, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "release-readiness") {
            fail("wiring.enterpriseAuditId", `must be release-readiness, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = releaseRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-release-readiness.mjs") {
            fail("wiring.checker", `must be scripts/check-release-readiness.mjs, got ${contract.wiring.checker ?? "(missing)"}`);
        }
    }
    releaseRelativePath("checklist.path", contract.checklist?.path);
    assertStringArray("checklist.contains", contract.checklist?.contains, { allowEmpty: false });
    assertStringArray("checklist.forbiddenMarkers", contract.checklist?.forbiddenMarkers ?? []);
    assertStringArray("requiredTargets", contract.requiredTargets, { allowEmpty: false });
    assertStringArray("requiredDocs", contract.requiredDocs, { allowEmpty: false });
    assertStringArray("evidenceAreas", contract.evidenceAreas, { allowEmpty: false });
    for (const [index, docPath] of (contract.requiredDocs ?? []).entries()) {
        releaseRelativePath(`requiredDocs[${index}]`, docPath);
    }
    for (const field of ["checklist.contains", "checklist.forbiddenMarkers", "requiredTargets", "requiredDocs", "evidenceAreas"]) {
        const values = field.split(".").reduce((value, key) => value?.[key], contract);
        assertUnique(values ?? [], field);
    }

    if (contract.decisionPlanner == null || typeof contract.decisionPlanner !== "object") {
        fail("decisionPlanner", "must be an object");
    } else {
        releaseRelativePath("decisionPlanner.path", contract.decisionPlanner.path);
        const markers = assertStringArray("decisionPlanner.contains", contract.decisionPlanner.contains, {
            allowEmpty: false,
        });
        assertUnique(markers, "decisionPlanner.contains");
        validateGeneratedReportContract("decisionPlanner.generatedReport", contract.decisionPlanner.generatedReport);
    }

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    assertUnique(
        (contract.supportingEvidence ?? []).map((evidence) => evidence?.path).filter((evidencePath) => typeof evidencePath === "string"),
        "supportingEvidence.path",
    );
    for (const [index, evidence] of (contract.supportingEvidence ?? []).entries()) {
        const label = `supportingEvidence[${index}]`;
        if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
            fail(label, "must be an object");
            continue;
        }
        releaseRelativePath(`${label}.path`, evidence.path);
        const markers = assertStringArray(`${label}.contains`, evidence.contains, { allowEmpty: false });
        assertUnique(markers, `${label}.contains`);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Release readiness contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = await readRel("Makefile", "Makefile");
const docsIndex = await readRel("docs/README.md", "docsIndex");
const qualityGates = await readRel("docs/quality-gates.md", "qualityGates");
const contractInventory = await readRel("docs/contract-inventory.json", "contractInventory");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json", "enterpriseAudit");

const checklist = await readRel(contract.checklist.path, "checklist.path");
includesAll(checklist, contract.checklist.contains, contract.checklist.path);
for (const marker of contract.checklist.forbiddenMarkers ?? []) {
    if (checklist.includes(marker)) fail(contract.checklist.path, `contains forbidden marker ${marker}`);
}
includesAll(checklist, contract.evidenceAreas, `${contract.checklist.path} evidence areas`);

if (contract.decisionPlanner) {
    if (!(await existsRel(contract.decisionPlanner.path, "decisionPlanner.path"))) {
        fail("decisionPlanner", `missing ${contract.decisionPlanner.path}`);
    } else {
        includesAll(
            await readRel(contract.decisionPlanner.path, "decisionPlanner.path"),
            contract.decisionPlanner.contains,
            contract.decisionPlanner.path,
        );
    }
}

if (contract.decisionPlanner) {
    const generatedPlan = buildReleaseDecisionPlan({ decision: "all" });
    const generatedPlanContract = contract.decisionPlanner.generatedReport ?? {};
    assertExactFields(generatedPlan, generatedPlanContract.exactFields, "decisionPlanner.generatedReport");
    assertIds(
        generatedPlan.decisions,
        generatedPlanContract.requiredDecisionIds,
        "decisionPlanner.generatedReport.decisions",
    );
    assertDecisionFlags(
        generatedPlan.decisions,
        generatedPlanContract.requiredDecisionFlags,
        "decisionPlanner.generatedReport.decisions",
    );
    assertTextMarkers(
        generatedPlan.warning ?? "",
        generatedPlanContract.warningMustContain,
        "decisionPlanner.generatedReport.warning",
    );
    assertArrayContains(
        generatedPlan.readinessContextChecklist?.requiredFields ?? [],
        generatedPlanContract.requiredReadinessContextFields ?? [],
        "decisionPlanner.generatedReport.readinessContextChecklist.requiredFields",
    );
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
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}

for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} wiring missing ${contract.wiring.makeTarget}`);
    }
}
if (!qualityGates.includes("make release-readiness")) {
    fail("docs/quality-gates.md", "missing make release-readiness");
}
if (!docsIndex.includes("./release-readiness-checklist.md")) {
    fail("docs/README.md", "missing release readiness checklist link");
}
if (!docsIndex.includes("./release-readiness-contract.json")) {
    fail("docs/README.md", "missing release readiness contract link");
}
if (!contractInventory.includes('"id": "release-readiness"')) {
    fail("docs/contract-inventory.json", "missing release-readiness entry");
}
if (!enterpriseAudit.includes('"id": "release-readiness"')) {
    fail("docs/enterprise-hardening-audit.json", "missing release-readiness audit entry");
}

if (failures.length > 0) {
    console.error("Release readiness contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Release readiness contract passed (${contract.evidenceAreas.length} evidence areas checked).`);
