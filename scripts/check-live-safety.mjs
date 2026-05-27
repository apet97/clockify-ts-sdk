#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/live-safety-contract.json", "contractPath");

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
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

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
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
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function checkContains(id, text, markers) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(id, `missing marker ${JSON.stringify(marker)}`);
    }
}

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const mustContain = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, mustContain);
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
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
        "safe-live-safety-evidence-paths",
        "typed-policy-document-contract",
        "typed-live-gate-evidence",
        "typed-mcp-cleanup-script-contract",
        "typed-final-proof-deferral-contract",
        "typed-risk-register-evidence",
        "typed-docs-index-contract",
        "typed-wiring-contract",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    for (const field of ["policyDocument", "makefile", "cleanupScript", "finalProof", "riskRegister"]) {
        validateMarkerEntry(field, contract[field]);
    }

    if (assertObject("mcpPackage", contract.mcpPackage)) {
        safeRelativePath("mcpPackage.path", contract.mcpPackage.path);
        if (assertObject("mcpPackage.requiredScript", contract.mcpPackage.requiredScript)) {
            assertNonEmptyString("mcpPackage.requiredScript.name", contract.mcpPackage.requiredScript.name);
            assertNonEmptyString("mcpPackage.requiredScript.mustContain", contract.mcpPackage.requiredScript.mustContain);
        }
    }

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
    console.error("live safety contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policyText = readRelative(contract.policyDocument.path);
checkContains(contract.policyDocument.path, policyText, contract.policyDocument.mustContain);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policyText.includes(marker)) fail(contract.policyDocument.path, `contains forbidden marker ${marker}`);
}

checkContains(contract.makefile.path, readRelative(contract.makefile.path), contract.makefile.mustContain);
checkContains(contract.cleanupScript.path, readRelative(contract.cleanupScript.path), contract.cleanupScript.mustContain);
checkContains(contract.finalProof.path, readRelative(contract.finalProof.path), contract.finalProof.mustContain);
checkContains(contract.riskRegister.path, readRelative(contract.riskRegister.path), contract.riskRegister.mustContain);

const mcpPackage = readJson(contract.mcpPackage.path, "mcpPackage.path");
const actualScript = mcpPackage.scripts?.[contract.mcpPackage.requiredScript.name];
if (typeof actualScript !== "string") {
    fail(contract.mcpPackage.path, `missing script ${contract.mcpPackage.requiredScript.name}`);
} else if (!actualScript.includes(contract.mcpPackage.requiredScript.mustContain)) {
    fail(contract.mcpPackage.path, `script ${contract.mcpPackage.requiredScript.name} missing cleanup command`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("live safety contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("live safety contract passed");
