#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
    collectRuleStates,
    findContiguousRange,
    findOffRuleLines,
    isTestScopeBlock,
} from "./lib/lint-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChecker() {
    return spawnSync(process.execPath, ["scripts/check-lint-config.mjs"], {
        cwd: root,
        encoding: "utf8",
    });
}

// --- lib/lint-config.mjs: pure structural helpers -----------------------

test("isTestScopeBlock is true only for a files glob targeting tests/**", () => {
    assert.equal(isTestScopeBlock({ files: ["tests/**/*.ts"] }), true);
    assert.equal(isTestScopeBlock({ files: ["src/tools/**/*.ts"] }), false);
    assert.equal(isTestScopeBlock({ files: ["errors.ts", "webhooks.ts"] }), false);
    assert.equal(isTestScopeBlock({}), false);
});

test("findContiguousRange finds a preset spread by reference, not by shape", () => {
    const presetA = { rules: { "eslint-rule-a": "error" } };
    const presetB = { rules: { "eslint-rule-b": "error" } };
    const preset = [presetA, presetB];
    const configArray = [{ ignores: ["dist/**"] }, presetA, presetB, { rules: { "own-rule": "off" } }];

    const range = findContiguousRange(configArray, preset);
    assert.ok(range);
    assert.equal(range.has(presetA), true);
    assert.equal(range.has(presetB), true);
    assert.equal(range.has(configArray[0]), false);
    assert.equal(range.has(configArray[3]), false);

    // A shape-identical but reference-distinct pair must NOT match: this is
    // the exact case a dropped-and-hand-copied preset would produce.
    const lookalike = [{ rules: { "eslint-rule-a": "error" } }, { rules: { "eslint-rule-b": "error" } }];
    assert.equal(findContiguousRange(lookalike, preset), null);
});

test("collectRuleStates skips blocks in skipBlocks and tags test scope", () => {
    const presetBlock = { rules: { "preset-rule": "off" } };
    const ownGlobal = { rules: { "own-off-rule": "off", "own-warn-rule": "warn" } };
    const ownTest = { files: ["tests/**/*.ts"], rules: { "test-only-rule": "off" } };
    const configArray = [presetBlock, ownGlobal, ownTest];

    const states = collectRuleStates(configArray, new Set([presetBlock]));
    const byRule = Object.fromEntries(states.map((state) => [state.rule, state]));

    assert.equal(byRule["preset-rule"], undefined, "skipBlocks must exclude the preset's own rules");
    assert.equal(byRule["own-off-rule"].off, true);
    assert.equal(byRule["own-off-rule"].testScope, false);
    assert.equal(byRule["own-warn-rule"].warn, true);
    assert.equal(byRule["test-only-rule"].testScope, true);
});

test("findOffRuleLines walks past files/rules block-boilerplate to reach a rationale above the block", () => {
    const source = [
        "export default [",
        "    {",
        "        // this rule is a V8 extension guard, kept for captureStackTrace",
        "        files: [\"errors.ts\", \"webhooks.ts\"],",
        "        rules: {",
        '            "@typescript-eslint/no-unnecessary-condition": "off",',
        "        },",
        "    },",
        "];",
    ].join("\n");

    const hits = findOffRuleLines(source, "@typescript-eslint/no-unnecessary-condition");
    assert.equal(hits.length, 1);
    assert.match(hits[0].rationaleText, /captureStackTrace/);
});

test("findOffRuleLines stops at real code and reports no rationale", () => {
    const source = [
        "const rules = {",
        '    "@typescript-eslint/no-explicit-any": "off",',
        "};",
    ].join("\n");

    const hits = findOffRuleLines(source, "@typescript-eslint/no-explicit-any");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].rationaleText, "");
});

// --- scripts/check-lint-config.mjs: real-repo integration ---------------

test("lint config check passes against the real repo's three configs", () => {
    const result = runChecker();
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Lint config check passed \(3 configs/);
});

test("lint config check reds when strictTypeChecked is dropped from a real config", async () => {
    // Mutates the real wrapper/eslint.config.js on disk, runs the real
    // checker, and restores the file in `finally` no matter what -- the
    // same mutate-and-check pass used to author the gate, not a fixture
    // double (see scripts/check-cli-write-safety.test.mjs for precedent).
    const testPath = path.join(root, "wrapper", "eslint.config.js");
    const original = await readFile(testPath, "utf8");
    const needle = "...tseslint.configs.strictTypeChecked,";
    assert.ok(original.includes(needle), "wrapper/eslint.config.js must spread strictTypeChecked");
    const mutated = original.replace(needle, "");
    assert.notEqual(mutated, original);

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(result.stdout + result.stderr, /does not spread tseslint\.configs\.strictTypeChecked/);
    } finally {
        await writeFile(testPath, original);
    }
});

test("lint config check reds when a licensed disable's rationale comment is deleted", async () => {
    const testPath = path.join(root, "wrapper", "eslint.config.js");
    const original = await readFile(testPath, "utf8");
    const lines = original.split("\n");
    const filtered = lines.filter((line) => !line.includes("captureStackTrace"));
    assert.notEqual(filtered.length, lines.length, "must actually remove a line");
    const mutated = filtered.join("\n");

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(
            result.stdout + result.stderr,
            /no-unnecessary-condition-wrapper-error-scaffold has no preceding rationale/,
        );
    } finally {
        await writeFile(testPath, original);
    }
});

test("lint config check reds when an undeclared 7th suppression is added", async () => {
    const testPath = path.join(root, "wrapper", "eslint.config.js");
    const original = await readFile(testPath, "utf8");
    const needle = '"@typescript-eslint/no-non-null-assertion": "off",';
    assert.ok(original.includes(needle));
    const mutated = original.replace(
        needle,
        `${needle}\n            "@typescript-eslint/no-explicit-any": "off",`,
    );
    assert.notEqual(mutated, original);

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
        assert.match(
            result.stdout + result.stderr,
            /undeclared lint suppression @typescript-eslint\/no-explicit-any/,
        );
    } finally {
        await writeFile(testPath, original);
    }
});
