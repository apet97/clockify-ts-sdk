#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { evaluateWiring, findExecuted } from "./lib/wiring-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChecker() {
    return spawnSync(process.execPath, ["scripts/check-gate-reachability.mjs"], {
        cwd: root,
        encoding: "utf8",
    });
}

// --- lib/wiring-contract.mjs: evaluateWiring is generic, not test-specific ---

test("evaluateWiring reports an orphan file that no executor mentions", () => {
    const failures = evaluateWiring({
        discovered: ["scripts/check-nothing.mjs"],
        executorTexts: [{ source: "Makefile", text: "other-target:\n\tnode scripts/check-other.mjs\n" }],
        exemptions: [],
        kind: "checker",
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /scripts\/check-nothing\.mjs is executed by no Makefile target/);
});

test("evaluateWiring passes a discovered file mentioned by any executor", () => {
    const failures = evaluateWiring({
        discovered: ["scripts/check-thing.mjs"],
        executorTexts: [{ source: "Makefile", text: "thing:\n\tnode scripts/check-thing.mjs\n" }],
        exemptions: [],
        kind: "checker",
    });
    assert.deepEqual(failures, []);
});

test("evaluateWiring honors an exemption, but flags a stale one for a deleted file", () => {
    const passing = evaluateWiring({
        discovered: ["scripts/check-manual.mjs"],
        executorTexts: [],
        exemptions: [{ path: "scripts/check-manual.mjs", reason: "manual CLI", who: "x", when: "2026-08-10" }],
        kind: "checker",
    });
    assert.deepEqual(passing, []);

    const stale = evaluateWiring({
        discovered: [],
        executorTexts: [],
        exemptions: [{ path: "scripts/check-gone.mjs", reason: "x", who: "y", when: "2026-08-10" }],
        kind: "checker",
    });
    assert.equal(stale.length, 1);
    assert.match(stale[0], /scripts\/check-gone\.mjs, which no longer exists/);
});

test("evaluateWiring flags a count-ratchet mismatch", () => {
    const failures = evaluateWiring({
        discovered: ["a.mjs", "b.mjs"],
        executorTexts: [],
        exemptions: [{ path: "a.mjs", reason: "x", who: "y", when: "2026-08-10" }, { path: "b.mjs", reason: "x", who: "y", when: "2026-08-10" }],
        expectedCount: 5,
        kind: "checker",
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /discovered 2 checker files but expected 5/);
});

test("findExecuted (shared with test-wiring) attributes a checker to the executor that mentions it", () => {
    const executed = findExecuted(
        ["scripts/check-x.mjs"],
        [{ source: "Makefile", text: "t:\n\tnode scripts/check-x.mjs\n" }],
    );
    assert.deepEqual(executed.get("scripts/check-x.mjs"), ["Makefile"]);
});

// --- scripts/check-gate-reachability.mjs: real-repo integration ---------

test("gate reachability check passes against the real repo", () => {
    const result = runChecker();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /gate reachability passed \(\d+ checker files/);
});

test("gate reachability check reds when a genuinely orphaned checker file is dropped on disk", async () => {
    // Mirrors the card's own redFirst wording: "orphan check-nothing.mjs ->
    // red". Creates a real, temporary check-*.mjs file under scripts/ that
    // no Makefile/package.json/workflow mentions, runs the real checker
    // against the real repo, and removes the file in `finally` no matter
    // what -- same discipline as the mutate-real-file tests elsewhere in
    // this batch, just additive instead of destructive.
    const orphanPath = path.join(root, "scripts", "check-nothing-orphan-fixture.mjs");
    await writeFile(orphanPath, "// intentionally unwired fixture for check-gate-reachability.test.mjs\n");
    try {
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(
            result.stdout + result.stderr,
            /check-nothing-orphan-fixture\.mjs is executed by no Makefile target/,
        );
    } finally {
        await rm(orphanPath, { force: true });
    }
});

test("gate reachability check reds when licensedExceptions has a blank reason", async () => {
    const contractPath = path.join(root, "docs", "gate-reachability-contract.json");
    const original = await readFile(contractPath, "utf8");
    const contract = JSON.parse(original);
    assert.ok(contract.licensedExceptions.length > 0, "fixture assumes at least one existing exception");
    const mutated = structuredClone(contract);
    mutated.licensedExceptions[0].reason = "";
    try {
        await writeFile(contractPath, `${JSON.stringify(mutated, null, 2)}\n`);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /needs a non-empty reason/);
    } finally {
        await writeFile(contractPath, original);
    }
});
