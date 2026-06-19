#!/usr/bin/env node
// check-coverage-floor: compares each package's measured coverage-summary.json
// against the pinned floors in docs/coverage-contract.json. Floors ratchet
// monotonically upward (raise after a real improvement; never silently lower).
// This is a separate authority from Vitest's in-config thresholds so one root
// `make coverage` gate proves all three packages at once and asserts the
// ratchet direction. Run the three `npm run test:coverage` scripts first so the
// summary files exist; `make coverage` does that for you.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const METRICS = ["lines", "functions", "branches", "statements"];

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

function readJson(relPath, label) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath == null) return null;
    const abs = path.join(root, safePath);
    if (!fs.existsSync(abs)) {
        fail(label, `missing file ${relPath} (run the package test:coverage script first)`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

function readHeadContract() {
    try {
        const text = execFileSync("git", ["show", "HEAD:docs/coverage-contract.json"], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function headFloor(headContract, id, metric) {
    if (headContract == null || !Array.isArray(headContract.packages)) return null;
    const pkg = headContract.packages.find((entry) => entry?.id === id);
    const value = pkg?.floors?.[metric];
    return Number.isInteger(value) ? value : null;
}

const contract = readJson("docs/coverage-contract.json", "contract");
if (contract == null) {
    for (const failure of failures) console.error(`- ${failure}`);
    console.error("coverage floor contract could not be read");
    process.exit(1);
}

if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
if (contract.ratchet !== "monotonic-up") fail("ratchet", 'must be "monotonic-up"');
if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
    fail("purpose", "must be a non-empty string");
}

const wiring = contract.wiring ?? {};
for (const [key, expected] of [
    ["makeTarget", "coverage"],
    ["checker", "scripts/check-coverage-floor.mjs"],
    ["qualityGate", "make coverage"],
    ["inventoryId", "coverage"],
    ["auditId", "coverage"],
]) {
    if (wiring[key] !== expected) fail(`wiring.${key}`, `must be ${JSON.stringify(expected)}`);
}

if (!Array.isArray(contract.packages) || contract.packages.length !== 3) {
    fail("packages", "must be an array of exactly 3 entries (wrapper, cli, mcp)");
}

const headContract = readHeadContract();

for (const pkg of contract.packages ?? []) {
    const id = pkg?.id ?? "(unknown)";
    const summary = readJson(pkg?.summary, `${id}.summary`);
    if (summary == null) continue;
    const total = summary.total ?? {};
    for (const metric of METRICS) {
        const floor = pkg?.floors?.[metric];
        if (!Number.isInteger(floor) || floor < 0 || floor > 100) {
            fail(`${id}.floors.${metric}`, "must be an integer in [0,100]");
            continue;
        }
        const prior = headFloor(headContract, id, metric);
        if (prior != null && floor < prior) {
            fail(
                `${id}.floors.${metric}`,
                `floor ${floor}% is BELOW the committed HEAD floor ${prior}% — the ratchet is monotonic-up; raise tests instead of lowering the floor.`,
            );
        }
        const measured = total?.[metric]?.pct;
        if (typeof measured !== "number" || Number.isNaN(measured)) {
            fail(`${id}.${metric}`, `coverage summary missing total.${metric}.pct`);
            continue;
        }
        if (measured + 1e-9 < floor) {
            fail(
                `${id}.${metric}`,
                `measured ${measured.toFixed(2)}% is below pinned floor ${floor}% (delta ${(floor - measured).toFixed(2)}). Fix coverage or, only after a real improvement, raise the floor.`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("coverage floor check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`coverage floor check passed (3 packages, ${METRICS.length} metrics each).`);
