#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isWiringTargetReachable } from "./lib/gate-targets.mjs";
import { normalizeSafeRelativePath } from "./lib/contract-io.mjs";

const rootArgIndex = process.argv.indexOf("--root");
const root = rootArgIndex === -1
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
    : path.resolve(process.argv[rootArgIndex + 1] ?? "");
const failures = [];
const contract = readJson("docs/agent-handoff-contract.json", "contract") ?? {};

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    const result = normalizeSafeRelativePath(relativePath);
    if (result.error !== undefined) {
        fail(label, result.error);
        return "";
    }
    return result.path;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(label, "missing");
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
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(label, "must be a non-empty string");
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(label, `must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { required = true, min = 0 } = {}) {
    if (values == null && !required) return [];
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (values.length < min) fail(label, `must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]`, "must be a non-empty string");
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateEntryShape(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateEntryCollection(label, entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        fail(label, "must be a non-empty array");
        return;
    }
    for (const [index, entry] of entries.entries()) {
        validateEntryShape(`${label}[${index}]`, entry);
    }
    assertUnique(
        `${label}.path`,
        entries.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntryShape("policyDocument", contract.policyDocument);
    validateEntryCollection("guidance", contract.guidance);
    validateEntryCollection("supportingChecks", contract.supportingChecks);
    for (const [index, relativePath] of assertStringArray("guidanceScanPaths", contract.guidanceScanPaths, {
        min: 1,
    }).entries()) {
        safeRelativePath(`guidanceScanPaths[${index}]`, relativePath);
    }
    assertStringArray("forbiddenGuidanceMarkers", contract.forbiddenGuidanceMarkers, { min: 1 });

    if (assertObject("skillsParity", contract.skillsParity)) {
        safeRelativePath("skillsParity.directory", contract.skillsParity.directory);
        safeRelativePath("skillsParity.document", contract.skillsParity.document);
        assertNonEmptyString("skillsParity.namePattern", contract.skillsParity.namePattern);
    }

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function checkEntry(entry) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }
}

// Bidirectional parity between the skills on disk and the skills the
// contract-named document claims. Existence of each SKILL.md is already
// covered by guidanceScanPaths; this catches the drift that existence
// cannot: a skill added (or renamed) on disk that the document and the
// scan list never learned about, and a documented skill name with no
// directory behind it.
function checkSkillsParity() {
    const cfg = contract.skillsParity;
    let pattern;
    try {
        pattern = new RegExp(cfg.namePattern, "g");
    } catch (error) {
        fail("skillsParity.namePattern", `invalid pattern: ${error.message}`);
        return;
    }
    const directoryAbs = path.join(root, cfg.directory);
    if (!fs.existsSync(directoryAbs)) {
        fail(cfg.directory, "missing");
        return;
    }
    const actual = fs
        .readdirSync(directoryAbs, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directoryAbs, entry.name, "SKILL.md")))
        .map((entry) => entry.name)
        .sort();
    if (actual.length === 0) {
        fail(cfg.directory, "contains no skill (no subdirectory with a SKILL.md)");
    }
    const documentText = readRelative(cfg.document);
    const documented = [...new Set([...documentText.matchAll(pattern)].map((match) => match[1] ?? match[0]))].sort();
    for (const name of actual) {
        if (!documented.includes(name)) {
            fail(cfg.document, `does not name the skill ${name} present in ${cfg.directory}`);
        }
        const skillPath = `${cfg.directory}/${name}/SKILL.md`;
        if (!contract.guidanceScanPaths.includes(skillPath)) {
            fail("guidanceScanPaths", `missing ${skillPath} for the skill ${name}`);
        }
    }
    for (const name of documented) {
        if (!actual.includes(name)) {
            fail(cfg.document, `names the skill ${name}, but ${cfg.directory}/${name}/SKILL.md does not exist`);
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("agent handoff contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const entry of contract.guidance ?? []) checkEntry(entry);
for (const entry of contract.supportingChecks ?? []) checkEntry(entry);

checkSkillsParity();

const guidanceText = contract.guidanceScanPaths.map((file) => readRelative(file)).join("\n");

for (const marker of contract.forbiddenGuidanceMarkers ?? []) {
    if (guidanceText.includes(marker)) fail("guidance", `stale marker still present: ${marker}`);
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
if (!isWiringTargetReachable(makefile, "governance-audit", contract.wiring)) {
    fail("Makefile", `governance-audit missing ${contract.wiring.makeTarget}`);
}
const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("agent handoff contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("agent handoff contract passed");
