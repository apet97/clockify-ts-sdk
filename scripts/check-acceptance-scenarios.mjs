#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./acceptance-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/acceptance-scenarios-contract.json", "contract") ?? {};

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(label, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
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

function validateMarkerEntry(label, entry, { requireId = false } = {}) {
    if (!assertObject(label, entry)) return;
    if (requireId) assertNonEmptyString(`${label}.id`, entry.id);
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validatePlanner() {
    if (!assertObject("planner", contract.planner)) return;
    safeRelativePath("planner.path", contract.planner.path);
    assertNonEmptyString("planner.makeTarget", contract.planner.makeTarget);
    assertStringArray("planner.mustContain", contract.planner.mustContain, { min: 1 });

    if (assertObject("planner.generatedPlan", contract.planner.generatedPlan)) {
        assertObject("planner.generatedPlan.exactFields", contract.planner.generatedPlan.exactFields);
        assertStringArray("planner.generatedPlan.requiredScenarioIds", contract.planner.generatedPlan.requiredScenarioIds, {
            min: 1,
        });
        assertStringArray(
            "planner.generatedPlan.requiredScenarioFields",
            contract.planner.generatedPlan.requiredScenarioFields,
            { min: 1 },
        );
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("policyDocument", contract.policyDocument);
    validatePlanner();

    if (!Array.isArray(contract.scenarios) || contract.scenarios.length === 0) {
        fail("scenarios", "must be a non-empty array");
    }
    for (const [index, scenario] of (contract.scenarios ?? []).entries()) {
        if (!assertObject(`scenarios[${index}]`, scenario)) continue;
        assertNonEmptyString(`scenarios[${index}].id`, scenario.id);
        assertStringArray(`scenarios[${index}].mustContain`, scenario.mustContain, { min: 1 });
    }
    assertUnique(
        "scenarios.id",
        (contract.scenarios ?? []).map((scenario) => scenario?.id).filter((id) => typeof id === "string"),
    );

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    for (const [index, entry] of (contract.supportingEvidence ?? []).entries()) {
        validateMarkerEntry(`supportingEvidence[${index}]`, entry);
    }
    assertUnique(
        "supportingEvidence.path",
        (contract.supportingEvidence ?? [])
            .map((entry) => entry?.path)
            .filter((entryPath) => typeof entryPath === "string"),
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
        if (!text.includes(marker)) fail(label, `missing marker ${JSON.stringify(marker)}`);
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

function assertScenarioIds(scenarios, ids, label) {
    const actual = new Set((scenarios ?? []).map((scenario) => scenario.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing scenario ${id}`);
    }
}

function assertScenarioFields(scenarios, fields, label) {
    for (const scenario of scenarios ?? []) {
        for (const field of fields ?? []) {
            if (typeof scenario[field] === "string") {
                if (scenario[field].trim().length === 0) fail(label, `${scenario.id}.${field} must be non-empty`);
                continue;
            }
            if (!Array.isArray(scenario[field]) || scenario[field].length === 0) {
                fail(label, `${scenario.id}.${field} must be a non-empty array`);
            }
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Acceptance scenarios contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policyText = readRelative(contract.policyDocument.path);
includesAll(policyText, contract.policyDocument.mustContain, contract.policyDocument.path);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policyText.includes(marker)) fail(contract.policyDocument.path, `contains forbidden marker ${marker}`);
}

if (contract.planner) {
    includesAll(readRelative(contract.planner.path), contract.planner.mustContain, contract.planner.path);
    const generatedPlan = buildPlan({ scenario: "all" });
    const generatedPlanContract = contract.planner.generatedPlan ?? {};
    assertExactFields(generatedPlan, generatedPlanContract.exactFields, "planner.generatedPlan");
    assertScenarioIds(generatedPlan.scenarios, generatedPlanContract.requiredScenarioIds, "planner.generatedPlan");
    assertScenarioFields(
        generatedPlan.scenarios,
        generatedPlanContract.requiredScenarioFields,
        "planner.generatedPlan",
    );
}

for (const scenario of contract.scenarios ?? []) {
    includesAll(policyText, scenario.mustContain, scenario.id);
}

for (const entry of contract.supportingEvidence ?? []) {
    includesAll(readRelative(entry.path), entry.mustContain, entry.path);
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
if (contract.planner?.makeTarget && !makefile.includes(`${contract.planner.makeTarget}:`)) {
    fail("Makefile", `missing ${contract.planner.makeTarget} target`);
}
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(contract.wiring.makeTarget)) fail("Makefile", `${target} missing ${contract.wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Acceptance scenarios contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Acceptance scenarios contract passed (${contract.scenarios.length} scenarios checked).`);
