import test from "node:test";
import assert from "node:assert/strict";

import {
    aggregateWiringTarget,
    isTargetReachable,
    isTargetReachableFromAny,
    isWiringTargetReachable,
} from "./gate-targets.mjs";

const graph = [
    "root: product security",
    "product: sdk wrapper",
    "security: auth",
    "sdk:",
    "wrapper:",
    "auth:",
].join("\n");

test("resolves direct and transitive Make prerequisites", () => {
    assert.equal(isTargetReachable(graph, "root", "product"), true);
    assert.equal(isTargetReachable(graph, "root", "wrapper"), true);
    assert.equal(isTargetReachable(graph, "root", "missing"), false);
});

test("resolves through any selected aggregate", () => {
    assert.equal(isTargetReachableFromAny(graph, ["security", "root"], "wrapper"), true);
    assert.equal(isTargetReachableFromAny(graph, ["security"], "wrapper"), false);
});

test("terminates on dependency cycles and fails closed on parse failures", () => {
    assert.equal(isTargetReachable("a: b\nb: a", "a", "missing"), false);
    assert.equal(isTargetReachable("root: a \\", "root", "a"), false);
});

test("follows retired target aliases", () => {
    assert.equal(isTargetReachable(graph, "root", "old-wrapper", { "old-wrapper": "wrapper" }), true);
    assert.equal(isTargetReachable(graph, "root", "old-missing", { "old-missing": "missing" }), false);
});

test("selects the execution target before resolving contract wiring", () => {
    assert.equal(aggregateWiringTarget({ aggregateTarget: "run" }), "run");
    assert.equal(aggregateWiringTarget({ aggregateExecutionTarget: "run" }), "run");
    assert.equal(aggregateWiringTarget({ makeTarget: "leaf" }), "leaf");
    assert.equal(isWiringTargetReachable(graph, "root", { makeTarget: "wrapper" }), true);
});
