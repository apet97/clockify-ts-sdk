#!/usr/bin/env node
// Integrity anchor for the shared error-code registry. The error-docs drift
// gate catches generated-copy drift, but it trusts docs/error-codes.json. This
// gate pins that source registry's semantic shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

function readJson(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${relativePath}: missing`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    } catch (error) {
        fail(`${relativePath}: invalid JSON (${error.message})`);
        return null;
    }
}

function readText(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${relativePath}: missing`);
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function sameSet(actual, expected) {
    return (
        actual.length === expected.length &&
        actual.every((value) => expected.includes(value)) &&
        expected.every((value) => actual.includes(value))
    );
}

function validateRequiredField(entry, field) {
    if (!(field in entry)) {
        fail(`${entry.code}: missing required field "${field}"`);
        return;
    }
    const value = entry[field];
    if (field === "httpStatus" || field === "surfaces") {
        if (!Array.isArray(value)) fail(`${entry.code}: ${field} must be an array`);
        if (field === "surfaces" && Array.isArray(value) && value.length === 0) {
            fail(`${entry.code}: surfaces must be non-empty`);
        }
        return;
    }
    if (field === "retry" || field === "reachable") {
        if (typeof value !== "boolean") fail(`${entry.code}: ${field} must be boolean`);
        return;
    }
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${entry.code}: ${field} must be a non-empty string`);
    }
}

function groundedBySource(code, haystack) {
    const needles = [
        `return "${code}"`,
        `code = "${code}"`,
        `code: "${code}"`,
        `toBe("${code}")`,
        `toEqual("${code}")`,
    ];
    return needles.some((needle) => haystack.includes(needle));
}

const contract = readJson("docs/error-registry-contract.json") ?? {};
const registry = readJson(contract.registry ?? "docs/error-codes.json") ?? {};

if (contract.schemaVersion !== 1) fail("contract.schemaVersion must be 1");
if (typeof contract.purpose !== "string" || contract.purpose.trim() === "") {
    fail("contract.purpose must be non-empty");
}
if (typeof contract.registry !== "string" || contract.registry.trim() === "") {
    fail("contract.registry must be non-empty");
}

const codes = Array.isArray(registry.codes) ? registry.codes : [];
const expectedCount = contract.expectedCodeCount;
const expectedIds = Array.isArray(contract.expectedCodeIds) ? contract.expectedCodeIds : [];
const requiredFields = Array.isArray(contract.requiredFields) ? contract.requiredFields : [];
const packageCopies = Array.isArray(contract.packageCopies) ? contract.packageCopies : [];
const reachableCodes = Array.isArray(contract.reachableCodes) ? contract.reachableCodes : [];
const reachabilitySources = Array.isArray(contract.reachabilitySources)
    ? contract.reachabilitySources
    : [];

if (!Number.isInteger(expectedCount) || expectedCount < 1) {
    fail("contract.expectedCodeCount must be a positive integer");
} else if (codes.length !== expectedCount) {
    fail(`${contract.registry}: expected ${expectedCount} codes, found ${codes.length}`);
}

const ids = [];
const seen = new Set();
for (const entry of codes) {
    if (typeof entry?.code !== "string" || entry.code.trim() === "") {
        fail(`${contract.registry}: a code entry has no string code`);
        continue;
    }
    ids.push(entry.code);
    if (seen.has(entry.code)) fail(`${contract.registry}: duplicate code id "${entry.code}"`);
    seen.add(entry.code);
}

if (!sameSet(ids, expectedIds)) {
    for (const id of expectedIds) {
        if (!seen.has(id)) fail(`${contract.registry}: missing expected code id "${id}"`);
    }
    for (const id of ids) {
        if (!expectedIds.includes(id)) fail(`${contract.registry}: unexpected code id "${id}"`);
    }
}

for (const entry of codes) {
    if (typeof entry?.code !== "string" || entry.code.trim() === "") continue;
    for (const field of requiredFields) validateRequiredField(entry, field);
}

for (const relativePath of packageCopies) {
    const text = readText(relativePath);
    for (const id of expectedIds) {
        if (!text.includes(`"code": "${id}"`)) {
            fail(`${relativePath}: package copy is missing code id "${id}" (run make error-docs)`);
        }
    }
}

const registryReachableCodes = codes
    .filter((entry) => entry?.reachable !== false)
    .map((entry) => entry.code);
if (!sameSet(reachableCodes, registryReachableCodes)) {
    for (const id of registryReachableCodes) {
        if (!reachableCodes.includes(id)) fail(`contract.reachableCodes missing registry-reachable id "${id}"`);
    }
    for (const id of reachableCodes) {
        if (!registryReachableCodes.includes(id)) fail(`contract.reachableCodes has non-reachable id "${id}"`);
    }
}

const reachabilityHaystack = reachabilitySources.map(readText).join("\n");
for (const id of reachableCodes) {
    const entry = codes.find((candidate) => candidate.code === id);
    if (!entry) {
        fail(`contract.reachableCodes id "${id}" is not in ${contract.registry}`);
        continue;
    }
    if (Array.isArray(entry.httpStatus) && entry.httpStatus.length > 0) continue;
    if (!groundedBySource(id, reachabilityHaystack)) {
        fail(
            `reachable code "${id}" is not grounded by classifier/test sources: ` +
                reachabilitySources.join(", "),
        );
    }
}

if (failures.length > 0) {
    console.error("error registry integrity failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `error registry integrity passed (${codes.length} codes, ${packageCopies.length} package copies, ${reachableCodes.length} reachable codes grounded)`,
);
