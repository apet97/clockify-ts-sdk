#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "compatibility-contract.json");
const makefilePath = path.join(root, "Makefile");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];

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

function checkMarkers(relativePath, markers, label = relativePath) {
    const text = readRelative(relativePath, label);
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(`${relativePath} missing marker ${JSON.stringify(marker)}`);
    }
    return text;
}

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const markers = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, markers);
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
        "safe-compatibility-evidence-paths",
        "typed-policy-document-contract",
        "typed-surface-contracts",
        "typed-deprecation-window-contract",
        "typed-required-make-targets",
        "typed-docs-index-contract",
        "typed-forbidden-policy-markers",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail(`contractInvariants missing ${invariant}`);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "compatibility-contract") {
            fail("wiring.makeTarget must be compatibility-contract");
        }
        if (contract.wiring.checker !== "scripts/check-compatibility-contract.mjs") {
            fail("wiring.checker must be scripts/check-compatibility-contract.mjs");
        }
    }

    validateMarkerEntry("policyDocument", contract.policyDocument);

    if (assertObject("deprecationWindow", contract.deprecationWindow)) {
        assertNonEmptyString("deprecationWindow.minimumPolicy", contract.deprecationWindow.minimumPolicy);
        const policyMarkers = assertStringArray("deprecationWindow.policyMustContain", contract.deprecationWindow.policyMustContain, {
            allowEmpty: false,
        });
        assertUnique("deprecationWindow.policyMustContain", policyMarkers);
    }

    if (!Array.isArray(contract.surfaceContracts) || contract.surfaceContracts.length === 0) {
        fail("surfaceContracts must be a non-empty array");
    }
    assertUnique(
        "surfaceContracts.surface",
        (contract.surfaceContracts ?? [])
            .map((surface) => surface?.surface)
            .filter((surface) => typeof surface === "string"),
    );
    for (const [surfaceIndex, surface] of (contract.surfaceContracts ?? []).entries()) {
        const surfaceLabel = surface?.surface ?? `surfaceContracts[${surfaceIndex}]`;
        if (!assertObject(surfaceLabel, surface)) continue;
        assertNonEmptyString(`${surfaceLabel}.surface`, surface.surface);
        if (!Array.isArray(surface.paths) || surface.paths.length === 0) {
            fail(`${surfaceLabel}.paths must be a non-empty array`);
            continue;
        }
        assertUnique(
            `${surfaceLabel}.paths.path`,
            surface.paths.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
        );
        for (const [entryIndex, entry] of surface.paths.entries()) {
            validateMarkerEntry(`${surfaceLabel}.paths[${entryIndex}]`, entry);
        }
    }

    for (const field of ["requiredMakeTargets", "docsIndex", "forbiddenPolicyMarkers"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("compatibility contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policy = contract.policyDocument;
const policyText = checkMarkers(policy.path, policy.mustContain, "policyDocument.path");
if (contract.deprecationWindow?.minimumPolicy && !policyText.includes(contract.deprecationWindow.minimumPolicy)) {
    fail(`${policy.path} missing deprecation-window policy ${JSON.stringify(contract.deprecationWindow.minimumPolicy)}`);
}
for (const marker of contract.deprecationWindow?.policyMustContain ?? []) {
    if (!policyText.includes(marker)) fail(`${policy.path} missing deprecation-window marker ${JSON.stringify(marker)}`);
}
for (const marker of contract.forbiddenPolicyMarkers ?? []) {
    if (policyText.includes(marker)) fail(`${policy.path} contains forbidden placeholder marker ${marker}`);
}

for (const surface of contract.surfaceContracts ?? []) {
    for (const entry of surface.paths ?? []) {
        checkMarkers(entry.path, entry.mustContain);
    }
}

const makefile = readRelative(path.relative(root, makefilePath));
for (const target of contract.requiredMakeTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail(`Makefile missing target ${target}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

if (failures.length > 0) {
    console.error("compatibility contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("compatibility contract passed");
