import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSemver, deriveBumpClass, diffItems, evaluatePolicy } from "./diff-engine.mjs";

test("parseSemver rejects non-clean version strings", () => {
    assert.throws(() => parseSemver("1.2.3-beta.1"), /not a clean/);
    assert.throws(() => parseSemver("latest"), /not a clean/);
    assert.throws(() => parseSemver(undefined), /not a clean/);
});

test("deriveBumpClass classifies each step correctly", () => {
    assert.equal(deriveBumpClass("5.0.1", "6.0.0"), "major");
    assert.equal(deriveBumpClass("5.0.1", "5.1.0"), "minor");
    assert.equal(deriveBumpClass("5.0.1", "5.0.2"), "patch");
    assert.equal(deriveBumpClass("5.0.1", "5.0.1"), "none");
    assert.equal(deriveBumpClass("5.0.1", "5.0.0"), "downgrade");
    assert.equal(deriveBumpClass("5.1.0", "5.0.9"), "downgrade");
    assert.equal(deriveBumpClass("6.0.0", "5.9.9"), "downgrade");
});

test("diffItems reports added/removed relative to published, sorted", () => {
    const result = diffItems(["a", "c"], ["b", "c"]);
    assert.deepEqual(result, { added: ["b"], removed: ["a"] });
});

test("diffItems reports no delta for identical sets regardless of input order", () => {
    assert.deepEqual(diffItems(["b", "a"], ["a", "b"]), { added: [], removed: [] });
});

test("evaluatePolicy: major bump permits both additions and removals", () => {
    const verdict = evaluatePolicy({
        bumpClass: "major",
        deltas: [{ module: "sdk", kind: "subpaths", added: ["./new"], removed: ["./old"] }],
    });
    assert.equal(verdict.blocked, false);
    assert.deepEqual(verdict.violations, []);
});

test("evaluatePolicy: minor bump permits additions but blocks removals", () => {
    const additionsOnly = evaluatePolicy({
        bumpClass: "minor",
        deltas: [{ module: "mcp", kind: "tools", added: ["clockify_new_tool"], removed: [] }],
    });
    assert.equal(additionsOnly.blocked, false);

    const withRemoval = evaluatePolicy({
        bumpClass: "minor",
        deltas: [{ module: "mcp", kind: "tools", added: [], removed: ["clockify_old_tool"] }],
    });
    assert.equal(withRemoval.blocked, true);
    assert.match(withRemoval.violations[0], /requires a major bump/);
});

test("evaluatePolicy: patch bump blocks ANY delta, added or removed", () => {
    const withAddition = evaluatePolicy({
        bumpClass: "patch",
        deltas: [{ module: "cli", kind: "commands", added: ["new command"], removed: [] }],
    });
    assert.equal(withAddition.blocked, true);
    assert.match(withAddition.violations[0], /requires at least a minor bump/);

    const withRemoval = evaluatePolicy({
        bumpClass: "patch",
        deltas: [{ module: "cli", kind: "commands", added: [], removed: ["old command"] }],
    });
    assert.equal(withRemoval.blocked, true);
    assert.match(withRemoval.violations[0], /requires a major bump/);
});

test("evaluatePolicy: no delta at any bump class is never blocked (except downgrade)", () => {
    for (const bumpClass of ["major", "minor", "patch"]) {
        const verdict = evaluatePolicy({
            bumpClass,
            deltas: [{ module: "sdk", kind: "subpaths", added: [], removed: [] }],
        });
        assert.equal(verdict.blocked, false, `${bumpClass} with no delta should not block`);
    }
});

test("evaluatePolicy: none bump class blocks any delta -- version must move when surface moves", () => {
    const verdict = evaluatePolicy({
        bumpClass: "none",
        deltas: [{ module: "sdk", kind: "subpaths", added: ["./new"], removed: [] }],
    });
    assert.equal(verdict.blocked, true);
    assert.match(verdict.violations[0], /version must move forward/);
});

test("evaluatePolicy: downgrade always blocks regardless of deltas", () => {
    const verdict = evaluatePolicy({
        bumpClass: "downgrade",
        deltas: [{ module: "sdk", kind: "subpaths", added: [], removed: [] }],
    });
    assert.equal(verdict.blocked, true);
    assert.match(verdict.violations[0], /refusing to evaluate a downgrade/);
});

test("evaluatePolicy: aggregates violations across multiple deltas in one verdict", () => {
    const verdict = evaluatePolicy({
        bumpClass: "minor",
        deltas: [
            { module: "sdk", kind: "subpaths", added: [], removed: ["./old"] },
            { module: "cli", kind: "commands", added: ["new cmd"], removed: [] },
            { module: "mcp", kind: "tools", added: [], removed: ["clockify_gone"] },
        ],
    });
    assert.equal(verdict.blocked, true);
    assert.equal(verdict.violations.length, 2);
});
