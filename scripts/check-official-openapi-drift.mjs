#!/usr/bin/env node
// official-openapi-drift contract checker.
//
// Validates the official-vs-custom drift contract shape, that the three generated
// trust surfaces exist and carry the generator banner, and that the gate is wired
// into the Makefile / quality-gates / docs index / contract inventory / enterprise
// audit (the standard five-anchor wiring every contract gate asserts). The
// staleness of the generated surfaces themselves is enforced by
// `node scripts/official-openapi-drift.mjs --check`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

function readRelative(relativePath, label = relativePath) {
    const abs = path.join(root, relativePath);
    if (!fs.existsSync(abs)) {
        fail(`${label}: missing`);
        return "";
    }
    return fs.readFileSync(abs, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label}: invalid JSON (${error.message})`);
        return null;
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") fail(`${label}: must be a non-empty string`);
}

function assertStringArray(label, value, { min = 1 } = {}) {
    if (!Array.isArray(value) || value.length < min) {
        fail(`${label}: must be an array with at least ${min} item(s)`);
        return [];
    }
    return value;
}

const contract = readJson("docs/official-openapi-drift-contract.json", "contract") ?? {};

// --- shape ---
if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
assertNonEmptyString("purpose", contract.purpose);
assertNonEmptyString("generatedBanner", contract.generatedBanner);
assertNonEmptyString("reportLibrary", contract.reportLibrary);
assertNonEmptyString("driver", contract.driver);

const policy = contract.policyDocument ?? {};
assertNonEmptyString("policyDocument.path", policy.path);
const policyMarkers = assertStringArray("policyDocument.mustContain", policy.mustContain, { min: 1 });
const generatedSurfaces = assertStringArray("generatedTruthSurfaces", contract.generatedTruthSurfaces, { min: 1 });
const requiredMakeTargets = assertStringArray("requiredMakeTargets", contract.requiredMakeTargets, { min: 1 });

const wiring = contract.wiring ?? {};
for (const key of ["makeTarget", "reportTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
    assertNonEmptyString(`wiring.${key}`, wiring[key]);
}
const docsIndex = assertStringArray("wiring.docsIndex", wiring.docsIndex, { min: 1 });

if (failures.length > 0) {
    console.error("Official OpenAPI drift contract shape failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

// --- policy doc ---
const policyText = readRelative(policy.path);
for (const marker of policyMarkers) {
    if (!policyText.includes(marker)) fail(`${policy.path}: missing marker ${JSON.stringify(marker)}`);
}
for (const marker of policy.forbiddenMarkers ?? []) {
    if (policyText.includes(marker)) fail(`${policy.path}: contains forbidden marker ${JSON.stringify(marker)}`);
}

// --- generated surfaces exist + carry the banner ---
for (const surface of generatedSurfaces) {
    const text = readRelative(surface);
    if (text && !text.includes(contract.generatedBanner)) {
        fail(`${surface}: missing generator banner ${JSON.stringify(contract.generatedBanner)}`);
    }
}

// --- report library + driver exist ---
readRelative(contract.reportLibrary);
readRelative(contract.driver);

// --- Makefile wiring ---
const makefile = readRelative("Makefile");
for (const target of requiredMakeTargets) {
    if (!makefile.includes(`${target}:`)) fail(`Makefile: missing target ${target}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile: missing ${wiring.checker} invocation`);
if (!makefile.includes(`node ${contract.driver}`)) fail(`Makefile: missing ${contract.driver} invocation`);
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${aggregate}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile: ${aggregate} missing ${wiring.makeTarget}`);
}

// --- docs index links ---
const docsIndexText = readRelative("docs/README.md");
for (const doc of docsIndex) {
    if (!docsIndexText.includes(`./${doc}`)) fail(`docs/README.md: missing link ./${doc}`);
}

// --- quality gates ---
const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md: missing ${wiring.qualityGate}`);

// --- contract inventory + enterprise audit ids ---
const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json: missing id ${wiring.inventoryId}`);
}
const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json: missing id ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Official OpenAPI drift contract failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

console.log("official-openapi-drift contract passed");
