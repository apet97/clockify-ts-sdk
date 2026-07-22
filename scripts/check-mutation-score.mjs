#!/usr/bin/env node
// check-mutation-score: compares Stryker's mutation report against pinned
// monotonic floors. Complements coverage floors by proving tests catch injected
// changes in the hand-written wrapper modules.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { coveredMutationScore } from "./lib/mutation-score.mjs";
import { validateMutationModuleFloorScope } from "./lib/mutation-score-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const requestedPackageIds = new Set();

for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === "--package") {
        const value = process.argv[index + 1];
        if (typeof value !== "string" || value.trim() === "") {
            fail("argv.--package", "must be followed by a package id");
        } else {
            requestedPackageIds.add(value);
        }
        index += 1;
    } else if (arg.startsWith("--package=")) {
        const value = arg.slice("--package=".length);
        if (value.trim() === "") {
            fail("argv.--package", "must not be empty");
        } else {
            requestedPackageIds.add(value);
        }
    } else {
        fail("argv", `unknown argument ${arg}`);
    }
}

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
        fail(label, `missing file ${relPath}`);
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
        const text = execFileSync("git", ["show", "HEAD:docs/mutation-score-contract.json"], {
            cwd: root,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function floorValue(value, label) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
        fail(label, "must be an integer in [0,100]");
        return null;
    }
    return value;
}

function score(label, mutants) {
    try {
        return coveredMutationScore(mutants);
    } catch (error) {
        fail(label, error instanceof Error ? error.message : String(error));
        return null;
    }
}

function headPackage(headContract, id) {
    if (headContract == null || !Array.isArray(headContract.packages)) return null;
    return headContract.packages.find((entry) => entry?.id === id) ?? null;
}

function assertMonotonic(label, current, prior) {
    if (typeof prior === "number" && current < prior) {
        fail(
            label,
            `floor ${current}% is BELOW the committed HEAD floor ${prior}% — the ratchet is monotonic-up; raise tests instead of lowering the floor.`,
        );
    }
}

function assertMeasured(label, measured, floor) {
    if (measured == null) return;
    if (measured + 1e-9 < floor) {
        fail(
            label,
            `measured ${measured.toFixed(2)}% is below pinned floor ${floor}% (delta ${(floor - measured).toFixed(2)}). Kill mutants or, only after a real improvement, raise the floor.`,
        );
    }
}

const contract = readJson("docs/mutation-score-contract.json", "contract");
if (contract == null) {
    for (const failure of failures) console.error(`- ${failure}`);
    console.error("mutation score contract could not be read");
    process.exit(1);
}

if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
if (contract.ratchet !== "monotonic-up") fail("ratchet", 'must be "monotonic-up"');
if (typeof contract.purpose !== "string" || contract.purpose.trim().length === 0) {
    fail("purpose", "must be a non-empty string");
}

const wiring = contract.wiring ?? {};
for (const [key, expected] of [
    ["makeTarget", "mutation"],
    ["checker", "scripts/check-mutation-score.mjs"],
    ["qualityGate", "make mutation"],
    ["inventoryId", "mutation"],
    ["auditId", "mutation"],
]) {
    if (wiring[key] !== expected) fail(`wiring.${key}`, `must be ${JSON.stringify(expected)}`);
}

if (!Array.isArray(contract.packages) || contract.packages.length !== 2) {
    fail("packages", "must be an array of exactly 2 entries (wrapper + mcp)");
}

const headContract = readHeadContract();
const packages = Array.isArray(contract.packages) ? contract.packages : [];
const knownPackageIds = new Set(packages.map((pkg) => pkg?.id).filter((id) => typeof id === "string"));
for (const id of requestedPackageIds) {
    if (!knownPackageIds.has(id)) fail("argv.--package", `unknown package id ${id}`);
}

const packagesToCheck =
    requestedPackageIds.size === 0 ? packages : packages.filter((pkg) => requestedPackageIds.has(pkg?.id));

for (const pkg of packagesToCheck) {
    const id = pkg?.id ?? "(unknown)";
    const stryker = readJson(`${id}/stryker.conf.json`, `${id}.stryker`);
    if (stryker != null) {
        for (const failure of validateMutationModuleFloorScope({
            packageId: id,
            moduleFloors: pkg?.moduleFloors,
            mutate: stryker.mutate,
        })) {
            fail("scope", failure);
        }
    }
    const report = readJson(pkg?.report, `${id}.report`);
    if (report == null) continue;
    if (typeof report.schemaVersion !== "string" || report.schemaVersion.length === 0) {
        fail(`${id}.report.schemaVersion`, "must be a non-empty Stryker schema version string");
    }
    if (report.files == null || typeof report.files !== "object") {
        fail(`${id}.report.files`, "must be an object");
        continue;
    }

    const prior = headPackage(headContract, id);
    const allMutants = [];
    for (const file of Object.values(report.files)) {
        if (Array.isArray(file?.mutants)) allMutants.push(...file.mutants);
    }

    const globalFloor = floorValue(pkg?.globalFloor, `${id}.globalFloor`);
    if (globalFloor != null) {
        assertMonotonic(`${id}.globalFloor`, globalFloor, prior?.globalFloor);
        assertMeasured(`${id}.globalFloor`, score(`${id}.globalFloor`, allMutants), globalFloor);
    }

    if (pkg?.moduleFloors == null || typeof pkg.moduleFloors !== "object") {
        fail(`${id}.moduleFloors`, "must be an object");
        continue;
    }

    for (const [filePath, rawFloor] of Object.entries(pkg.moduleFloors)) {
        const floor = floorValue(rawFloor, `${id}.moduleFloors.${filePath}`);
        const safePath = safeRelativePath(`${id}.moduleFloors.${filePath}`, filePath);
        if (floor == null || safePath == null) continue;
        const file = report.files[safePath];
        if (!file || !Array.isArray(file.mutants)) {
            fail(`${id}.moduleFloors.${filePath}`, `missing report file ${filePath}`);
            continue;
        }
        assertMonotonic(
            `${id}.moduleFloors.${filePath}`,
            floor,
            prior?.moduleFloors?.[filePath],
        );
        const label = `${id}.moduleFloors.${filePath}`;
        assertMeasured(label, score(label, file.mutants), floor);
    }
}

if (failures.length > 0) {
    console.error("mutation score check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const checked = packagesToCheck.map((pkg) => pkg.id).join(" + ");
console.log(`mutation score check passed (${checked} Stryker reports, covered-mutant floors).`);
