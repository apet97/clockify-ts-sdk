import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDeltas } from "./compare-package.mjs";

test("buildDeltas(sdk): a removed subpath is reported once, not also as a per-symbol delta", () => {
    const published = { version: "5.0.1", subpaths: { ".": ["a", "b"], "./gone": ["x"] } };
    const candidate = { version: "5.0.1", subpaths: { ".": ["a", "b"] } };
    const deltas = buildDeltas("sdk", published, candidate);
    assert.equal(deltas.length, 1);
    assert.deepEqual(deltas[0], { module: "sdk", kind: "subpaths", added: [], removed: ["./gone"] });
});

test("buildDeltas(sdk): a shared subpath's symbol delta is reported alongside the (empty) subpath-list delta", () => {
    const published = { version: "5.0.1", subpaths: { ".": ["a", "b"] } };
    const candidate = { version: "5.0.1", subpaths: { ".": ["a", "c"] } };
    const deltas = buildDeltas("sdk", published, candidate);
    // Two entries: the subpath-LIST delta (empty -- "." exists on both sides,
    // no subpath added/removed) plus the per-subpath SYMBOL delta for "."
    // itself (b removed, c added).
    assert.equal(deltas.length, 2);
    assert.deepEqual(deltas[0], { module: "sdk", kind: "subpaths", added: [], removed: [] });
    assert.deepEqual(deltas[1], { module: "sdk", kind: "subpath .", added: ["c"], removed: ["b"] });
});

test("buildDeltas(sdk): no per-subpath delta entry when a shared subpath's symbols are identical", () => {
    const published = { version: "5.0.1", subpaths: { ".": ["a", "b"] } };
    const candidate = { version: "5.0.1", subpaths: { ".": ["a", "b"] } };
    const deltas = buildDeltas("sdk", published, candidate);
    assert.equal(deltas.length, 1);
    assert.deepEqual(deltas[0], { module: "sdk", kind: "subpaths", added: [], removed: [] });
});

test("buildDeltas(cli): single commands delta", () => {
    const published = { version: "5.0.1", commands: ["status", "projects list"] };
    const candidate = { version: "5.0.1", commands: ["status", "projects list", "projects archive"] };
    const deltas = buildDeltas("cli", published, candidate);
    assert.deepEqual(deltas, [{ module: "cli", kind: "commands", added: ["projects archive"], removed: [] }]);
});

test("buildDeltas(mcp): single tools delta", () => {
    const published = { version: "5.0.1", tools: ["clockify_status"] };
    const candidate = { version: "5.0.1", tools: [] };
    const deltas = buildDeltas("mcp", published, candidate);
    assert.deepEqual(deltas, [{ module: "mcp", kind: "tools", added: [], removed: ["clockify_status"] }]);
});

test("buildDeltas rejects an unknown package id", () => {
    assert.throws(() => buildDeltas("bogus", {}, {}), /unknown package id/);
});
