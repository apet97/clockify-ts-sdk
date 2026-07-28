#!/usr/bin/env node
// Build the wrapper twice and fail if dist bytes differ. This catches
// nondeterministic emit before it reaches npm pack snapshots or consumer smoke.
//
// The workspace to build and the tree to hash come from
// docs/build-determinism-contract.json, so that contract is load-bearing rather
// than decorative; see scripts/lib/build-determinism-contract.mjs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    CONTRACT_PATH,
    resolveBuildDeterminismConfig,
    validateBuildDeterminismContract,
} from "./lib/build-determinism-contract.mjs";
import { makeStepGroupsForPhase } from "./lib/verify-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(path.join(root, CONTRACT_PATH), "utf8"));

// Validate the wiring before spending two full builds on it.
const wiringFailures = validateBuildDeterminismContract({
    contract,
    makefile: readFileSync(path.join(root, "Makefile"), "utf8"),
    fastTargets: makeStepGroupsForPhase("fast"),
    fullTargets: makeStepGroupsForPhase("full"),
    fileExists: (relative) => existsSync(path.join(root, relative)),
});
if (wiringFailures.length > 0) {
    console.error(`build-determinism: ${CONTRACT_PATH} is not wired as declared`);
    for (const failure of wiringFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const { packageName, artifactTree } = resolveBuildDeterminismConfig(contract);
const dist = path.join(root, artifactTree);

async function listFiles(dir) {
    const files = [];
    async function walk(current) {
        for (const entry of (await readdir(current)).sort()) {
            const absolute = path.join(current, entry);
            const info = await stat(absolute);
            if (info.isDirectory()) await walk(absolute);
            else if (info.isFile()) files.push(path.relative(dir, absolute).replace(/\\/g, "/"));
        }
    }
    await walk(dir);
    return files.sort();
}

async function hashTree(dir) {
    const hash = createHash("sha256");
    for (const file of await listFiles(dir)) {
        hash.update(file);
        hash.update("\0");
        hash.update(await readFile(path.join(dir, file)));
        hash.update("\0");
    }
    return hash.digest("hex");
}

function buildWrapper() {
    execFileSync("npm", ["run", "build", "-w", packageName], {
        cwd: root,
        env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
        stdio: ["ignore", "ignore", "inherit"],
    });
}

buildWrapper();
const firstHash = await hashTree(dist);
const firstCount = (await listFiles(dist)).length;

buildWrapper();
const secondHash = await hashTree(dist);
const secondCount = (await listFiles(dist)).length;

if (firstHash !== secondHash || firstCount !== secondCount) {
    console.error(
        `build-determinism: two ${packageName} builds produced different ${artifactTree} output.`,
    );
    console.error(`  build 1: ${firstHash} (${firstCount} files)`);
    console.error(`  build 2: ${secondHash} (${secondCount} files)`);
    process.exit(1);
}

console.log(`build-determinism: ${artifactTree} stable across two builds (${firstCount} files).`);
