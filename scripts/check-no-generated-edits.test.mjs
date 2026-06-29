import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guard = path.join(root, "scripts", "check-no-generated-edits.mjs");
const PROBE = "\n// __generated_edit_guard_probe__\n";

function runGuard() {
    return spawnSync("node", [guard], { cwd: root, encoding: "utf8" });
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
