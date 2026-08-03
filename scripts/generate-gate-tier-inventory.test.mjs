import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    buildInventory,
    parseMakefileGraph,
    parseRecursiveMakeCalls,
    validateInventory,
} from "./generate-gate-tier-inventory.mjs";

function fixtureRoot(makefile, files = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gate-tier-inventory-"));
    fs.writeFileSync(path.join(root, "Makefile"), makefile);
    for (const [relative, contents] of Object.entries(files)) {
        const absolute = path.join(root, relative);
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, contents);
    }
    return root;
}

test("parses alias targets and preserves the first rule", () => {
    const model = parseMakefileGraph(".PHONY: alias real\nalias: real\nreal:\n\techo real\n");
    assert.deepEqual(model.rules.get("alias")?.prerequisites, ["real"]);
    assert.deepEqual(model.rules.get("real")?.recipes, ["echo real"]);
    assert.deepEqual(model.phony, new Set(["alias", "real"]));
});

test("joins prerequisite continuation lines", () => {
    const model = parseMakefileGraph("contract-gates: first \\\nsecond third\nfirst:\n");
    assert.deepEqual(model.rules.get("contract-gates")?.prerequisites, ["first", "second", "third"]);
});

test("parses recursive Make calls and preserves the selected directory", () => {
    assert.deepEqual(parseRecursiveMakeCalls("cd ../GOCLMCP && $(MAKE) -k openapi-drift catalog-drift", "."), [
        {
            command: "cd ../GOCLMCP && $(MAKE) -k openapi-drift catalog-drift",
            directory: "../GOCLMCP",
            targets: ["openapi-drift", "catalog-drift"],
            failures: [],
        },
    ]);
});

test("records recursive Make targets in the transitive graph", () => {
    const root = fixtureRoot(
        "contract-gates: gate\ngate:\n\tcd sub && $(MAKE) subtask\n",
        { "sub/Makefile": "subtask:\n\techo subtask\n" },
    );
    const row = buildInventory({ rootDir: root }).rows[0];
    assert.deepEqual(row.recursiveMakeCalls[0].targets, ["subtask"]);
    assert.equal(row.recursiveMakeCalls[0].directory, "sub");
    assert.ok(row.transitiveTargets.includes("sub::subtask"));
});

test("expands reached npm scripts and test files", () => {
    const root = fixtureRoot(
        "contract-gates: gate\ngate:\n\tnpm test -w pkg\n",
        {
            "package.json": JSON.stringify({ workspaces: ["pkg"] }),
            "pkg/package.json": JSON.stringify({ name: "pkg", scripts: { test: "node --test pkg.test.mjs" } }),
            "pkg/pkg.test.mjs": "// fixture test\n",
        },
    );
    const row = buildInventory({ rootDir: root }).rows[0];
    assert.deepEqual(row.npmScripts, ["pkg::test"]);
    assert.deepEqual(row.tests, ["pkg/pkg.test.mjs"]);
});

test("derives a decision baseline from its measured list without a fixed count", () => {
    const root = fixtureRoot(
        "contract-gates: first\nfirst:\ngenerated-edit-check:\nopenapi-evidence:\n",
        {
            "docs/gate-tier-inventory.json": JSON.stringify({ decisionPrerequisites: ["generated-edit-check", "openapi-evidence"] }),
        },
    );
    const inventory = buildInventory({ rootDir: root });
    assert.deepEqual(inventory.decisionPrerequisites, ["generated-edit-check", "openapi-evidence"]);
    assert.equal(inventory.decisionPrerequisiteCount, inventory.decisionPrerequisites.length);
    assert.equal(inventory.decisionRows.length, inventory.decisionPrerequisites.length);
});

test("does not reinterpret active aggregate prerequisites as a decision baseline", () => {
    const root = fixtureRoot(
        "contract-gates: first\nfirst:\nsecond:\n",
        {
            "docs/gate-tier-inventory.json": JSON.stringify({
                directPrerequisiteCount: 2,
                directPrerequisites: ["first", "second"],
            }),
        },
    );
    const inventory = buildInventory({ rootDir: root });
    assert.deepEqual(inventory.decisionPrerequisites, []);
    assert.deepEqual(inventory.decisionRows, []);
});

test("retains duplicate target definitions for diagnostics", () => {
    const model = parseMakefileGraph("gate: first\ngate: second\n");
    assert.equal(model.definitions.get("gate")?.length, 2);
    assert.deepEqual(model.rules.get("gate")?.prerequisites, ["first"]);
});

test("fails closed on target cycles", () => {
    const root = fixtureRoot("contract-gates: first\nfirst: second\nsecond: first\n");
    assert.throws(() => buildInventory({ rootDir: root }), /cycle/);
});

test("records shell recipes and supports a target with no recipe", () => {
    const root = fixtureRoot("contract-gates: shell empty\nshell:\n\t@echo shell\nempty:\n");
    const rows = buildInventory({ rootDir: root }).rows;
    assert.deepEqual(rows[0].commands, ["@echo shell"]);
    assert.deepEqual(rows[1].commands, []);
});

test("finds literal topology consumers", () => {
    const root = fixtureRoot(
        "contract-gates: gate\ngate:\n\tnode scripts/guard.mjs\n",
        { "scripts/guard.mjs": "// gate is a Makefile prerequisite topology consumer\n" },
    );
    const row = buildInventory({ rootDir: root }).rows[0];
    assert.ok(row.literalTopologyConsumers.some((consumer) => consumer.startsWith("scripts/guard.mjs:")));
});

test("fails when bounded traversal is exceeded", () => {
    const root = fixtureRoot("contract-gates: first\nfirst: second\nsecond: third\nthird:\n");
    assert.throws(() => buildInventory({ rootDir: root, bounds: { maxDepth: 1 } }), /depth exceeds/);
});

test("the real contract-gates source keeps aggregate topology and the complete D4 decision set", () => {
    const inventory = buildInventory();
    assert.equal(inventory.directPrerequisiteCount, inventory.directPrerequisites.length);
    assert.equal(inventory.rows.length, inventory.directPrerequisites.length);
    assert.equal(inventory.directPrerequisiteCount, 4);
    assert.equal(inventory.decisionPrerequisiteCount, 87);
    assert.equal(inventory.decisionRows.length, 87);
    assert.ok(inventory.rows.every((row) => row.currentTier === "aggregate"));
    assert.ok(inventory.rows.every((row) => row.proposedTier === "aggregate"));
    assert.ok(inventory.decisionRows.every((row) => row.currentTier === "pr_blocking"));
    assert.ok(inventory.decisionRows.every((row) => row.proposedTier !== "undecided"));
    assert.deepEqual(validateInventory(inventory), []);
});

test("validation rejects omitted or unresolved decision rows", () => {
    const inventory = buildInventory();
    const invalid = structuredClone(inventory);
    invalid.decisionRows.pop();
    assert.match(validateInventory(invalid).join("\n"), /decisionRows must cover every decision prerequisite/);
    invalid.decisionRows = structuredClone(inventory.decisionRows);
    invalid.decisionRows[0].proposedTier = "undecided";
    assert.match(validateInventory(invalid).join("\n"), /proposedTier is invalid or unresolved/);
});
