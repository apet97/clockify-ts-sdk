import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the contributor matrix assigns every canonical change-impact scope once", () => {
    const contract = JSON.parse(fs.readFileSync(path.join(root, "docs/change-impact-contract.json"), "utf8"));
    const scopes = new Set(contract.scopes.map((scope) => scope.id));
    const assigned = contract.contributorMatrix.rows.flatMap((row) => row.scopeIds);
    assert.equal(new Set(assigned).size, assigned.length);
    assert.deepEqual(new Set(assigned), scopes);
});

test("the rendered matrix is current and names the public MCP safety gate", () => {
    const script = path.join(root, "scripts/generate-contributing-matrix.mjs");
    const result = spawnSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const contributing = fs.readFileSync(path.join(root, "CONTRIBUTING.md"), "utf8");
    assert.match(contributing, /mcp-write-safety/);
    assert.doesNotMatch(contributing, /make mcp-write-safety-run/);
});
