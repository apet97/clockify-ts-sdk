import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
    CONTRACT_PATH,
    resolveBuildDeterminismConfig,
    validateBuildDeterminismContract,
} from "./lib/build-determinism-contract.mjs";
import { makeStepGroupsForPhase } from "./lib/verify-plan.mjs";

// docs/build-determinism-contract.json was read by no script at all until
// 2026-07-28 — check-build-determinism.mjs hardcoded the package and dist path
// it claimed to govern. These tests keep the contract load-bearing: the checker
// takes its two real inputs from it, and its declared wiring must match where
// the verify plan actually schedules the gate.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const realContract = JSON.parse(readFileSync(path.join(root, CONTRACT_PATH), "utf8"));

const realArgs = () => ({
    contract: structuredClone(realContract),
    makefile: readFileSync(path.join(root, "Makefile"), "utf8"),
    fastTargets: makeStepGroupsForPhase("fast"),
    fullTargets: makeStepGroupsForPhase("full"),
    fileExists: (relative) => existsSync(path.join(root, relative)),
});

test("the checked-in contract is wired exactly as it declares", () => {
    assert.deepEqual(validateBuildDeterminismContract(realArgs()), []);
});

test("the checker's build inputs come from the contract", () => {
    const config = resolveBuildDeterminismConfig(realContract);
    assert.equal(config.packageName, realContract.scope.package);
    assert.equal(config.artifactTree, realContract.scope.artifactTree);
});

test("a contract missing its scope is unusable", () => {
    const broken = structuredClone(realContract);
    delete broken.scope.artifactTree;
    assert.throws(() => resolveBuildDeterminismConfig(broken), /artifactTree/);
});

test("an escaping artifactTree is rejected", () => {
    const broken = structuredClone(realContract);
    broken.scope.artifactTree = "../outside/dist";
    assert.throws(() => resolveBuildDeterminismConfig(broken), /without \.\./);
});

test("an empty requiredBehavior is rejected", () => {
    const args = realArgs();
    args.contract.requiredBehavior = [];
    assert.match(validateBuildDeterminismContract(args).join("\n"), /requiredBehavior/);
});

test("a make target that does not run the checker fails", () => {
    const args = realArgs();
    // Drop only the checker invocation; the sibling `node --test ...test.mjs`
    // line stays, so this proves the recipe is matched on the checker itself.
    args.makefile = args.makefile.replaceAll("node scripts/check-build-determinism.mjs", "@true");
    assert.match(
        validateBuildDeterminismContract(args).join("\n"),
        /must run scripts\/check-build-determinism\.mjs/,
    );
});

test("a missing checker file fails", () => {
    const args = realArgs();
    args.fileExists = () => false;
    assert.match(validateBuildDeterminismContract(args).join("\n"), /does not exist/);
});

test("declaring fullGateOnly while the fast phase schedules the gate fails", () => {
    const args = realArgs();
    args.fastTargets = [...args.fastTargets, ["build-determinism"]];
    assert.match(
        validateBuildDeterminismContract(args).join("\n"),
        /declared fullGateOnly but the fast phase/,
    );
});

test("dropping the gate from the full phase fails", () => {
    const args = realArgs();
    args.fullTargets = args.fullTargets.filter((group) => !group.includes("build-determinism"));
    assert.match(
        validateBuildDeterminismContract(args).join("\n"),
        /must be scheduled in the full verify phase/,
    );
});

test("clearing fullGateOnly while the fast phase omits the gate fails", () => {
    const args = realArgs();
    args.contract.wiring.fullGateOnly = false;
    assert.match(
        validateBuildDeterminismContract(args).join("\n"),
        /not fullGateOnly but the fast phase omits it/,
    );
});
