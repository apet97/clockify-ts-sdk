#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/test-matrix-contract.json", "contract") ?? {};

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

function assertStringMap(label, value) {
    if (!assertObject(label, value)) return;
    for (const [key, mapValue] of Object.entries(value)) {
        if (key.trim() === "") fail(label, "must not contain empty keys");
        assertNonEmptyString(`${label}.${key}`, mapValue);
    }
}

function validatePackageShape(index, pkg) {
    const label = `packages[${index}]`;
    if (!assertObject(label, pkg)) return;

    assertNonEmptyString(`${label}.id`, pkg.id);
    safeRelativePath(`${label}.manifest`, pkg.manifest);
    assertStringArray(`${label}.requiredScripts`, pkg.requiredScripts, { min: 1 });
    assertStringMap(`${label}.requiredScriptValues`, pkg.requiredScriptValues ?? {});

    for (const [testIndex, testPath] of assertStringArray(`${label}.requiredTests`, pkg.requiredTests, {
        min: 1,
    }).entries()) {
        safeRelativePath(`${label}.requiredTests[${testIndex}]`, testPath);
    }
    assertStringArray(`${label}.forbiddenSkipPatterns`, pkg.forbiddenSkipPatterns, { required: false });
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    if (!Array.isArray(contract.packages) || contract.packages.length === 0) {
        fail("packages", "must be a non-empty array");
    }
    for (const [index, pkg] of (contract.packages ?? []).entries()) validatePackageShape(index, pkg);
    assertUnique(
        "packages.id",
        (contract.packages ?? []).map((pkg) => pkg?.id).filter((id) => typeof id === "string"),
    );
    assertUnique(
        "packages.manifest",
        (contract.packages ?? []).map((pkg) => pkg?.manifest).filter((manifest) => typeof manifest === "string"),
    );

    assertStringArray("rootGateTargets", contract.rootGateTargets, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("test matrix contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = readRelative("Makefile");

for (const target of contract.rootGateTargets ?? []) {
    if (!makefile.includes(`${target}:`)) {
        fail("root", `Makefile missing ${target} target`);
    }
}

for (const pkg of contract.packages ?? []) {
    const manifest = readJson(pkg.manifest, pkg.id);
    if (manifest == null) continue;

    for (const script of pkg.requiredScripts ?? []) {
        if (typeof manifest.scripts?.[script] !== "string") {
            fail(pkg.id, `${pkg.manifest} missing script ${script}`);
        }
    }

    for (const [script, expectedCommand] of Object.entries(pkg.requiredScriptValues ?? {})) {
        if (manifest.scripts?.[script] !== expectedCommand) {
            fail(
                pkg.id,
                `${pkg.manifest} script ${script} must be ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(manifest.scripts?.[script])}`,
            );
        }
    }

    for (const testPath of pkg.requiredTests ?? []) {
        const test = readRelative(testPath, pkg.id);
        if (!test.includes("describe(") && !test.includes("it(")) {
            fail(pkg.id, `${testPath} does not look like a Vitest test file`);
        }

        for (const pattern of pkg.forbiddenSkipPatterns ?? []) {
            if (test.includes(pattern)) fail(pkg.id, `${testPath} contains forbidden skip pattern ${pattern}`);
        }
    }
}

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("test matrix contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const testCount = contract.packages.reduce((sum, pkg) => sum + (pkg.requiredTests?.length ?? 0), 0);
console.log(`test matrix contract passed (${contract.packages.length} packages, ${testCount} required test files)`);
