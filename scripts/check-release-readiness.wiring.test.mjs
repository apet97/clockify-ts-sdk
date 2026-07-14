#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Reproduces the per-target-line wiring scan used by check-release-readiness.mjs.
function aggregateLineMissing(makefile, aggregateTarget, makeTarget) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    return !targetLine.includes(makeTarget);
}

test("contract-gates, perfect-fast, and perfect-full prerequisite lines wire release-readiness", () => {
    const makefile = readFileSync(path.join(root, "Makefile"), "utf8");
    for (const aggregateTarget of ["contract-gates", "perfect-fast", "perfect-full"]) {
        assert.equal(
            aggregateLineMissing(makefile, aggregateTarget, "release-readiness"),
            false,
            `${aggregateTarget} prerequisite line must include release-readiness`,
        );
    }
});

test("dropping release-readiness from an aggregate prerequisite line is detected", () => {
    const synthetic = [
        "contract-gates: foo release-readiness baz",
        "perfect-fast: foo bar",
        "perfect-full: foo release-readiness baz",
        "release-readiness:",
        "\tnode scripts/check-release-readiness.mjs",
    ].join("\n");
    assert.equal(aggregateLineMissing(synthetic, "contract-gates", "release-readiness"), false);
    assert.equal(aggregateLineMissing(synthetic, "perfect-fast", "release-readiness"), true);
    assert.equal(aggregateLineMissing(synthetic, "perfect-full", "release-readiness"), false);
});

test("check-release-readiness.mjs uses the per-target-line wiring scan, not a whole-file substring", () => {
    const source = readFileSync(path.join(root, "scripts", "check-release-readiness.mjs"), "utf8");
    assert.match(source, /line\.startsWith\("contract-gates:"\)/);
    assert.match(source, /for \(const aggregateTarget of \["perfect-fast", "perfect-full"\]\)/);
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("release-readiness")'),
        "the weak whole-file substring guard must be removed",
    );
});
