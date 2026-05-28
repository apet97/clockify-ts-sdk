#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/examples-contract.json", "contract") ?? {};

function fail(message) {
    failures.push(message);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(`${label}: must be a non-empty repo-relative path`);
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(`${label}: must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${label}: missing`);
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
        fail(`${label}: invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(`${label}: must be an object`);
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${label}: must be a non-empty string`);
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(`${label}: must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { required = true, min = 0 } = {}) {
    if (values == null && !required) return [];
    if (!Array.isArray(values)) {
        fail(`${label}: must be an array`);
        return [];
    }
    if (values.length < min) fail(`${label}: must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]: must be a non-empty string`);
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateSupportingContract(index, entry) {
    const label = `supportingContracts[${index}]`;
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    assertNonEmptyString("packageName", contract.packageName);
    safeRelativePath("directory", contract.directory);
    safeRelativePath("readme", contract.readme);
    assertStringArray("examples", contract.examples, { min: 1 });
    for (const example of contract.examples ?? []) {
        if (!example.endsWith(".ts")) fail(`examples: ${example} must be a TypeScript file`);
    }
    assertStringArray("forbiddenPackageMarkers", contract.forbiddenPackageMarkers, { min: 1 });
    assertStringArray("forbiddenImportPrefixes", contract.forbiddenImportPrefixes, { min: 1 });
    for (const [index, secretPattern] of assertStringArray("forbiddenSecretPatterns", contract.forbiddenSecretPatterns, {
        min: 1,
    }).entries()) {
        try {
            new RegExp(secretPattern);
        } catch (error) {
            fail(`forbiddenSecretPatterns[${index}]: invalid regex: ${error.message}`);
        }
    }

    if (!Array.isArray(contract.supportingContracts) || contract.supportingContracts.length === 0) {
        fail("supportingContracts: must be a non-empty array");
    }
    for (const [index, entry] of (contract.supportingContracts ?? []).entries()) {
        validateSupportingContract(index, entry);
    }
    assertUnique(
        "supportingContracts.path",
        (contract.supportingContracts ?? [])
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

function sorted(value) {
    return [...value].sort((a, b) => a.localeCompare(b));
}

function sameArray(left, right) {
    return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

validateContractShape();

if (failures.length > 0) {
    console.error("examples contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const examplesDirPath = safeRelativePath("directory", contract.directory);
const readmeSafePath = safeRelativePath("readme", contract.readme);
const examplesDir = path.join(root, examplesDirPath);
const readmePath = path.join(root, readmeSafePath);

if (!fs.existsSync(examplesDir)) fail(`${contract.directory} is missing`);
if (!fs.existsSync(readmePath)) fail(`${contract.readme} is missing`);

if (failures.length === 0) {
    const actualExamples = fs
        .readdirSync(examplesDir)
        .filter((name) => name.endsWith(".ts"));
    const expectedExamples = contract.examples ?? [];

    if (!sameArray(actualExamples, expectedExamples)) {
        fail(
            `example set drift: expected ${sorted(expectedExamples).join(", ")}, got ${sorted(actualExamples).join(", ")}`,
        );
    }

    const readme = fs.readFileSync(readmePath, "utf8");
    if (!readme.includes(contract.packageName)) {
        fail(`${contract.readme} does not mention ${contract.packageName}`);
    }

    for (const example of expectedExamples) {
        const examplePath = path.join(examplesDir, example);
        if (!fs.existsSync(examplePath)) {
            fail(`${contract.directory}/${example} is missing`);
            continue;
        }

        const text = fs.readFileSync(examplePath, "utf8");
        if (!readme.includes(`./${example}`)) {
            fail(`${contract.readme} does not catalogue ${example}`);
        }

        if (!new RegExp(`from\\s+["']${escapeRegExp(contract.packageName)}(?:/[^"']*)?["']`).test(text)) {
            fail(`${contract.directory}/${example} does not import from ${contract.packageName}`);
        }

        for (const marker of contract.forbiddenPackageMarkers ?? []) {
            if (text.includes(marker)) fail(`${contract.directory}/${example} contains stale package marker ${marker}`);
        }

        for (const marker of contract.forbiddenPackageMarkers ?? []) {
            if (readme.includes(marker)) fail(`${contract.readme} contains stale package marker ${marker}`);
        }

        for (const prefix of contract.forbiddenImportPrefixes ?? []) {
            const pattern = new RegExp(`from\\s+["']${escapeRegExp(prefix)}`);
            if (pattern.test(text)) {
                fail(`${contract.directory}/${example} imports from forbidden local prefix ${prefix}`);
            }
        }

        for (const secretPattern of contract.forbiddenSecretPatterns ?? []) {
            const pattern = new RegExp(secretPattern);
            if (pattern.test(text)) {
                fail(`${contract.directory}/${example} appears to contain a committed secret matching ${secretPattern}`);
            }
            if (pattern.test(readme)) {
                fail(`${contract.readme} appears to contain a committed secret matching ${secretPattern}`);
            }
        }
    }
}

for (const entry of contract.supportingContracts ?? []) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(`${entry.path} missing marker ${JSON.stringify(marker)}`);
    }
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail(`Makefile missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail(`Makefile missing ${contract.wiring.checker} invocation`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail(`Makefile ${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("examples contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`examples contract passed (${contract.examples.length} examples)`);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
