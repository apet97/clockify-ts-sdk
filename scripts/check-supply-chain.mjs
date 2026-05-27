#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "supply-chain-contract.json"), "utf8"));
const failures = [];

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function supplyRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
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

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(label, "must be a boolean");
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
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

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = supplyRelativePath(label, relativePath);
    if (safePath == null) return "";
    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function checkText(relativePath, markers, forbiddenMarkers = []) {
    const text = readRelative(relativePath);
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(relativePath, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(relativePath, `contains forbidden marker ${marker}`);
    }
    return text;
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);
    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-supply-chain-paths",
        "typed-package-supply-chain-entries",
        "typed-publish-config-expectations",
        "typed-pack-file-boundaries",
        "typed-policy-contract",
        "typed-supporting-contracts",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "supply-chain") {
            fail("wiring.makeTarget", "must be supply-chain");
        }
        if (contract.wiring.checker !== "scripts/check-supply-chain.mjs") {
            fail("wiring.checker", "must be scripts/check-supply-chain.mjs");
        }
    }

    if (!Array.isArray(contract.packages) || contract.packages.length === 0) {
        fail("packages", "must be a non-empty array");
    }
    assertUnique(
        "packages.id",
        (contract.packages ?? []).map((pkg) => pkg?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, pkg] of (contract.packages ?? []).entries()) {
        const label = pkg?.id ?? `packages[${index}]`;
        if (pkg == null || typeof pkg !== "object" || Array.isArray(pkg)) {
            fail(label, "package entry must be an object");
            continue;
        }
        assertNonEmptyString(`${label}.id`, pkg.id);
        supplyRelativePath(`${label}.manifest`, pkg.manifest);
        supplyRelativePath(`${label}.licenseFile`, pkg.licenseFile);
        assertNonEmptyString(`${label}.name`, pkg.name);
        assertNonEmptyString(`${label}.license`, pkg.license);
        if (pkg.publishConfig == null || typeof pkg.publishConfig !== "object" || Array.isArray(pkg.publishConfig)) {
            fail(label, "publishConfig must be an object");
        } else {
            assertNonEmptyString(`${label}.publishConfig.access`, pkg.publishConfig.access);
            assertBoolean(`${label}.publishConfig.provenance`, pkg.publishConfig.provenance);
        }
        for (const field of ["requiredFiles", "forbiddenFiles"]) {
            const values = assertStringArray(`${label}.${field}`, pkg[field], { allowEmpty: false });
            assertUnique(`${label}.${field}`, values);
        }
    }

    if (assertObject("policyDocument", contract.policyDocument)) {
        supplyRelativePath("policyDocument.path", contract.policyDocument.path);
        assertUnique(
            "policyDocument.mustContain",
            assertStringArray("policyDocument.mustContain", contract.policyDocument.mustContain, {
                allowEmpty: false,
            }),
        );
        assertUnique(
            "policyDocument.forbiddenMarkers",
            assertStringArray("policyDocument.forbiddenMarkers", contract.policyDocument.forbiddenMarkers ?? []),
        );
    }

    if (!Array.isArray(contract.supportingContracts) || contract.supportingContracts.length === 0) {
        fail("supportingContracts", "must be a non-empty array");
    }
    assertUnique(
        "supportingContracts.path",
        (contract.supportingContracts ?? [])
            .map((supporting) => supporting?.path)
            .filter((supportingPath) => typeof supportingPath === "string"),
    );
    for (const [index, supporting] of (contract.supportingContracts ?? []).entries()) {
        const label = `supportingContracts[${index}]`;
        if (supporting == null || typeof supporting !== "object" || Array.isArray(supporting)) {
            fail(label, "must be an object");
            continue;
        }
        supplyRelativePath(`${label}.path`, supporting.path);
        assertUnique(
            `${label}.mustContain`,
            assertStringArray(`${label}.mustContain`, supporting.mustContain, { allowEmpty: false }),
        );
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("supply-chain contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const pkg of contract.packages ?? []) {
    if (pkg == null || typeof pkg !== "object" || Array.isArray(pkg)) continue;

    const manifestText = readRelative(pkg.manifest, `${pkg.id}.manifest`);
    if (!manifestText) continue;
    const manifest = JSON.parse(manifestText);

    if (manifest.name !== pkg.name) fail(pkg.id, `expected name ${pkg.name}, got ${manifest.name}`);
    if (manifest.license !== pkg.license) fail(pkg.id, `expected license ${pkg.license}, got ${manifest.license}`);
    if (manifest.private === true) fail(pkg.id, "package must remain packable, not private");

    const licenseText = readRelative(pkg.licenseFile, `${pkg.id}.licenseFile`);
    if (!licenseText.startsWith("MIT License")) fail(pkg.id, `${pkg.licenseFile} must start with MIT License`);

    if (manifest.publishConfig?.access !== pkg.publishConfig.access) {
        fail(pkg.id, `publishConfig.access must be ${pkg.publishConfig.access}`);
    }
    if (manifest.publishConfig?.provenance !== pkg.publishConfig.provenance) {
        fail(pkg.id, "publishConfig.provenance must be true");
    }

    if (typeof manifest.scripts?.prepublishOnly !== "string") {
        fail(pkg.id, "scripts.prepublishOnly is required");
    }

    const files = Array.isArray(manifest.files) ? manifest.files : [];
    for (const requiredFile of pkg.requiredFiles ?? []) {
        if (!files.includes(requiredFile)) fail(pkg.id, `files missing ${requiredFile}`);
    }
    for (const forbiddenFile of pkg.forbiddenFiles ?? []) {
        if (files.includes(forbiddenFile)) fail(pkg.id, `files must not include ${forbiddenFile}`);
    }
}

checkText(
    contract.policyDocument?.path,
    contract.policyDocument?.mustContain,
    contract.policyDocument?.forbiddenMarkers,
);

for (const supporting of contract.supportingContracts ?? []) {
    if (supporting == null || typeof supporting !== "object" || Array.isArray(supporting)) continue;

    checkText(supporting.path, supporting.mustContain);
}

const makefile = readRelative("Makefile");
if (!makefile.includes("supply-chain:")) fail("Makefile", "missing supply-chain target");

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of ["supply-chain-policy.md", "supply-chain-contract.json"]) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (failures.length > 0) {
    console.error("supply-chain contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const packageCount = Array.isArray(contract.packages) ? contract.packages.length : 0;
console.log(`supply-chain contract passed (${packageCount} packages)`);
