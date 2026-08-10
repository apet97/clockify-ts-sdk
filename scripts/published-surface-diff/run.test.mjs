// Tests for run.mjs's evaluatePackage()/runAll(). Every case injects
// fetchPublishedArtifact/extract/ensureBuilt/linkNodeModules -- no real
// registry, filesystem tar, dist build, or symlink is touched, so this
// suite stays offline and deterministic.
import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePackage } from "./run.mjs";
import { PublishedArtifactError } from "../lib/published-artifact.mjs";

const SDK_PKG = {
    id: "sdk",
    registrySpec: "clockify-sdk-ts-115@latest",
    candidateRoot: "/fake/wrapper",
};

function fakeArtifact() {
    return { packageDir: "/fake/unpacked/package", unpackedDir: "/fake/unpacked" };
}

test("evaluatePackage: matching surface + patch bump -> not blocked", async () => {
    const surface = { version: "5.0.1", subpaths: { ".": ["a", "b"] } };
    const result = await evaluatePackage(SDK_PKG, {
        ensureBuilt: () => {},
        fetchPublishedArtifact: async () => fakeArtifact(),
        linkNodeModules: () => {},
        extract: async (root) => (root === "/fake/unpacked/package" ? surface : { ...surface, version: "5.0.2" }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.blocked, false);
    assert.equal(result.bumpClass, "patch");
});

test("evaluatePackage red-first: a breaking removal at patch bump is BLOCKED", async () => {
    const published = { version: "5.0.1", subpaths: { ".": ["a", "b"], "./gone": ["x"] } };
    const candidate = { version: "5.0.2", subpaths: { ".": ["a", "b"] } };
    const result = await evaluatePackage(SDK_PKG, {
        ensureBuilt: () => {},
        fetchPublishedArtifact: async () => fakeArtifact(),
        linkNodeModules: () => {},
        extract: async (root) => (root === "/fake/unpacked/package" ? published : candidate),
    });
    assert.equal(result.ok, true);
    assert.equal(result.blocked, true);
    assert.equal(result.bumpClass, "patch");
    assert.equal(result.violations.length, 1);
    assert.match(result.violations[0], /removes \[\.\/gone\]/);
    assert.match(result.violations[0], /requires a major bump/);
});

test("evaluatePackage: the SAME breaking removal at major bump is NOT blocked", async () => {
    const published = { version: "5.0.1", subpaths: { ".": ["a", "b"], "./gone": ["x"] } };
    const candidate = { version: "6.0.0", subpaths: { ".": ["a", "b"] } };
    const result = await evaluatePackage(SDK_PKG, {
        ensureBuilt: () => {},
        fetchPublishedArtifact: async () => fakeArtifact(),
        linkNodeModules: () => {},
        extract: async (root) => (root === "/fake/unpacked/package" ? published : candidate),
    });
    assert.equal(result.blocked, false);
    assert.equal(result.bumpClass, "major");
});

// evaluatePackage() resolves the (injectable) extractor reference before
// calling fetchPublishedArtifact, so every case needs SOME extract stub even
// when the test never expects extraction to run -- it just never gets
// called in these two, since fetchPublishedArtifact throws first.
const unusedExtract = async () => {
    throw new Error("extract() should not have been called in this test");
};

test("evaluatePackage: registry-unreachable fails closed with an explicit message, does not throw", async () => {
    const result = await evaluatePackage(SDK_PKG, {
        ensureBuilt: () => {},
        extract: unusedExtract,
        fetchPublishedArtifact: async () => {
            throw new PublishedArtifactError("published-artifact: registry unreachable (simulated).", {
                code: "registry-unreachable",
            });
        },
    });
    assert.equal(result.ok, false);
    assert.match(result.fetchError, /registry unreachable/);
});

test("evaluatePackage: a non-PublishedArtifactError still throws (only the documented fail-closed shape is swallowed)", async () => {
    await assert.rejects(
        evaluatePackage(SDK_PKG, {
            ensureBuilt: () => {},
            extract: unusedExtract,
            fetchPublishedArtifact: async () => {
                throw new TypeError("something unrelated broke");
            },
        }),
        /something unrelated broke/,
    );
});

test("evaluatePackage: an extraction failure propagates (cleanup's own finally does not swallow it)", async () => {
    // fakeArtifact()'s unpackedDir does not exist on disk; the real fs.rmSync
    // in run.mjs's `finally` runs with { force: true }, which is silent on a
    // missing path -- this proves that path doesn't mask the real error
    // rather than proving the filesystem call itself (fs is not injected).
    const result = evaluatePackage(SDK_PKG, {
        ensureBuilt: () => {},
        fetchPublishedArtifact: async () => fakeArtifact(),
        linkNodeModules: () => {},
        extract: async () => {
            throw new Error("extraction boom");
        },
    });
    await assert.rejects(result, /extraction boom/);
});
