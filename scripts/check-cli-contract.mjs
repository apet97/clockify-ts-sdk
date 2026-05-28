#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/cli-contract.json", "contractPath");

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

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertNonNegativeInteger(label, value) {
    if (!Number.isInteger(value) || value < 0) {
        fail(`${label} must be a non-negative integer`);
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

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    safeRelativePath("metadata", contract.metadata);
    if (assertObject("expected", contract.expected)) {
        assertNonNegativeInteger("expected.commandCount", contract.expected.commandCount);
        for (const field of ["binaries", "globalFlags", "completionShells"]) {
            const values = assertStringArray(`expected.${field}`, contract.expected[field], {
                allowEmpty: false,
            });
            assertUnique(`expected.${field}`, values);
        }
        if (assertObject("expected.exitCodes", contract.expected.exitCodes)) {
            for (const field of ["success", "runtimeOrApiError", "usageError"]) {
                assertNonNegativeInteger(`expected.exitCodes.${field}`, contract.expected.exitCodes[field]);
            }
        }
    }

    if (assertObject("sourceEvidence", contract.sourceEvidence)) {
        const requiredEvidence = [
            "entrypoint",
            "completions",
            "readme",
            "indexTest",
            "completionTest",
            "exitContractTest",
        ];
        for (const key of requiredEvidence) {
            safeRelativePath(`sourceEvidence.${key}`, contract.sourceEvidence[key]);
        }
        assertUnique("sourceEvidence", Object.values(contract.sourceEvidence).filter((value) => typeof value === "string"));
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("CLI contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const metadata = readJson(contract.metadata, "metadata");

if ((metadata.commands ?? []).length !== contract.expected.commandCount) {
    fail(`expected ${contract.expected.commandCount} commands, got ${(metadata.commands ?? []).length}`);
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile ${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile ${wiring.makeTarget} target does not run checker`);

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) fail(`docs/README.md missing ${wiring.docsIndexContract}`);

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

const readme = readEvidence("readme");
const entrypoint = readEvidence("entrypoint");
const completions = readEvidence("completions");
const indexTest = readEvidence("indexTest");
const completionTest = readEvidence("completionTest");
const exitContractTest = readEvidence("exitContractTest");

for (const command of metadata.commands ?? []) {
    if (!command.command?.startsWith("clk115 ")) {
        fail(`command does not use clk115 prefix: ${command.command}`);
    }
    const readmeCommand = command.command.replaceAll("|", "\\|");
    if (!readme.includes(readmeCommand)) {
        fail(`README command table missing ${command.command}`);
    }
}

for (const binary of contract.expected.binaries ?? []) {
    if (!readme.includes(binary)) fail(`README missing binary ${binary}`);
    if (!completionTest.includes(binary)) fail(`completion test missing binary ${binary}`);
}

for (const flag of contract.expected.globalFlags ?? []) {
    if (!entrypoint.includes(flag)) fail(`entrypoint missing global flag ${flag}`);
    if (!readme.includes(flag)) fail(`README missing global flag ${flag}`);
}

for (const shell of contract.expected.completionShells ?? []) {
    if (!completions.includes(shell)) fail(`completion renderer missing shell ${shell}`);
    if (!completionTest.includes(shell)) fail(`completion test missing shell ${shell}`);
    if (!readme.includes(shell)) fail(`README missing shell ${shell}`);
}

if (!indexTest.includes("completion")) fail("index test does not include completion command");
if (!exitContractTest.includes("toBe(2)")) fail("exit contract test missing usage exit code 2");
if (!exitContractTest.includes("toBe(1)")) fail("exit contract test missing runtime/API exit code 1");
if (!exitContractTest.includes("toBe(0)")) fail("exit contract test missing success exit code 0");

if (failures.length > 0) {
    console.error("CLI contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`CLI contract passed (${metadata.commands.length} commands)`);

function readEvidence(label) {
    const relativePath = contract.sourceEvidence?.[label];
    if (!relativePath) return "";
    return readRelative(relativePath, `sourceEvidence.${label}`);
}
