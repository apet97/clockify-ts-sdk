import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check-data-handling.mjs");
const source = readFileSync(scriptPath, "utf8");

test("perfect-fast/perfect-full wiring is checked per aggregate target line", () => {
    assert.ok(
        source.includes('for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {'),
        "expected per-aggregate-target wiring loop over perfect-fast and perfect-full",
    );
    assert.ok(
        source.includes("if (!targetLine.includes(contract.wiring.makeTarget)) {"),
        "expected per-line targetLine.includes(contract.wiring.makeTarget) check",
    );
});

test("weak global-substring wiring check is removed", () => {
    assert.ok(
        !source.includes('!makefile.includes("perfect-fast:") || !makefile.includes("data-handling")'),
        "weak global-substring wiring check must be removed",
    );
});
