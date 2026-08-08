import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("1.0 inventory is current and every symbol carries a maintainer decision", () => {
    const script = path.join(root, "scripts/generate-one-point-zero-inventory.mjs");
    const result = spawnSync(process.execPath, [script, "--check"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const inventory = JSON.parse(fs.readFileSync(path.join(root, "docs/one-point-zero-surface-inventory.json"), "utf8"));
    assert.equal(inventory.status, "maintainer_classified");
    assert.equal(inventory.decisionPosture.decision, "released_1_0");
    assert.equal(inventory.decisionPosture.symbolClassification, "classified");
    assert.equal(inventory.decisionPosture.packageVersionChanges, true);
    assert.equal(inventory.decisionPosture.peerRangeChanges, true);
    assert.ok(inventory.sdk.rootSymbolCount > 0);
    assert.ok(inventory.sdk.subpathCount > 0);
    const approved = new Set(["stable", "experimental", "deprecated", "internal"]);
    assert.ok(inventory.sdk.symbolDecisions.every((entry) => approved.has(entry.decision)));
    assert.ok(inventory.sdk.subpaths.every((entry) => approved.has(entry.decision)));
    // Both consumers move together with the SDK major. Derived from the
    // manifests rather than written down, so a release does not need a hand
    // edit here — and so this asserts the consumers agree with the SDK rather
    // than agreeing with a number someone typed.
    const readManifest = (relative) =>
        JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
    const sdkMajor = readManifest("wrapper/package.json").version.split(".")[0];
    for (const id of ["cli", "mcp"]) {
        const declared = readManifest(`${id}/package.json`).peerDependencies["clockify-sdk-ts-115"];
        assert.equal(declared, `^${sdkMajor}`, `${id} peer range must track the SDK major`);
        assert.equal(inventory.consumers.find((entry) => entry.id === id).sdkPeerRange, declared);
    }
    assert.equal(inventory.knownPre1xBreakingChanges.length, 3);
    assert.ok(inventory.releaseWorkflowPeerParsing.some((entry) => entry.workflow?.endsWith("ci-mcp-release.yml")));
});

test("a symbol missing from the classification stays undecided", () => {
    // The generator must never default an unclassified symbol to stable: a
    // newly exported name has to be classified deliberately, not inherited.
    const script = path.join(root, "scripts/generate-one-point-zero-inventory.mjs");
    const classificationPath = path.join(root, "docs/one-point-zero-classification.json");
    const inventoryPath = path.join(root, "docs/one-point-zero-surface-inventory.json");
    const originalClassification = fs.readFileSync(classificationPath, "utf8");
    const originalInventory = fs.readFileSync(inventoryPath, "utf8");
    const originalMarkdown = fs.readFileSync(path.join(root, "docs/one-point-zero-surface-inventory.md"), "utf8");

    const trimmed = JSON.parse(originalClassification);
    const dropped = trimmed.symbols.pop().name;
    fs.writeFileSync(classificationPath, `${JSON.stringify(trimmed, null, 2)}\n`);
    try {
        const out = spawnSync(process.execPath, [script, "--write"], { cwd: root, encoding: "utf8" });
        assert.equal(out.status, 0, out.stderr);
        const rebuilt = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
        const entry = rebuilt.sdk.symbolDecisions.find((item) => item.name === dropped);
        assert.equal(entry.decision, "undecided", `${dropped} should fall back to undecided`);
    } finally {
        fs.writeFileSync(classificationPath, originalClassification);
        fs.writeFileSync(inventoryPath, originalInventory);
        fs.writeFileSync(path.join(root, "docs/one-point-zero-surface-inventory.md"), originalMarkdown);
    }
});
