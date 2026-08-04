import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(root, "scripts", "check-no-generated-edits.mjs");
const PROBE = "\n// __generated_edit_guard_probe__\n";

// Spawn with the bypass explicitly cleared. `scripts/lib/verify-plan.mjs` runs
// `make generated-edit-check` with CLOCKIFY_ALLOW_GENERATED_DIFF=1 -- correctly,
// because codegen rewrites those trees during perfect-fast -- so a test that
// inherited the ambient environment would assert nothing about the guard's real
// behavior and would fail for a reason unrelated to what it checks. The bypass
// itself is covered by its own test below.
function runGuard(env = {}) {
    const { CLOCKIFY_ALLOW_GENERATED_DIFF: _ignored, ...clean } = process.env;
    return spawnSync("node", [guard], { cwd: root, encoding: "utf8", env: { ...clean, ...env } });
}

function pickTsFile(dir) {
    const stack = [dir];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(absolute);
            else if (entry.isFile() && absolute.endsWith(".ts")) return absolute;
        }
    }
    return undefined;
}

test("clean generated trees pass the guard", () => {
    if (!fs.existsSync(path.join(root, "output", "ts-sdk"))) return; // skip-if-absent (fresh clone before `make sdk-codegen`)
    // A deliberate GOCLMCP -> corrected-snapshot regeneration is allowed by
    // the aggregate's explicit bypass. The guard's tamper and bypass tests
    // below still clear ambient state and exercise the normal fail-closed
    // behavior; this branch only prevents the clean-tree assertion from
    // making the documented generated-chain run impossible.
    if (process.env.CLOCKIFY_ALLOW_GENERATED_DIFF === "1") {
        const result = runGuard({ CLOCKIFY_ALLOW_GENERATED_DIFF: "1" });
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /generated edit guard bypassed by CLOCKIFY_ALLOW_GENERATED_DIFF=1/);
        return;
    }
    const result = runGuard();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /no guarded generated\/snapshot edits detected/);
});

test("a hand-edit to gitignored output/ts-sdk is flagged", () => {
    const outDir = path.join(root, "output", "ts-sdk");
    if (!fs.existsSync(outDir)) return; // skip-if-absent
    const target = pickTsFile(outDir);
    assert.ok(target, "expected at least one generated .ts file");
    const original = fs.readFileSync(target);
    try {
        fs.appendFileSync(target, PROBE);
        const result = runGuard();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Generated or snapshot surfaces changed:/);
    } finally {
        fs.writeFileSync(target, original);
    }
});

test("a hand-edit to gitignored wrapper/src is flagged", () => {
    const srcDir = path.join(root, "wrapper", "src");
    if (!fs.existsSync(srcDir) || !fs.existsSync(path.join(root, "output", "ts-sdk"))) return; // skip-if-absent
    const target = pickTsFile(srcDir);
    assert.ok(target, "expected at least one synced .ts file");
    const original = fs.readFileSync(target);
    try {
        fs.appendFileSync(target, PROBE);
        const result = runGuard();
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Generated or snapshot surfaces changed:/);
    } finally {
        fs.writeFileSync(target, original);
    }
});

// Keeps the bypass itself covered now that runGuard() clears it by default.
// perfect-fast depends on this path: scripts/lib/verify-plan.mjs runs
// `make sdk-codegen-drift sdk-codegen-test generated-edit-check` with the
// variable set, because codegen has legitimately just rewritten those trees.
test("the documented bypass suppresses the guard only when explicitly set to 1", () => {
    const outDir = path.join(root, "output", "ts-sdk");
    if (!fs.existsSync(outDir)) return; // skip-if-absent
    const target = pickTsFile(outDir);
    assert.ok(target, "expected at least one generated .ts file");
    const original = fs.readFileSync(target);
    try {
        fs.appendFileSync(target, PROBE);

        const bypassed = runGuard({ CLOCKIFY_ALLOW_GENERATED_DIFF: "1" });
        assert.equal(bypassed.status, 0, bypassed.stdout + bypassed.stderr);
        assert.match(bypassed.stdout, /generated edit guard bypassed by CLOCKIFY_ALLOW_GENERATED_DIFF=1/);

        // Any other value must NOT bypass -- "true"/"0"/"" are not the contract.
        for (const value of ["true", "0", ""]) {
            const result = runGuard({ CLOCKIFY_ALLOW_GENERATED_DIFF: value });
            assert.equal(result.status, 1, `bypass wrongly honored for ${JSON.stringify(value)}`);
        }
    } finally {
        fs.writeFileSync(target, original);
    }
});
