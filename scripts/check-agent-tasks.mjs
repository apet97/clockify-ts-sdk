#!/usr/bin/env node
// agent-tasks contract checker.
//
// Verifies the agent task packets exist, are linked from the index, carry every
// required section, contain no placeholder markers, and that the gate is wired
// into the Makefile / quality-gates / docs index / contract inventory / enterprise
// audit (the standard five-anchor wiring).
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

const contract = readJson("docs/agent-tasks-contract.json", "contract") ?? {};

if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
assertNonEmptyString("purpose", contract.purpose);

const index = contract.indexDocument ?? {};
assertNonEmptyString("indexDocument.path", index.path);
const indexMarkers = assertStringArray("indexDocument.mustContain", index.mustContain, { min: 1 });
const requiredSections = assertStringArray("requiredSections", contract.requiredSections, { min: 1 });
const packets = assertStringArray("packets", contract.packets, { min: 1 });
const forbiddenMarkers = Array.isArray(contract.forbiddenMarkers) ? contract.forbiddenMarkers : [];

const wiring = contract.wiring ?? {};
for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
    assertNonEmptyString(`wiring.${key}`, wiring[key]);
}
const docsIndex = assertStringArray("wiring.docsIndex", wiring.docsIndex, { min: 1 });

if (failures.length > 0) {
    console.error("Agent tasks contract shape failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

// Index document
const indexText = readRelative(index.path);
for (const marker of indexMarkers) {
    if (!indexText.includes(marker)) fail(`${index.path}: missing marker ${JSON.stringify(marker)}`);
}
for (const marker of index.forbiddenMarkers ?? []) {
    if (indexText.includes(marker)) fail(`${index.path}: contains forbidden marker ${JSON.stringify(marker)}`);
}

// Each packet: exists, linked from index, has all required sections, no forbidden markers.
for (const packet of packets) {
    const text = readRelative(packet);
    if (text === "") continue;
    const basename = path.basename(packet);
    if (!indexText.includes(`(./${basename})`)) {
        fail(`${index.path}: missing link to ./${basename}`);
    }
    for (const section of requiredSections) {
        if (!text.includes(section)) fail(`${packet}: missing required section ${JSON.stringify(section)}`);
    }
    for (const marker of forbiddenMarkers) {
        if (text.includes(marker)) fail(`${packet}: contains forbidden marker ${JSON.stringify(marker)}`);
    }
}

// Five-anchor wiring.
const makefile = readRelative("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile: missing target ${wiring.makeTarget}`);
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile: missing ${wiring.checker} invocation`);
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${aggregate}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile: ${aggregate} missing ${wiring.makeTarget}`);
}

const docsIndexText = readRelative("docs/README.md");
for (const doc of docsIndex) {
    if (!docsIndexText.includes(`./${doc}`)) fail(`docs/README.md: missing link ./${doc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md: missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json: missing id ${wiring.inventoryId}`);
}
const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json: missing id ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Agent tasks contract failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

console.log(`agent-tasks contract passed (${packets.length} packets checked)`);
