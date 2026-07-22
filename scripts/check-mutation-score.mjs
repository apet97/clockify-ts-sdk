#!/usr/bin/env node
// check-mutation-score: compares Stryker's mutation report against pinned
// monotonic floors. Complements coverage floors by proving tests catch injected
// changes in the hand-written wrapper modules.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { coveredMutationScore } from "./lib/mutation-score.mjs";
import {
    validateMutationCalibration,
    validateMutationModuleFloorScope,
} from "./lib/mutation-score-contract.mjs";

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

function repoSourceExists(relPath) {
    const abs = path.resolve(root, relPath);
    if (!abs.startsWith(`${root}${path.sep}`)) return false;
    try {
        return fs.lstatSync(abs).isFile();
    } catch {
        return false;
    }
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

const CONTRACT_PATH = "docs/mutation-score-contract.json";

function sameValues(actual, expected) {
    return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
    );
}

function git(args) {
    return spawnSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function parseGitContract(revision) {
    const result = git(["show", `${revision}:${CONTRACT_PATH}`]);
    if (result.status !== 0) {
        fail(
            "ratchet.history",
            `cannot read historical contract at ${revision}: ${result.stderr.trim() || `git exited ${result.status}`}`,
        );
        return null;
    }
    try {
        return JSON.parse(result.stdout);
    } catch (error) {
        fail(
            "ratchet.history",
            `historical contract at ${revision} is invalid JSON: ${error.message}`,
        );
        return null;
    }
}

function shallowRepository() {
    const result = git(["rev-parse", "--is-shallow-repository"]);
    if (result.status !== 0) {
        fail(
            "ratchet.history",
            `cannot determine whether HEAD is shallow: ${result.stderr.trim() || `git exited ${result.status}`}`,
        );
        return null;
    }
    if (!new Set(["true", "false"]).has(result.stdout.trim())) {
        fail("ratchet.history", "git returned an invalid shallow-repository state");
        return null;
    }
    return result.stdout.trim() === "true";
}

function readRatchetHistory() {
    const shallow = shallowRepository();
    if (shallow == null) return [];
    if (shallow) {
        fail(
            "ratchet.history",
            "complete first-parent mutation-contract history is required; shallow repositories cannot prove historical maxima or governed-path retention",
        );
        return [];
    }

    const history = git([
        "log",
        "--first-parent",
        "--format=%H",
        "--reverse",
        "HEAD",
        "--",
        CONTRACT_PATH,
    ]);
    if (history.status !== 0) {
        fail(
            "ratchet.history",
            `cannot enumerate complete first-parent contract history: ${history.stderr.trim() || `git exited ${history.status}`}`,
        );
        return [];
    }

    const revisions = history.stdout.trim() === "" ? [] : history.stdout.trim().split("\n");
    const entries = [];
    for (const revision of revisions) {
        if (!/^[0-9a-f]{40}$/.test(revision)) {
            fail("ratchet.history", `git returned an invalid historical revision ${revision}`);
            continue;
        }
        const historicalContract = parseGitContract(revision);
        if (historicalContract != null) entries.push({ revision, contract: historicalContract });
    }
    return entries;
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

function assertMonotonic(label, current, prior, baselineLabel) {
    if (typeof prior === "number" && current < prior) {
        fail(
            label,
            `floor ${current}% is BELOW the ${baselineLabel} floor ${prior}% — the ratchet is monotonic-up; raise tests instead of lowering the floor.`,
        );
    }
}

function floorObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function contractFloorSnapshot(contractValue, label) {
    if (contractValue?.schemaVersion !== 1) fail(`${label}.schemaVersion`, "must be 1");
    if (contractValue?.ratchet !== "monotonic-up") {
        fail(`${label}.ratchet`, 'must be "monotonic-up"');
    }
    if (typeof contractValue?.purpose !== "string" || contractValue.purpose.trim() === "") {
        fail(`${label}.purpose`, "must be a non-empty string");
    }
    if (!Array.isArray(contractValue?.packages)) {
        fail(`${label}.packages`, "must be an array");
        return null;
    }
    if (contractValue.packages.length === 0) {
        fail(`${label}.packages`, "must contain at least one governed package");
        return null;
    }
    const historicalWiring = contractValue.wiring ?? {};
    for (const [key, expected] of [
        ["makeTarget", "mutation"],
        ["checker", "scripts/check-mutation-score.mjs"],
        ["qualityGate", "make mutation"],
        ["inventoryId", "mutation"],
        ["auditId", "mutation"],
    ]) {
        if (historicalWiring[key] !== expected) {
            fail(`${label}.wiring.${key}`, `must be ${JSON.stringify(expected)}`);
        }
    }

    const packages = new Map();
    for (const [index, pkg] of contractValue.packages.entries()) {
        const id = pkg?.id;
        if (typeof id !== "string" || id.trim() === "") {
            fail(`${label}.packages[${index}].id`, "must be a non-empty string");
            continue;
        }
        if (packages.has(id)) {
            fail(`${label}.packages[${index}].id`, `duplicate package id ${id}`);
            continue;
        }
        safeRelativePath(`${label}.${id}.report`, pkg.report);
        const globalFloor = floorValue(pkg.globalFloor, `${label}.${id}.globalFloor`);
        if (!floorObject(pkg.moduleFloors)) {
            fail(`${label}.${id}.moduleFloors`, "must be an object");
            continue;
        }
        if (Object.keys(pkg.moduleFloors).length === 0) {
            fail(`${label}.${id}.moduleFloors`, "must contain at least one governed floor");
            continue;
        }
        const moduleFloors = new Map();
        for (const [filePath, rawFloor] of Object.entries(pkg.moduleFloors)) {
            const safePath = safeRelativePath(`${label}.${id}.moduleFloors.${filePath}`, filePath);
            const moduleFloor = floorValue(rawFloor, `${label}.${id}.moduleFloors.${filePath}`);
            if (safePath != null && moduleFloor != null) moduleFloors.set(filePath, moduleFloor);
        }
        if (globalFloor != null) packages.set(id, { globalFloor, moduleFloors });
    }
    return packages;
}

const LEGACY_MODULE_REPLACEMENT = Object.freeze({
    revision: "0392e6943f9277dc91179328e61dd01d7c3c8d9e",
    packageId: "mcp",
    removedPath: "mcp/src/orchestration/confirm-guard.ts",
    replacementPath: "mcp/src/tool-risk.ts",
    floor: 70,
});

function isLegacyModuleReplacement({ revision, packageId, filePath, priorFloor, current }) {
    const replacement = LEGACY_MODULE_REPLACEMENT;
    return (
        revision === replacement.revision &&
        packageId === replacement.packageId &&
        filePath === replacement.removedPath &&
        priorFloor === replacement.floor &&
        current?.moduleFloors.get(replacement.replacementPath) === replacement.floor
    );
}

function assertCompleteHistoryRatchet(history, worktreeContract) {
    const maxima = new Map();
    const retiredModules = new Map();

    const applySnapshot = (contractValue, label, revision = null) => {
        const current = contractFloorSnapshot(contractValue, label);
        if (current == null) return;

        for (const [packageId, prior] of maxima) {
            const next = current.get(packageId);
            if (next == null) {
                fail(
                    `packages.${packageId}`,
                    `${label} is missing a historically governed package`,
                );
                continue;
            }
            assertMonotonic(
                `${packageId}.globalFloor`,
                next.globalFloor,
                prior.globalFloor,
                `historical maximum`,
            );
            for (const [filePath, priorFloor] of prior.moduleFloors) {
                if (!next.moduleFloors.has(filePath)) {
                    if (
                        revision != null &&
                        isLegacyModuleReplacement({
                            revision,
                            packageId,
                            filePath,
                            priorFloor,
                            current: next,
                        })
                    ) {
                        retiredModules.set(
                            `${packageId}:${filePath}`,
                            LEGACY_MODULE_REPLACEMENT.revision,
                        );
                        prior.moduleFloors.delete(filePath);
                        continue;
                    }
                    fail(
                        `${packageId}.moduleFloors.${filePath}`,
                        `${label} is missing a historically governed floor (${priorFloor}% historical maximum)`,
                    );
                    continue;
                }
                assertMonotonic(
                    `${packageId}.moduleFloors.${filePath}`,
                    next.moduleFloors.get(filePath),
                    priorFloor,
                    "historical maximum",
                );
            }
        }

        for (const [packageId, next] of current) {
            const prior = maxima.get(packageId);
            if (prior == null) {
                maxima.set(packageId, {
                    globalFloor: next.globalFloor,
                    moduleFloors: new Map(next.moduleFloors),
                });
                continue;
            }
            prior.globalFloor = Math.max(prior.globalFloor, next.globalFloor);
            for (const [filePath, moduleFloor] of next.moduleFloors) {
                const retiredAt = retiredModules.get(`${packageId}:${filePath}`);
                if (retiredAt != null) {
                    fail(
                        `${packageId}.moduleFloors.${filePath}`,
                        `${label} reintroduces a floor retired by the immutable historical replacement at ${retiredAt}`,
                    );
                    continue;
                }
                prior.moduleFloors.set(
                    filePath,
                    Math.max(prior.moduleFloors.get(filePath) ?? 0, moduleFloor),
                );
            }
        }
    };

    for (const { revision, contract: historicalContract } of history) {
        applySnapshot(historicalContract, `ratchet.history.${revision}`, revision);
    }
    const lastHistoricalContract = history.at(-1)?.contract;
    if (JSON.stringify(lastHistoricalContract) !== JSON.stringify(worktreeContract)) {
        applySnapshot(worktreeContract, "contract");
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

if (!Array.isArray(contract.packages)) {
    fail("packages", "must be an ordered array containing wrapper, mcp, cli");
} else if (
    !sameValues(
        contract.packages.map((pkg) => pkg?.id),
        ["wrapper", "mcp", "cli"],
    )
) {
    fail("packages", "must contain exactly the ordered package ids wrapper, mcp, cli");
}

const packages = Array.isArray(contract.packages) ? contract.packages : [];
const ratchetHistory = readRatchetHistory();
assertCompleteHistoryRatchet(ratchetHistory, contract);
const knownPackageIds = new Set(
    packages.map((pkg) => pkg?.id).filter((id) => typeof id === "string"),
);
for (const id of requestedPackageIds) {
    if (!knownPackageIds.has(id)) fail("argv.--package", `unknown package id ${id}`);
}

const packagesToCheck =
    requestedPackageIds.size === 0
        ? packages
        : packages.filter((pkg) => requestedPackageIds.has(pkg?.id));

for (const pkg of packagesToCheck) {
    const id = pkg?.id ?? "(unknown)";
    const globalFloor = floorValue(pkg?.globalFloor, `${id}.globalFloor`);
    for (const failure of validateMutationCalibration({
        packageId: id,
        globalFloor,
        globalCalibrationPending: pkg?.globalCalibrationPending,
        moduleFloors: pkg?.moduleFloors,
        calibrationPending: pkg?.calibrationPending,
    })) {
        fail("calibration", failure);
    }
    const stryker = readJson(`${id}/stryker.conf.json`, `${id}.stryker`);
    if (stryker != null) {
        for (const failure of validateMutationModuleFloorScope({
            packageId: id,
            moduleFloors: pkg?.moduleFloors,
            mutate: stryker.mutate,
            calibrationPending: pkg?.calibrationPending,
            sourceExists: repoSourceExists,
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

    const allMutants = [];
    for (const file of Object.values(report.files)) {
        if (Array.isArray(file?.mutants)) allMutants.push(...file.mutants);
    }

    if (globalFloor != null) {
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
console.log(
    `mutation score check passed (${checked} Stryker reports, covered-mutant floors; ratchet history: ${ratchetHistory.length} complete first-parent contract revision${ratchetHistory.length === 1 ? "" : "s"}).`,
);
