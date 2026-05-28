#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/sdk-runtime-contract.json", "contract")) ?? {};

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim() === "") {
        failures.push(`${label}: must be a non-empty repo-relative path`);
        return "";
    }

    const normalized = path.normalize(relPath).replace(/\\/g, "/");
    const segments = relPath.split(/[\\/]+/);
    if (path.isAbsolute(relPath) || segments.includes("..") || normalized.startsWith("../")) {
        failures.push(`${label}: must not escape the repository root: ${relPath}`);
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
        failures.push(`${label}: missing`);
        return "";
    }
}

async function readJsonRel(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        failures.push(`${label}: invalid JSON: ${error.message}`);
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

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function fail(label, message) {
    failures.push(`${label}: ${message}`);
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

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.${markerField}`, entry[markerField], { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateRuntimeSeam(index, seam) {
    const label = `runtimeSeams[${index}]`;
    if (!assertObject(label, seam)) return;
    assertNonEmptyString(`${label}.id`, seam.id);
    safeRelativePath(`${label}.path`, seam.path);
    assertStringArray(`${label}.contains`, seam.contains, { min: 1 });
    for (const [testIndex, testPath] of assertStringArray(`${label}.tests`, seam.tests, { min: 1 }).entries()) {
        safeRelativePath(`${label}.tests[${testIndex}]`, testPath);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("policyDocument", contract.policyDocument);

    if (!Array.isArray(contract.runtimeSeams) || contract.runtimeSeams.length === 0) {
        fail("runtimeSeams", "must be a non-empty array");
    }
    for (const [index, seam] of (contract.runtimeSeams ?? []).entries()) validateRuntimeSeam(index, seam);
    assertUnique(
        "runtimeSeams.id",
        (contract.runtimeSeams ?? []).map((seam) => seam?.id).filter((id) => typeof id === "string"),
    );
    assertUnique(
        "runtimeSeams.path",
        (contract.runtimeSeams ?? []).map((seam) => seam?.path).filter((seamPath) => typeof seamPath === "string"),
    );

    validateMarkerEntry("packageSurface", contract.packageSurface);

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("SDK runtime contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policy = await readRel(contract.policyDocument.path);
includesAll(policy, contract.policyDocument.contains, contract.policyDocument.path);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) failures.push(`${contract.policyDocument.path} contains forbidden marker: ${marker}`);
}

for (const seam of contract.runtimeSeams ?? []) {
    const text = await readRel(seam.path);
    includesAll(text, seam.contains, seam.id);
    for (const testPath of seam.tests ?? []) {
        if (!(await existsRel(testPath))) {
            failures.push(`${seam.id} missing test file: ${testPath}`);
        }
    }
}

const packageSurface = await readRel(contract.packageSurface.path);
includesAll(packageSurface, contract.packageSurface.contains, contract.packageSurface.path);

const makefile = await readRel("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail("Makefile", `${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = await readRel("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!(await readRel("docs/quality-gates.md")).includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!(await readRel("docs/contract-inventory.json")).includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!(await readRel("docs/enterprise-hardening-audit.json")).includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("SDK runtime contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`SDK runtime contract passed (${contract.runtimeSeams.length} seams checked).`);
