import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkerPath = path.join(root, "scripts", "check-published-surface-diff-contract.mjs");
const contractPath = path.join(root, "docs", "published-surface-diff-contract.json");

function run() {
    return spawnSync(process.execPath, [checkerPath], { cwd: root, encoding: "utf8" });
}

test("passes against the real repo contract", () => {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /published-surface-diff contract passed \(3 packages, 5 bump classes documented\)/);
});

test("red-first: reds when a package id in the contract no longer matches packages.mjs", () => {
    const original = fs.readFileSync(contractPath, "utf8");
    try {
        const mutated = JSON.parse(original);
        mutated.packages.find((entry) => entry.id === "cli").id = "cli-renamed";
        fs.writeFileSync(contractPath, JSON.stringify(mutated, null, 2) + "\n");
        const result = run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /packages: contract declares/);
    } finally {
        fs.writeFileSync(contractPath, original);
    }
});

test("red-first: reds when a registrySpec drifts", () => {
    const original = fs.readFileSync(contractPath, "utf8");
    try {
        const mutated = JSON.parse(original);
        mutated.packages.find((entry) => entry.id === "sdk").registrySpec = "clockify-sdk-ts-115@1.0.0";
        fs.writeFileSync(contractPath, JSON.stringify(mutated, null, 2) + "\n");
        const result = run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /registrySpec: contract says/);
    } finally {
        fs.writeFileSync(contractPath, original);
    }
});

test("red-first: reds when a bump-class policy entry is blank", () => {
    const original = fs.readFileSync(contractPath, "utf8");
    try {
        const mutated = JSON.parse(original);
        mutated.bumpClassPolicy.patch = "";
        fs.writeFileSync(contractPath, JSON.stringify(mutated, null, 2) + "\n");
        const result = run();
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /bumpClassPolicy\.patch: must be a non-empty string/);
    } finally {
        fs.writeFileSync(contractPath, original);
    }
});
