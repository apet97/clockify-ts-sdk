import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-data-handling.mjs");
const source = readFileSync(scriptPath, "utf8");

test("contract-gates wiring uses semantic DAG reachability", () => {
    assert.ok(
        source.includes("isWiringTargetReachable(makefile, \"contract-gates\", contract.wiring)"),
        "expected semantic aggregate reachability check",
    );
    assert.ok(!source.includes("aggregateLine"), "must not regress to a literal aggregate line scan");
});

test("weak global-substring wiring check is removed", () => {
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")'),
        "weak global-substring wiring check must be removed",
    );
});
