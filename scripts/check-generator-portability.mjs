#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/generator-portability-contract.json", "contract")) ?? {};

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

function validatePlan() {
    if (!assertObject("plan", contract.plan)) return;
    safeRelativePath("plan.path", contract.plan.path);
    assertStringArray("plan.contains", contract.plan.contains, { min: 1 });
    assertStringArray("plan.forbiddenMarkers", contract.plan.forbiddenMarkers, { required: false });
}

function validateBoundary(index, boundary) {
    const label = `boundaries[${index}]`;
    if (!assertObject(label, boundary)) return;
    assertNonEmptyString(`${label}.id`, boundary.id);
    assertStringArray(`${label}.requiredMarkers`, boundary.requiredMarkers, { min: 1 });
}

function validateSupportingEvidence(index, evidence) {
    const label = `supportingEvidence[${index}]`;
    if (!assertObject(label, evidence)) return;
    safeRelativePath(`${label}.path`, evidence.path);
    assertStringArray(`${label}.contains`, evidence.contains, { min: 1 });
}

function validateLocalReproducibility() {
    if (!assertObject("localReproducibility", contract.localReproducibility)) return;
    assertStringArray("localReproducibility.planMarkers", contract.localReproducibility.planMarkers, {
        min: 1,
    });
    for (const [index, manifestPath] of assertStringArray(
        "localReproducibility.packageManifestPaths",
        contract.localReproducibility.packageManifestPaths,
        { min: 1 },
    ).entries()) {
        safeRelativePath(`localReproducibility.packageManifestPaths[${index}]`, manifestPath);
    }
    assertStringArray(
        "localReproducibility.forbiddenDependencyNames",
        contract.localReproducibility.forbiddenDependencyNames,
        { min: 1 },
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, { min: 1 });
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-generator-portability-evidence-paths",
        "typed-plan-contract",
        "typed-required-targets",
        "typed-required-docs",
        "typed-boundaries",
        "typed-supporting-evidence",
        "typed-local-reproducibility-contract",
        "typed-wiring-contract",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    validatePlan();
    assertStringArray("requiredTargets", contract.requiredTargets, { min: 1 });
    for (const [index, docPath] of assertStringArray("requiredDocs", contract.requiredDocs, { min: 1 }).entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }

    if (!Array.isArray(contract.boundaries) || contract.boundaries.length === 0) {
        fail("boundaries", "must be a non-empty array");
    }
    for (const [index, boundary] of (contract.boundaries ?? []).entries()) validateBoundary(index, boundary);
    assertUnique(
        "boundaries.id",
        (contract.boundaries ?? []).map((boundary) => boundary?.id).filter((id) => typeof id === "string"),
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

    validateLocalReproducibility();

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

validateContractShape();

if (failures.length > 0) {
    console.error("Generator portability contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const plan = await readRel(contract.plan.path);
includesAll(plan, contract.plan.contains, contract.plan.path);
for (const marker of contract.plan.forbiddenMarkers ?? []) {
    if (plan.includes(marker)) fail(contract.plan.path, `contains forbidden marker ${marker}`);
}

for (const boundary of contract.boundaries ?? []) {
    includesAll(plan, boundary.requiredMarkers, `${contract.plan.path} boundary ${boundary.id}`);
}
includesAll(plan, contract.localReproducibility?.planMarkers, `${contract.plan.path} local reproducibility`);

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const manifestPath of contract.localReproducibility?.packageManifestPaths ?? []) {
    const manifest = (await readJsonRel(manifestPath, manifestPath)) ?? {};
    const dependencyBuckets = {
        dependencies: manifest.dependencies ?? {},
        devDependencies: manifest.devDependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        optionalDependencies: manifest.optionalDependencies ?? {},
    };
    for (const [bucketName, bucket] of Object.entries(dependencyBuckets)) {
        for (const forbiddenDependencyName of contract.localReproducibility.forbiddenDependencyNames ?? []) {
            if (Object.hasOwn(bucket, forbiddenDependencyName)) {
                fail(manifestPath, `${bucketName} must not depend on paid/hosted generator ${forbiddenDependencyName}`);
            }
        }
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

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
    fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
}
if (!makefile.includes(`node ${contract.wiring.checker}`)) {
    fail("Makefile", `missing ${contract.wiring.checker} invocation`);
}
if (!makefile.includes("perfect-fast:") || !makefile.includes("generator-portability")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing generator-portability");
}
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
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
    console.error("Generator portability contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Generator portability contract passed (${contract.boundaries.length} boundaries checked).`);
