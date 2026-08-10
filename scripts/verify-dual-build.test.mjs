#!/usr/bin/env node
// Behavioral proof for wrapper/scripts/verify-dual-build.sh: copies the
// REAL, already-built wrapper/dist/{esm,cjs} trees (not a hand-authored
// stub -- a stub would have to duplicate the 94-name curated surface list
// and would drift from it silently) into an isolated temp fixture shaped
// like the wrapper root, runs the unmodified script against the pristine
// copy as a happy-path control, then mutates ONE curated export out of the
// ESM copy and re-runs to prove the script reds on exactly that gap.
// Nothing under wrapper/ is ever touched -- the mutation lives entirely in
// the temp copy, so there is no revert step.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapperDist = path.join(root, "wrapper", "dist");
const scriptSource = path.join(root, "wrapper", "scripts", "verify-dual-build.sh");

// This gate is reached from `make sdk-public-api`, which in turn is a
// direct Make prerequisite of `perfect-fast` -- a graph that does NOT
// otherwise build the wrapper first (unlike contract-gates/perfect-full,
// which reach `sdk-wrapper-build` earlier via the operation-parity-drift
// chain). Adding `sdk-wrapper-build` as sdk-public-api's own Make
// prerequisite was tried and rejected: it creates a second reachability
// path to the SAME phony target within product-contracts, which
// scripts/check-aggregate-gates.mjs correctly rejects as topology drift.
// So the "ensure built" responsibility lives here instead, invisible to
// that Make-graph checker (a plain npm command, not a tracked target
// edge) and safe to call repeatedly (npm's own build script is a normal,
// idempotent compile, not a second sync).
// node --test runs top-level tests with some concurrency; a bare boolean
// flag set only after the build finishes would let two concurrent calls
// both observe "not built yet" and both spawn a build. Caching the
// in-flight promise itself closes that race.
let ensureWrapperBuiltPromise = null;
function ensureWrapperBuilt() {
    if (ensureWrapperBuiltPromise == null) {
        ensureWrapperBuiltPromise = (async () => {
            const indexPath = path.join(wrapperDist, "esm", "index.js");
            const alreadyBuilt = await readFile(indexPath, "utf8").catch(() => null);
            if (alreadyBuilt == null) {
                const result = spawnSync("npm", ["run", "build", "-w", "clockify-sdk-ts-115"], {
                    cwd: root,
                    encoding: "utf8",
                    stdio: "inherit",
                });
                assert.equal(result.status, 0, "npm run build -w clockify-sdk-ts-115 failed");
            }
        })();
    }
    return ensureWrapperBuiltPromise;
}

async function buildFixture() {
    await ensureWrapperBuilt();
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "verify-dual-build-"));
    await cp(wrapperDist, path.join(fixtureRoot, "dist"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "scripts"), { recursive: true });
    await cp(scriptSource, path.join(fixtureRoot, "scripts", "verify-dual-build.sh"));
    return fixtureRoot;
}

function runScript(fixtureRoot) {
    return spawnSync("bash", ["scripts/verify-dual-build.sh"], {
        cwd: fixtureRoot,
        encoding: "utf8",
    });
}

test("verify-dual-build.sh precondition: wrapper is built (building it now if this is a fresh checkout)", async () => {
    await ensureWrapperBuilt();
    const entries = await readFile(path.join(wrapperDist, "esm", "index.js"), "utf8").catch(() => null);
    assert.ok(entries, "wrapper/dist/esm/index.js is still missing after ensureWrapperBuilt()");
});

test("verify-dual-build.sh passes against a pristine copy of the real built dist (happy-path control)", async () => {
    const fixtureRoot = await buildFixture();
    try {
        const result = runScript(fixtureRoot);
        assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout, /Dual-build smoke PASSED/);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
});

test("verify-dual-build.sh reds when a fixture dist is missing one curated ESM export", async () => {
    const fixtureRoot = await buildFixture();
    try {
        const indexPath = path.join(fixtureRoot, "dist", "esm", "index.js");
        const original = await readFile(indexPath, "utf8");
        const needle = "export { createClockifyClient, } from \"./create-client.js\";";
        assert.ok(original.includes(needle), "fixture ESM index.js must export createClockifyClient");
        const mutated = original.replace(needle, "");
        assert.notEqual(mutated, original);
        await writeFile(indexPath, mutated);

        const result = runScript(fixtureRoot);
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /ESM missing curated exports.*createClockifyClient/s);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
});

test("verify-dual-build.sh reds when dist/esm or dist/cjs is entirely absent", async () => {
    const fixtureRoot = await buildFixture();
    try {
        await rm(path.join(fixtureRoot, "dist", "cjs"), { recursive: true, force: true });
        const result = runScript(fixtureRoot);
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stderr, /dist\/esm or dist\/cjs missing/);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
});
