import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-data-handling.mjs");
const source = readFileSync(scriptPath, "utf8");

test("contract-gates wiring is checked on the aggregate target line", () => {
    assert.ok(
        source.includes('const aggregateLine = makefile.split("\\n").find((line) => line.startsWith("contract-gates:")) ?? "";'),
        "expected contract-gates target-line lookup",
    );
    assert.ok(
        source.includes("if (!aggregateLine.includes(contract.wiring.makeTarget)) {"),
        "expected aggregateLine.includes(contract.wiring.makeTarget) check",
    );
});

test("weak global-substring wiring check is removed", () => {
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")'),
        "weak global-substring wiring check must be removed",
    );
});
