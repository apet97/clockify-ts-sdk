import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const makefilePath = path.join(root, "Makefile");
const script = path.join(root, "scripts", "check-support-bundle.mjs");

function runScript() {
    try {
        execFileSync("node", [script], { cwd: root, stdio: "pipe" });
        return 0;
    } catch (err) {
        return err.status ?? 1;
    }
}

const original = readFileSync(makefilePath, "utf8");
try {
    // 1. With the gate wired (current repo state) the self-check passes.
    assert.equal(runScript(), 0, "check-support-bundle.mjs must pass on the unmodified Makefile");

    // 2. Remove `support-bundle` ONLY from the contract-gates aggregate prerequisite line.
    const mutated = original
        .split("\n")
        .map((line) =>
            line.startsWith("contract-gates:")
                ? line.replace(/\s+support-bundle(?=\s|$)/, "")
                : line,
        )
        .join("\n");
    assert.notEqual(mutated, original, "test setup: contract-gates line must contain support-bundle");
    writeFileSync(makefilePath, mutated);

    // 3. The scoped self-check now catches the missing wiring (non-zero exit).
    assert.notEqual(
        runScript(),
        0,
        "checker must fail when support-bundle is removed from contract-gates",
    );
} finally {
    writeFileSync(makefilePath, original);
}

console.log("ok - aggregate wiring self-check is scoped to contract-gates");
