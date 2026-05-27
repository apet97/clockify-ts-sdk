#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/generator-config-contract.json", "contract") ?? {};

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

function fernRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(`${label}: must be a non-empty Fern-relative path`);
        return "";
    }

    if (path.isAbsolute(relativePath)) {
        fail(`${label}: must not be absolute: ${relativePath}`);
        return "";
    }

    return path.normalize(relativePath).replace(/\\/g, "/");
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

function validateRequiredDoc(index, doc) {
    const label = `requiredDocs[${index}]`;
    if (!assertObject(label, doc)) return;
    safeRelativePath(`${label}.path`, doc.path);
    assertStringArray(`${label}.contains`, doc.contains, { min: 1 });
}

function validateGeneratorGroup(label, group) {
    if (!assertObject(label, group)) return;
    assertNonEmptyString(`${label}.name`, group.name);
    assertNonEmptyString(`${label}.version`, group.version);
    fernRelativePath(`${label}.outputPath`, group.outputPath);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, { min: 1 });
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-generator-config-evidence-paths",
        "typed-fern-config-contract",
        "typed-generators-contract",
        "typed-required-docs",
        "typed-wiring-contract",
    ]) {
        if (!invariants.includes(invariant)) fail(`contractInvariants: missing invariant ${invariant}`);
    }

    if (assertObject("fernConfig", contract.fernConfig)) {
        safeRelativePath("fernConfig.path", contract.fernConfig.path);
        assertNonEmptyString("fernConfig.organization", contract.fernConfig.organization);
        assertNonEmptyString("fernConfig.cliVersion", contract.fernConfig.cliVersion);
    }

    if (assertObject("generators", contract.generators)) {
        safeRelativePath("generators.path", contract.generators.path);
        assertNonEmptyString("generators.defaultGroup", contract.generators.defaultGroup);
        fernRelativePath("generators.activeOpenApiPath", contract.generators.activeOpenApiPath);
        if (assertObject("generators.groups", contract.generators.groups)) {
            for (const [group, expected] of Object.entries(contract.generators.groups)) {
                validateGeneratorGroup(`generators.groups.${group}`, expected);
            }
        }
    }

    if (!Array.isArray(contract.requiredDocs) || contract.requiredDocs.length === 0) {
        fail("requiredDocs: must be a non-empty array");
    }
    for (const [index, doc] of (contract.requiredDocs ?? []).entries()) validateRequiredDoc(index, doc);
    assertUnique(
        "requiredDocs.path",
        (contract.requiredDocs ?? []).map((doc) => doc?.path).filter((docPath) => typeof docPath === "string"),
    );

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
    console.error("generator config contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const fernConfig = readJson(contract.fernConfig.path, "fernConfig.path");
if (fernConfig == null) {
    fail(`${contract.fernConfig.path} is missing`);
} else {
    if (fernConfig.organization !== contract.fernConfig.organization) {
        fail(`expected Fern organization ${contract.fernConfig.organization}, got ${fernConfig.organization}`);
    }
    if (fernConfig.version !== contract.fernConfig.cliVersion) {
        fail(`expected Fern CLI ${contract.fernConfig.cliVersion}, got ${fernConfig.version}`);
    }
}

const generatorsText = readRelative(contract.generators.path, "generators.path");
if (generatorsText === "") {
    fail(`${contract.generators.path} is missing`);
} else {
    const uncommented = generatorsText
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");

    if (!uncommented.includes(`default-group: ${contract.generators.defaultGroup}`)) {
        fail(`generators.yml default-group must be ${contract.generators.defaultGroup}`);
    }
    if (!uncommented.includes(`openapi: ${contract.generators.activeOpenApiPath}`)) {
        fail(`generators.yml active OpenAPI path must be ${contract.generators.activeOpenApiPath}`);
    }
    if (uncommented.includes("../official/clockify.official.openapi.yaml")) {
        fail("generators.yml must not actively point at the official upstream OpenAPI spec");
    }

    for (const [group, expected] of Object.entries(contract.generators.groups ?? {})) {
        if (!uncommented.includes(`${group}:`)) fail(`generators.yml missing group ${group}`);
        for (const marker of [
            `name: ${expected.name}`,
            `version: ${expected.version}`,
            `path: ${expected.outputPath}`,
        ]) {
            if (!uncommented.includes(marker)) fail(`generators.yml missing ${group} marker ${marker}`);
        }
    }
}

for (const doc of contract.requiredDocs ?? []) {
    const text = readRelative(doc.path);
    for (const marker of doc.contains ?? []) {
        if (!text.includes(marker)) fail(`${doc.path} missing marker ${JSON.stringify(marker)}`);
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
    console.error("generator config contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`generator config contract passed (Fern ${contract.fernConfig.cliVersion}, TS generator ${contract.generators.groups.ts.version})`);
