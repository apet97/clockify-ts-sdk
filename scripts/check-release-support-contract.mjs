#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/release-support-contract.json", "contractPath");

function fail(message) {
    failures.push(message);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label} must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(`${label} must be a boolean`);
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label} must be an object`);
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(`${label} must be an array`);
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(`${label} must be a non-empty array`);
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(`${label} contains a non-string or empty entry`);
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${safePath} is missing`);
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label} invalid JSON: ${error.message}`);
        return {};
    }
}

function checkContains(relativePath, markers, label = relativePath) {
    const text = readRelative(relativePath, label);
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(`${relativePath} missing marker ${JSON.stringify(marker)}`);
    }
    return text;
}

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const mustContain = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, mustContain);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-release-support-evidence-paths",
        "typed-policy-document-contract",
        "typed-security-document-contract",
        "typed-package-contract-reference",
        "typed-required-make-targets",
        "typed-docs-index-contract",
        "typed-forbidden-policy-markers",
        "typed-wiring-contract",
    ]) {
        if (!invariants.includes(invariant)) fail(`contractInvariants missing ${invariant}`);
    }

    validateMarkerEntry("policyDocument", contract.policyDocument);
    validateMarkerEntry("securityDocument", contract.securityDocument);
    const forbiddenRegex = assertStringArray("securityDocument.forbiddenRegex", contract.securityDocument?.forbiddenRegex ?? []);
    assertUnique("securityDocument.forbiddenRegex", forbiddenRegex);
    for (const pattern of forbiddenRegex) {
        try {
            new RegExp(pattern);
        } catch (error) {
            fail(`securityDocument.forbiddenRegex invalid regex ${pattern}: ${error.message}`);
        }
    }

    if (assertObject("packageContract", contract.packageContract)) {
        safeRelativePath("packageContract.path", contract.packageContract.path);
        assertBoolean("packageContract.packageNamesMustAppearInPolicy", contract.packageContract.packageNamesMustAppearInPolicy);
        const requiredMarkers = assertStringArray("packageContract.requiredMarkers", contract.packageContract.requiredMarkers, {
            allowEmpty: false,
        });
        assertUnique("packageContract.requiredMarkers", requiredMarkers);
    }

    const requiredMakeTargets = assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, {
        allowEmpty: false,
    });
    assertUnique("requiredMakeTargets", requiredMakeTargets);

    const forbiddenPolicyMarkers = assertStringArray("forbiddenPolicyMarkers", contract.forbiddenPolicyMarkers, {
        allowEmpty: false,
    });
    assertUnique("forbiddenPolicyMarkers", forbiddenPolicyMarkers);

    const docsIndex = assertStringArray("docsIndex", contract.docsIndex, { allowEmpty: false });
    assertUnique("docsIndex", docsIndex);

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("release/support contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policyText = checkContains(contract.policyDocument.path, contract.policyDocument.mustContain);
for (const marker of contract.forbiddenPolicyMarkers ?? []) {
    if (policyText.includes(marker)) fail(`${contract.policyDocument.path} contains ${marker}`);
}

const securityText = checkContains(contract.securityDocument.path, contract.securityDocument.mustContain);
for (const pattern of contract.securityDocument.forbiddenRegex ?? []) {
    const regex = new RegExp(pattern);
    if (regex.test(securityText)) fail(`${contract.securityDocument.path} matches forbidden pattern ${pattern}`);
}

const packageContract = readJson(contract.packageContract.path, "packageContract.path");
const packageContractText = readRelative(contract.packageContract.path);
for (const marker of contract.packageContract.requiredMarkers ?? []) {
    if (!packageContractText.includes(marker)) {
        fail(`${contract.packageContract.path} missing package-contract marker ${JSON.stringify(marker)}`);
    }
}
if (contract.packageContract.packageNamesMustAppearInPolicy) {
    for (const pkg of packageContract.packages ?? []) {
        if (!policyText.includes(pkg.name)) {
            fail(`${contract.policyDocument.path} missing package name ${pkg.name}`);
        }
        if (!securityText.includes(pkg.name)) {
            fail(`${contract.securityDocument.path} missing package name ${pkg.name}`);
        }
    }
}

const makefile = readRelative("Makefile");
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail(`Makefile missing target ${target}`);
}
const wiring = contract.wiring ?? {};
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile ${target} missing ${wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("release/support contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("release/support contract passed");
