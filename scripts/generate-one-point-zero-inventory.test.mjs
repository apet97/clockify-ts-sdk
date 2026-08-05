import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("mechanical 1.0 inventory is current and leaves every symbol undecided", () => {
    const script = path.join(root, "scripts/generate-one-point-zero-inventory.mjs");
    const result = spawnSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const inventory = JSON.parse(fs.readFileSync(path.join(root, "docs/one-point-zero-surface-inventory.json"), "utf8"));
    assert.equal(inventory.status, "mechanical_evidence_only");
    assert.equal(inventory.decisionPosture.decision, "defer_1x");
    assert.equal(inventory.decisionPosture.symbolClassification, "undecided");
    assert.equal(inventory.decisionPosture.packageVersionChanges, false);
    assert.equal(inventory.decisionPosture.peerRangeChanges, false);
    assert.ok(inventory.sdk.rootSymbolCount > 0);
    assert.ok(inventory.sdk.subpathCount > 0);
    assert.ok(inventory.sdk.symbolDecisions.every((entry) => entry.decision === "undecided"));
    assert.equal(inventory.consumers.find((entry) => entry.id === "cli").sdkPeerRange, ">=0.15.1 <1");
    assert.equal(inventory.consumers.find((entry) => entry.id === "mcp").sdkPeerRange, ">=0.15.1 <1");
    assert.equal(inventory.knownPre1xBreakingChanges.length, 3);
    assert.ok(inventory.releaseWorkflowPeerParsing.some((entry) => entry.workflow?.endsWith("ci-mcp-release.yml")));
});
