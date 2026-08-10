import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ALLOWLIST, runMockExamples } from "./run-mock-examples.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "run-mock-examples.mjs");

test("ALLOWLIST is non-empty and every entry points at a file that exists", async () => {
    assert.ok(ALLOWLIST.length > 0, "ALLOWLIST must not be empty");
    const { existsSync } = await import("node:fs");
    for (const entry of ALLOWLIST) {
        assert.ok(existsSync(path.join(root, entry.file)), `${entry.file} must exist`);
        assert.ok(entry.expectedStdoutIncludes.length > 0, `${entry.id} needs at least one mandatory assertion`);
    }
});

test("runMockExamples() passes every ALLOWLIST entry against a real mock server", async () => {
    const { ok, results } = await runMockExamples();
    assert.equal(ok, true, JSON.stringify(results.filter((r) => !r.ok), null, 2));
    assert.equal(results.length, ALLOWLIST.length);
});

test("CLI invocation (node scripts/run-mock-examples.mjs) exits 0 and reports every example", () => {
    const result = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    for (const entry of ALLOWLIST) {
        assert.match(result.stdout, new RegExp(`ok: ${entry.id}`));
    }
    assert.match(result.stdout, new RegExp(`${ALLOWLIST.length}/${ALLOWLIST.length} mock-safe examples passed\\.`));
});
