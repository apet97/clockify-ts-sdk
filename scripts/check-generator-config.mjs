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

function assertBoolean(label, value) {
    if (typeof value !== "boolean") fail(`${label}: must be a boolean`);
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

function assertStringArray(label, values, { min = 0 } = {}) {
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

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    if (assertObject("localGenerator", contract.localGenerator)) {
        for (const key of ["script", "inputOpenApi", "outputPath", "syncScript", "generatedWrapperPath"]) {
            safeRelativePath(`localGenerator.${key}`, contract.localGenerator[key]);
        }
        assertNonEmptyString("localGenerator.writeCommand", contract.localGenerator.writeCommand);
        assertNonEmptyString("localGenerator.checkCommand", contract.localGenerator.checkCommand);
        assertNonEmptyString("localGenerator.testCommand", contract.localGenerator.testCommand);
    }

    if (assertObject("offlineReproducibility", contract.offlineReproducibility)) {
        for (const key of ["requiresDocker", "requiresHostedLogin", "requiresApiToken"]) {
            assertBoolean(`offlineReproducibility.${key}`, contract.offlineReproducibility[key]);
        }
        assertStringArray("offlineReproducibility.forbiddenCommandMarkers", contract.offlineReproducibility.forbiddenCommandMarkers, {
            min: 1,
        });
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
        for (const key of ["makeTarget", "checker", "codegenTarget", "codegenDriftTarget", "codegenTestTarget", "qualityGate", "inventoryId", "auditId"]) {
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

const localGenerator = contract.localGenerator;
const scriptText = readRelative(localGenerator.script, "localGenerator.script");
const constantsText = readRelative("scripts/sdk-codegen/constants.mjs", "localGenerator.constantsModule");
readRelative(localGenerator.inputOpenApi, "localGenerator.inputOpenApi");
readRelative(localGenerator.syncScript, "localGenerator.syncScript");

for (const marker of [localGenerator.inputOpenApi, localGenerator.outputPath]) {
    if (!`${scriptText}\n${constantsText}`.includes(marker)) {
        fail(`${localGenerator.script} or scripts/sdk-codegen/constants.mjs missing marker ${marker}`);
    }
}
for (const marker of contract.offlineReproducibility.forbiddenCommandMarkers ?? []) {
    if (scriptText.toLowerCase().includes(marker.toLowerCase())) {
        fail(`${localGenerator.script} must not include ${marker.trim()}`);
    }
}

for (const commandName of ["writeCommand", "checkCommand"]) {
    const command = localGenerator[commandName];
    if (!command.startsWith(`node ${localGenerator.script}`)) {
        fail(`localGenerator.${commandName} must invoke node ${localGenerator.script}`);
    }
    for (const marker of contract.offlineReproducibility.forbiddenCommandMarkers ?? []) {
        if (command.toLowerCase().includes(marker.toLowerCase())) {
            fail(`localGenerator.${commandName} must not include ${marker.trim()}`);
        }
    }
}
if (!localGenerator.testCommand.startsWith("npm run test:codegen")) {
    fail("localGenerator.testCommand must invoke npm run test:codegen");
}
if (contract.offlineReproducibility.requiresDocker !== false) {
    fail("offlineReproducibility.requiresDocker must be false");
}
if (contract.offlineReproducibility.requiresHostedLogin !== false) {
    fail("offlineReproducibility.requiresHostedLogin must be false");
}
if (contract.offlineReproducibility.requiresApiToken !== false) {
    fail("offlineReproducibility.requiresApiToken must be false");
}

for (const doc of contract.requiredDocs ?? []) {
    const text = readRelative(doc.path);
    for (const marker of doc.contains ?? []) {
        if (!text.includes(marker)) fail(`${doc.path} missing marker ${JSON.stringify(marker)}`);
    }
}

const makefile = readRelative("Makefile");
for (const target of [contract.wiring.makeTarget, contract.wiring.codegenTarget, contract.wiring.codegenDriftTarget, contract.wiring.codegenTestTarget]) {
    if (!makefile.includes(`${target}:`)) fail(`Makefile missing ${target} target`);
}
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail(`Makefile missing ${contract.wiring.checker} invocation`);
if (!makefile.includes(localGenerator.writeCommand)) fail(`Makefile missing ${localGenerator.writeCommand}`);
if (!makefile.includes(localGenerator.checkCommand)) fail(`Makefile missing ${localGenerator.checkCommand}`);
if (!makefile.includes(localGenerator.testCommand)) fail(`Makefile missing ${localGenerator.testCommand}`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail(`Makefile ${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}
const fullLine = makefile.split("\n").find((line) => line.startsWith("perfect-full:")) ?? "";
if (!fullLine.includes(contract.wiring.codegenTarget)) {
    fail(`Makefile perfect-full missing ${contract.wiring.codegenTarget}`);
}
if (!fullLine.includes(contract.wiring.codegenDriftTarget)) {
    fail(`Makefile perfect-full missing ${contract.wiring.codegenDriftTarget}`);
}
if (!fullLine.includes(contract.wiring.codegenTestTarget)) {
    fail(`Makefile perfect-full missing ${contract.wiring.codegenTestTarget}`);
}
if (fullLine.includes("fern-check") || fullLine.includes("fern-generate")) {
    fail("Makefile perfect-full must not depend on fern-check or fern-generate");
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

console.log(`generator config contract passed (${localGenerator.script} -> ${localGenerator.outputPath})`);
