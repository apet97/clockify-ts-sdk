#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./onboarding-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/operator-onboarding-contract.json", "contract") ?? {};

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

function validateEntryShape(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validatePlanGenerator() {
    if (!assertObject("planGenerator", contract.planGenerator)) return;
    safeRelativePath("planGenerator.path", contract.planGenerator.path);
    assertNonEmptyString("planGenerator.makeTarget", contract.planGenerator.makeTarget);
    assertStringArray("planGenerator.mustContain", contract.planGenerator.mustContain, { min: 1 });
    if (assertObject("planGenerator.generatedPlan", contract.planGenerator.generatedPlan)) {
        assertObject("planGenerator.generatedPlan.exactFields", contract.planGenerator.generatedPlan.exactFields);
        assertStringArray("planGenerator.generatedPlan.requiredGoalIds", contract.planGenerator.generatedPlan.requiredGoalIds, {
            min: 1,
        });
        assertStringArray(
            "planGenerator.generatedPlan.requiredGoalArrayFields",
            contract.planGenerator.generatedPlan.requiredGoalArrayFields,
            { min: 1 },
        );
        const requiredGoalTextMarkers = contract.planGenerator.generatedPlan.requiredGoalTextMarkers;
        if (requiredGoalTextMarkers != null) {
            if (!isObject(requiredGoalTextMarkers)) {
                fail("planGenerator.generatedPlan.requiredGoalTextMarkers", "must be an object");
            } else {
                for (const [goalId, markers] of Object.entries(requiredGoalTextMarkers)) {
                    assertStringArray(`planGenerator.generatedPlan.requiredGoalTextMarkers.${goalId}`, markers, {
                        min: 1,
                    });
                }
            }
        }
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntryShape("policyDocument", contract.policyDocument);
    if (!Array.isArray(contract.supportingDocs) || contract.supportingDocs.length === 0) {
        fail("supportingDocs", "must be a non-empty array");
    }
    for (const [index, entry] of (contract.supportingDocs ?? []).entries()) {
        validateEntryShape(`supportingDocs[${index}]`, entry);
    }
    assertUnique(
        "supportingDocs.path",
        (contract.supportingDocs ?? []).map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
    validatePlanGenerator();
    assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function checkEntry(entry) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
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

function assertGoalIds(goals, ids, label) {
    const actual = new Set((goals ?? []).map((goal) => goal.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing goal ${id}`);
    }
}

function assertGoalFields(goals, fields, label) {
    for (const goal of goals ?? []) {
        for (const field of fields ?? []) {
            if (!Array.isArray(goal[field]) || goal[field].length === 0) {
                fail(label, `${goal.id}.${field} must be a non-empty array`);
            }
        }
    }
}

function assertGoalTextMarkers(goals, requiredGoalTextMarkers, label) {
    for (const [goalId, markers] of Object.entries(requiredGoalTextMarkers ?? {})) {
        const goal = (goals ?? []).find((candidate) => candidate.id === goalId);
        if (!goal) {
            fail(label, `missing goal ${goalId}`);
            continue;
        }
        const text = JSON.stringify(goal);
        for (const marker of markers ?? []) {
            if (!text.includes(marker)) fail(label, `${goalId} missing marker ${marker}`);
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Operator onboarding contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const entry of contract.supportingDocs ?? []) checkEntry(entry);
if (contract.planGenerator) checkEntry(contract.planGenerator);

const generatedPlan = buildPlan("all");
const generatedPlanContract = contract.planGenerator?.generatedPlan ?? {};
assertExactFields(generatedPlan, generatedPlanContract.exactFields, "planGenerator.generatedPlan");
assertGoalIds(generatedPlan.goals, generatedPlanContract.requiredGoalIds, "planGenerator.generatedPlan.goals");
assertGoalFields(generatedPlan.goals, generatedPlanContract.requiredGoalArrayFields, "planGenerator.generatedPlan.goals");
assertGoalTextMarkers(
    generatedPlan.goals,
    generatedPlanContract.requiredGoalTextMarkers,
    "planGenerator.generatedPlan.goals",
);

const makefile = readRelative("Makefile");
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
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
    console.error("Operator onboarding contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Operator onboarding contract passed");
