import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// check-error-registry.mjs resolves every path against its own real repo
// root (path.resolve(dirname(import.meta.url), "..")), not process.cwd() --
// it does not support a fixture-directory override the way check-ci-contract
// does. So the only way to red-demonstrate it is to mutate the real
// committed contract, spawn the checker, and restore the original content --
// every mutating test below does this in a try/finally.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts", "check-error-registry.mjs");
const contractPath = path.join(root, "docs", "error-registry-contract.json");

function runChecker() {
    return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
}

function withMutatedContract(mutate, fn) {
    const original = readFileSync(contractPath, "utf8");
    try {
        const contract = JSON.parse(original);
        mutate(contract);
        writeFileSync(contractPath, JSON.stringify(contract, null, 2) + "\n");
        return fn();
    } finally {
        writeFileSync(contractPath, original);
    }
}

test("the real repo passes with all 14 reachable codes carrying a per-code test reference", () => {
    const result = runChecker();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /14 with per-code test references/);
    // This also pins the groundedBySource whitespace-tolerance fix: two of
    // the 14 codes (invalid_request, auth_or_permission) are asserted via a
    // Prettier-wrapped multi-line `.toBe(\n    "code",\n)` call in
    // wrapper/tests/error-code-wiring.test.ts. A plain-substring needle
    // (the pre-fix implementation) misses that shape and would red here.
});

test("removing a reachable code's testReferences entry reds naming that code", () => {
    const result = withMutatedContract(
        (contract) => {
            delete contract.testReferences.conflict;
        },
        () => runChecker(),
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /reachable code "conflict" has no contract\.testReferences entry/);
});

test("pointing a reference at a file that does not ground the code reds -- a title mention is not enough", () => {
    const result = withMutatedContract(
        (contract) => {
            // mcp/tests/setup-required.test.ts exists (so the file-existence
            // check alone would pass) but never asserts .code === "conflict"
            // -- proving the checker verifies the file's actual content, not
            // just that the referenced file is real.
            contract.testReferences.conflict = [
                { file: "mcp/tests/setup-required.test.ts", codeLiteral: "conflict" },
            ];
        },
        () => runChecker(),
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(
        result.stderr,
        /contract\.testReferences\.conflict: "mcp\/tests\/setup-required\.test\.ts" does not contain a grounding assertion/,
    );
});

test("a codeLiteral that does not match its own key reds", () => {
    const result = withMutatedContract(
        (contract) => {
            contract.testReferences.conflict[0].codeLiteral = "not_found";
        },
        () => runChecker(),
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /codeLiteral must equal "conflict"/);
});

test("pointing a reference at a nonexistent file reds", () => {
    const result = withMutatedContract(
        (contract) => {
            contract.testReferences.conflict[0].file = "mcp/tests/does-not-exist.test.ts";
        },
        () => runChecker(),
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /file "mcp\/tests\/does-not-exist\.test\.ts" does not exist/);
});
