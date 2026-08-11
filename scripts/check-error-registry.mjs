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

function isPlainRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
    // Whitespace-tolerant: Prettier wraps a long `expect(...).toBe(` call
    // onto its own line, putting the string literal on the NEXT line
    // (`.toBe(\n    "code",\n)`). A plain substring needle misses that
    // shape entirely -- found while wiring V1's per-code test references,
    // where wrapper/tests/error-code-wiring.test.ts's own assertions for
    // "invalid_request" and "auth_or_permission" are formatted exactly
    // this way and were false-negatives under the old substring check.
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const needles = [
        String.raw`return\s*"${escaped}"`,
        String.raw`code\s*=\s*"${escaped}"`,
        String.raw`code:\s*"${escaped}"`,
        String.raw`toBe\(\s*"${escaped}"`,
        String.raw`toEqual\(\s*"${escaped}"`,
    ];
    return needles.some((needle) => new RegExp(needle).test(haystack));
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
    // A non-empty httpStatus array skips this whole-haystack pass: several
    // codes (e.g. "conflict") are only provoked in mcp/tests/*.test.ts files
    // outside reachabilitySources' 5-file list, so this check alone cannot
    // ground them. The testReferences block below is the real, per-code,
    // file-scoped closer for every reachable code -- it does not carry this
    // skip, so a code cannot pass V1's traceability requirement by declaring
    // an httpStatus array alone.
    if (Array.isArray(entry.httpStatus) && entry.httpStatus.length > 0) continue;
    if (!groundedBySource(id, reachabilityHaystack)) {
        fail(
            `reachable code "${id}" is not grounded by classifier/test sources: ` +
                reachabilitySources.join(", "),
        );
    }
}

// Per-code test-reference mapping (V1). The whole-haystack check above skips
// verification entirely for any code with a non-empty httpStatus array,
// which made roughly half of "reachable codes grounded" a self-declared
// JSON fact rather than a verified one (found while sizing V1: "conflict"'s
// only provoking test lives in mcp/tests/tasks-tool.test.ts, outside
// reachabilitySources). This section requires, for EVERY reachable code
// regardless of httpStatus, a file + code-literal marker naming the
// specific test that provokes it -- semantic proof lives in the referenced
// test file's own content (re-checked here via groundedBySource), never in
// the marker text itself, so a renamed test title cannot silently rot the
// reference.
const testReferences = contract.testReferences && typeof contract.testReferences === "object"
    ? contract.testReferences
    : {};
for (const id of reachableCodes) {
    const refs = testReferences[id];
    if (!Array.isArray(refs) || refs.length === 0) {
        fail(`reachable code "${id}" has no contract.testReferences entry`);
        continue;
    }
    for (const ref of refs) {
        if (!isPlainRecord(ref) || typeof ref.file !== "string" || ref.file.trim() === "") {
            fail(`contract.testReferences.${id}: each entry needs a non-empty "file"`);
            continue;
        }
        if (ref.codeLiteral !== id) {
            fail(`contract.testReferences.${id}: codeLiteral must equal "${id}" (found ${JSON.stringify(ref.codeLiteral)})`);
        }
        if (!fs.existsSync(path.join(root, ref.file))) {
            fail(`contract.testReferences.${id}: file "${ref.file}" does not exist`);
            continue;
        }
        if (!groundedBySource(id, readText(ref.file))) {
            fail(
                `contract.testReferences.${id}: "${ref.file}" does not contain a grounding assertion ` +
                    `for "${id}" (a test-title mention is not sufficient -- the file must contain the ` +
                    `actual code-literal assertion)`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("error registry integrity failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `error registry integrity passed (${codes.length} codes, ${packageCopies.length} package copies, ` +
        `${reachableCodes.length} reachable codes grounded, ${reachableCodes.length} with per-code test references)`,
);
