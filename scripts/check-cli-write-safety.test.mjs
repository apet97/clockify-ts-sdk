#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runChecker() {
    return spawnSync(process.execPath, ["scripts/check-cli-write-safety.mjs"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CLOCKIFY_API_KEY: "", CLOCKIFY_WORKSPACE_ID: "" },
    });
}

test("CLI write-safety proof ignores nested checkout tests", async () => {
    const nestedCheckout = await mkdtemp(path.join(root, ".tmp-cli-write-safety-"));
    const decoyDir = path.join(nestedCheckout, "cli", "tests");
    const decoyMessage = "nested CLI decoy should never be discovered";

    try {
        await mkdir(decoyDir, { recursive: true });
        await writeFile(
            path.join(decoyDir, "command-risk.test.ts"),
            `throw new Error(${JSON.stringify(decoyMessage)});\n`,
        );

        const result = runChecker();
        const output = `${result.stdout}\n${result.stderr}`;

        assert.equal(result.status, 0, output);
        assert.equal(output.includes(decoyMessage), false, output);
    } finally {
        await rm(nestedCheckout, { recursive: true, force: true });
    }
});

test("CLI write-safety proof reds when the mutation-leaves suite's pinned case count drifts from the contract", async () => {
    // Regression for the gap that let `expected.mutatingLeaves` (contract) and
    // `expect(cases).toHaveLength(N)` (cli/tests/mutation-leaves.test.ts) drift
    // apart silently: the behavioral proof only checked the suite's EXIT
    // STATUS, which stays 0 as long as the suite agrees with ITSELF, even when
    // both numbers are wrong together. This test mutates the real pinned count
    // on disk, runs the real checker, and restores the file in `finally` no
    // matter what -- mirroring how the bug was actually found (a manual
    // mutate-and-check pass), not a fixture double.
    const testPath = path.join(root, "cli", "tests", "mutation-leaves.test.ts");
    const original = await readFile(testPath, "utf8");
    const pin = /expect\(cases\)\.toHaveLength\((\d+)\)/.exec(original);
    assert.ok(pin, "mutation-leaves.test.ts must pin expect(cases).toHaveLength(N)");
    const mutated = original.replace(
        `expect(cases).toHaveLength(${pin[1]})`,
        `expect(cases).toHaveLength(${Number(pin[1]) - 1})`,
    );
    assert.notEqual(mutated, original, "the toHaveLength replacement must actually change the file");

    try {
        await writeFile(testPath, mutated);
        const result = runChecker();
        const output = `${result.stdout}\n${result.stderr}`;

        assert.notEqual(result.status, 0, output);
        assert.match(output, /mutation-leaves\.test\.ts.*pins \d+ cases, but expected\.mutatingLeaves is/);
    } finally {
        await writeFile(testPath, original);
    }
});
