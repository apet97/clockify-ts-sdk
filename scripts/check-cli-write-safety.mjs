#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = await readJson("docs/cli-write-safety-contract.json");

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function safeRelativePath(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(value);
    if (path.isAbsolute(value) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

async function readRel(relPath) {
    const safePath = safeRelativePath(relPath, relPath);
    if (safePath == null) return "";
    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(safePath, "missing file");
        return "";
    }
}

async function readJson(relPath) {
    const text = await readRel(relPath);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(relPath, `invalid JSON: ${error.message}`);
        return {};
    }
}

function stringArray(label, value, { nonEmpty = true } = {}) {
    if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
        fail(label, `must be ${nonEmpty ? "a non-empty" : "an"} array`);
        return [];
    }
    const valid = value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
    if (valid.length !== value.length) fail(label, "contains a non-string or empty entry");
    if (new Set(valid).size !== valid.length) fail(label, "contains duplicate entries");
    return valid;
}

function objectValue(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return {};
    }
    return value;
}

function positiveInteger(label, value) {
    if (!Number.isInteger(value) || value <= 0) fail(label, "must be a positive integer");
}

function sorted(values) {
    return [...values].sort((a, b) => a.localeCompare(b));
}

if (contract.schemaVersion !== 2) fail("schemaVersion", "must be 2");
if (typeof contract.purpose !== "string" || contract.purpose.trim() === "") {
    fail("purpose", "must be a non-empty string");
}

const expected = objectValue("expected", contract.expected);
positiveInteger("expected.totalLeaves", expected.totalLeaves);
positiveInteger("expected.mutatingLeaves", expected.mutatingLeaves);
const expectedCounts = objectValue("expected.riskCounts", expected.riskCounts);
for (const risk of ["read", "write", "destructive"]) {
    positiveInteger(`expected.riskCounts.${risk}`, expectedCounts[risk]);
}

const riskPaths = objectValue("riskPaths", contract.riskPaths);
const expectedByPath = new Map();
for (const risk of ["read", "write", "destructive"]) {
    for (const commandPath of stringArray(`riskPaths.${risk}`, riskPaths[risk])) {
        if (expectedByPath.has(commandPath)) {
            fail("riskPaths", `${commandPath} appears in more than one risk class`);
        }
        expectedByPath.set(commandPath, risk);
    }
}

const behavioralTests = stringArray("behavioralTests", contract.behavioralTests);
for (const testPath of behavioralTests) await readRel(testPath);
const requiredDocs = stringArray("requiredDocs", contract.requiredDocs);
for (const docPath of requiredDocs) await readRel(docPath);

const wiring = objectValue("wiring", contract.wiring);
for (const field of [
    "makeTarget",
    "checker",
    "docsIndexPolicy",
    "docsIndexContract",
    "qualityGate",
    "inventoryId",
    "auditId",
]) {
    if (typeof wiring[field] !== "string" || wiring[field].trim() === "") {
        fail(`wiring.${field}`, "must be a non-empty string");
    }
}

if (expectedByPath.size !== expected.totalLeaves) {
    fail("riskPaths", `contains ${expectedByPath.size} leaves, expected ${expected.totalLeaves}`);
}
for (const risk of ["read", "write", "destructive"]) {
    const actual = [...expectedByPath.values()].filter((value) => value === risk).length;
    if (actual !== expectedCounts[risk]) {
        fail(`riskPaths.${risk}`, `contains ${actual} leaves, expected ${expectedCounts[risk]}`);
    }
}
if ((expectedCounts.write ?? 0) + (expectedCounts.destructive ?? 0) !== expected.mutatingLeaves) {
    fail("expected.mutatingLeaves", "must equal write + destructive risk counts");
}

if (failures.length === 0) {
    const source = [
        'import { buildProgram } from "./cli/src/index.ts";',
        'import { collectClassifiedLeaves } from "./cli/src/commands/leaf-command.ts";',
        "const leaves = collectClassifiedLeaves(buildProgram());",
        'console.log(JSON.stringify(leaves.map(({ path, risk }) => ({ path: path.join(" "), risk }))));',
    ].join("\n");
    const inspected = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "--eval", source],
        { cwd: root, encoding: "utf8", env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" } },
    );
    if (inspected.status !== 0) {
        fail("Commander introspection", inspected.stderr.trim() || `exited ${inspected.status}`);
    } else {
        try {
            const actualLeaves = JSON.parse(inspected.stdout);
            const actualByPath = new Map(actualLeaves.map((leaf) => [leaf.path, leaf.risk]));
            if (actualByPath.size !== actualLeaves.length) {
                fail("Commander introspection", "returned duplicate leaf paths");
            }
            const actualPairs = sorted([...actualByPath].map(([commandPath, risk]) => `${risk}\t${commandPath}`));
            const expectedPairs = sorted([...expectedByPath].map(([commandPath, risk]) => `${risk}\t${commandPath}`));
            if (JSON.stringify(actualPairs) !== JSON.stringify(expectedPairs)) {
                fail(
                    "Commander introspection",
                    `risk manifest drift\n  expected: ${expectedPairs.join(", ")}\n  actual: ${actualPairs.join(", ")}`,
                );
            }
        } catch (error) {
            fail("Commander introspection", `invalid JSON: ${error.message}`);
        }
    }
}

if (failures.length === 0) {
    const behavioral = spawnSync(
        process.execPath,
        ["node_modules/vitest/vitest.mjs", "run", ...behavioralTests],
        {
            cwd: root,
            encoding: "utf8",
            env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
        },
    );
    if (behavioral.status !== 0) {
        fail(
            "behavioral proof",
            `${behavioral.stdout.trim()}\n${behavioral.stderr.trim()}`.trim() ||
                `exited ${behavioral.status}`,
        );
    }
}

const makefile = await readRel("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
if (!makefile.includes(`node ${wiring.checker}`)) {
    fail("Makefile", `${wiring.makeTarget} target does not run ${wiring.checker}`);
}
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}

const qualityGates = await readRel("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);
const docsIndex = await readRel("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexPolicy}`)) fail("docs/README.md", "missing policy link");
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) fail("docs/README.md", "missing contract link");
const contractInventory = await readRel("docs/contract-inventory.json");
if (!contractInventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");
if (!enterpriseAudit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("CLI write-safety contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `CLI write-safety contract passed (${expected.totalLeaves} classified leaves; ${expected.mutatingLeaves} mutation handlers behaviorally proved).`,
);
