#!/usr/bin/env node
// check-mutation-score: compares Stryker's mutation report against pinned
// monotonic floors. Complements coverage floors by proving tests catch injected
// changes in the hand-written wrapper modules.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
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

function git(args) {
    return spawnSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function parseGitContract(revision, label) {
    const result = git(["show", `${revision}:${CONTRACT_PATH}`]);
    if (result.status !== 0) {
        fail(
            "ratchet.baseline",
            `cannot read ${label} contract: ${result.stderr.trim() || `git exited ${result.status}`}`,
        );
        return null;
    }
    try {
        return JSON.parse(result.stdout);
    } catch (error) {
        fail("ratchet.baseline", `${label} contract is invalid JSON: ${error.message}`);
        return null;
    }
}

function sameContract(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function shallowRepository() {
    const result = git(["rev-parse", "--is-shallow-repository"]);
    if (result.status !== 0) {
        fail(
            "ratchet.baseline",
            `cannot determine whether HEAD is shallow: ${result.stderr.trim() || `git exited ${result.status}`}`,
        );
        return null;
    }
    if (!new Set(["true", "false"]).has(result.stdout.trim())) {
        fail("ratchet.baseline", "git returned an invalid shallow-repository state");
        return null;
    }
    return result.stdout.trim() === "true";
}

function readRatchetBaseline(worktreeContract) {
    const headContract = parseGitContract("HEAD", "committed HEAD");
    if (headContract == null) return { contract: null, label: "unavailable" };

    if (!sameContract(worktreeContract, headContract)) {
        return { contract: headContract, label: "committed HEAD" };
    }

    const parent = git(["rev-parse", "--verify", "HEAD^1"]);
    if (parent.status === 0) {
        const parentRevision = parent.stdout.trim();
        if (!/^[0-9a-f]{40}$/.test(parentRevision)) {
            fail("ratchet.baseline", "git returned an invalid first-parent revision");
            return { contract: null, label: "unavailable" };
        }
        const parentContract = git(["cat-file", "-e", `${parentRevision}:${CONTRACT_PATH}`]);
        if (parentContract.status === 0) {
            return {
                contract: parseGitContract(parentRevision, "first-parent"),
                label: "first-parent",
            };
        }
        if (!/does not exist in|exists on disk, but not in/i.test(parentContract.stderr)) {
            fail(
                "ratchet.baseline",
                `cannot inspect first-parent contract: ${parentContract.stderr.trim() || `git exited ${parentContract.status}`}`,
            );
            return { contract: null, label: "unavailable" };
        }
        const shallow = shallowRepository();
        if (shallow == null) return { contract: null, label: "unavailable" };
        if (shallow) {
            fail(
                "ratchet.baseline",
                "shallow checkout is missing the first-parent contract; full first-parent history is required before contract-introduction bootstrap",
            );
            return { contract: null, label: "unavailable" };
        }

        const earlierContractHistory = git([
            "log",
            "--first-parent",
            "--format=%H",
            parentRevision,
            "--",
            CONTRACT_PATH,
        ]);
        if (earlierContractHistory.status !== 0) {
            fail(
                "ratchet.baseline",
                `cannot verify contract-introduction history: ${earlierContractHistory.stderr.trim() || `git exited ${earlierContractHistory.status}`}`,
            );
            return { contract: null, label: "unavailable" };
        }
        if (earlierContractHistory.stdout.trim() !== "") {
            fail(
                "ratchet.baseline",
                `first parent ${parentRevision} is missing ${CONTRACT_PATH}, but earlier first-parent history contains it`,
            );
            return { contract: null, label: "unavailable" };
        }
        return { contract: null, label: "contract-introduction bootstrap" };
    }

    const shallow = shallowRepository();
    if (shallow == null) return { contract: null, label: "unavailable" };
    if (shallow) {
        fail(
            "ratchet.baseline",
            "shallow checkout does not expose HEAD's first parent; fetch at least two commit generations",
        );
        return { contract: null, label: "unavailable" };
    }

    const parents = git(["rev-list", "--parents", "-n", "1", "HEAD"]);
    if (parents.status !== 0) {
        fail(
            "ratchet.baseline",
            `cannot inspect HEAD parents: ${parents.stderr.trim() || `git exited ${parents.status}`}`,
        );
        return { contract: null, label: "unavailable" };
    }
    const parentTokens = parents.stdout.trim().split(/\s+/);
    if (parentTokens.length !== 1 || !/^[0-9a-f]{40}$/.test(parentTokens[0])) {
        fail("ratchet.baseline", "cannot resolve HEAD's first parent in a non-shallow checkout");
        return { contract: null, label: "unavailable" };
    }
    return { contract: null, label: "root-commit bootstrap" };
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

function assertBaselineRetention(currentPackages, baselineContract, baselineLabel) {
    const currentById = new Map();
    for (const [index, pkg] of currentPackages.entries()) {
        const id = pkg?.id;
        if (typeof id !== "string" || id.trim() === "") {
            fail(`packages[${index}].id`, "must be a non-empty string");
            continue;
        }
        if (currentById.has(id)) {
            fail(`packages[${index}].id`, `duplicate package id ${id}`);
            continue;
        }
        currentById.set(id, pkg);
    }

    if (baselineContract == null) return;
    if (!Array.isArray(baselineContract.packages)) {
        fail("ratchet.baseline.packages", "must be an array");
        return;
    }
    if (baselineContract.packages.length === 0) {
        fail("ratchet.baseline.packages", "must contain at least one governed package");
        return;
    }

    const baselineIds = new Set();
    for (const [index, prior] of baselineContract.packages.entries()) {
        const id = prior?.id;
        if (typeof id !== "string" || id.trim() === "") {
            fail(`ratchet.baseline.packages[${index}].id`, "must be a non-empty string");
            continue;
        }
        if (baselineIds.has(id)) {
            fail(`ratchet.baseline.packages[${index}].id`, `duplicate package id ${id}`);
            continue;
        }
        baselineIds.add(id);

        const current = currentById.get(id);
        if (current == null) {
            fail(
                `packages.${id}`,
                `${baselineLabel} governed package is missing from the current contract`,
            );
            continue;
        }

        const priorGlobalFloor = floorValue(
            prior.globalFloor,
            `ratchet.baseline.${id}.globalFloor`,
        );
        const currentGlobalFloor = floorValue(current.globalFloor, `${id}.globalFloor`);
        if (priorGlobalFloor != null && currentGlobalFloor != null) {
            assertMonotonic(
                `${id}.globalFloor`,
                currentGlobalFloor,
                priorGlobalFloor,
                baselineLabel,
            );
        }

        if (!floorObject(prior.moduleFloors)) {
            fail(`ratchet.baseline.${id}.moduleFloors`, "must be an object");
            continue;
        }
        if (Object.keys(prior.moduleFloors).length === 0) {
            fail(`ratchet.baseline.${id}.moduleFloors`, "must contain at least one governed floor");
            continue;
        }
        if (!floorObject(current.moduleFloors)) {
            fail(`${id}.moduleFloors`, "must be an object");
            continue;
        }

        for (const [filePath, rawPriorFloor] of Object.entries(prior.moduleFloors)) {
            const safePriorPath = safeRelativePath(
                `ratchet.baseline.${id}.moduleFloors.${filePath}`,
                filePath,
            );
            const priorFloor = floorValue(
                rawPriorFloor,
                `ratchet.baseline.${id}.moduleFloors.${filePath}`,
            );
            if (safePriorPath == null) continue;
            if (!Object.hasOwn(current.moduleFloors, filePath)) {
                fail(
                    `${id}.moduleFloors.${filePath}`,
                    `${baselineLabel} governed floor is missing from the current contract`,
                );
                continue;
            }
            const currentFloor = floorValue(
                current.moduleFloors[filePath],
                `${id}.moduleFloors.${filePath}`,
            );
            if (priorFloor != null && currentFloor != null) {
                assertMonotonic(
                    `${id}.moduleFloors.${filePath}`,
                    currentFloor,
                    priorFloor,
                    baselineLabel,
                );
            }
        }
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
    fail("packages", "must be an array containing wrapper and mcp");
} else {
    for (const requiredId of ["wrapper", "mcp"]) {
        const count = contract.packages.filter((pkg) => pkg?.id === requiredId).length;
        if (count !== 1) {
            fail("packages", `must contain exactly one ${requiredId} entry`);
        }
    }
}

const ratchetBaseline = readRatchetBaseline(contract);
const packages = Array.isArray(contract.packages) ? contract.packages : [];
assertBaselineRetention(packages, ratchetBaseline.contract, ratchetBaseline.label);
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

    const globalFloor = floorValue(pkg?.globalFloor, `${id}.globalFloor`);
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
    `mutation score check passed (${checked} Stryker reports, covered-mutant floors; ratchet baseline: ${ratchetBaseline.label}).`,
);
