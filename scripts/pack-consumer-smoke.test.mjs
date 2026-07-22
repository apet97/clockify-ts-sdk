import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "pack-consumer-smoke.mjs");

function runSmoke(args) {
    return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
}

test("rejects an unknown argument fail-closed before any packing", () => {
    const result = runSmoke(["--frobnicate"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown argument --frobnicate/);
    assert.doesNotMatch(result.stdout ?? "", /exact-artifact/);
});

test("rejects an unknown --package id fail-closed before any packing", () => {
    const result = runSmoke(["--package=bogus"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown package id bogus/);
    assert.doesNotMatch(result.stdout ?? "", /exact-artifact/);
});

test("script and contract agree on the single-package release-proof modes", async () => {
    const { readFileSync } = await import("node:fs");
    const contract = JSON.parse(
        readFileSync(path.join(root, "docs", "pack-consumer-smoke-contract.json"), "utf8"),
    );
    const source = readFileSync(script, "utf8");
    for (const pkg of contract.packages) {
        assert.match(source, new RegExp(`\\b${pkg.id}:`), `mode missing for package ${pkg.id}`);
    }
    for (const consumer of contract.consumers) {
        assert.ok(
            source.includes(`"${consumer.id}"`) || source.includes(`${consumer.id}:`),
            `consumer ${consumer.id} not referenced by the engine`,
        );
    }
});
