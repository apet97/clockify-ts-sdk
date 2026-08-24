import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { evaluateAuditCommand } from "./lib/npm-audit-exceptions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function auditResult(report, overrides = {}) {
    return {
        status: 1,
        signal: null,
        error: undefined,
        stdout: JSON.stringify(report),
        stderr: "",
        ...overrides,
    };
}

test("MCPB audit rejects a parseable npm error envelope", () => {
    const result = evaluateAuditCommand(
        auditResult({ error: { code: "E404", summary: "Not Found" } }),
        { schemaVersion: 1, purpose: "MCPB test", exceptions: [] },
    );
    assert.ok(result.failures.some((failure) => /error envelope/.test(failure)));
    assert.deepEqual(result.observed, []);
});

test("MCPB builder uses the shared fail-closed audit evaluator", () => {
    const source = readFileSync(path.join(root, "scripts", "build-mcpb.mjs"), "utf8");
    assert.match(source, /evaluateAuditCommand/);
    assert.match(source, /const audit = runJson\("npm", \["audit", "--omit=dev", "--json"\]/);
    assert.match(source, /if \(failures\.length > 0\)/);
});

test("MCPB builder stages the governed local dist subset", () => {
    const source = readFileSync(path.join(root, "scripts", "build-mcpb.mjs"), "utf8");
    assert.match(source, /selectMcpbLocalDistEntries/);
    assert.match(source, /validateMcpbLocalDistFiles/);
    assert.match(source, /stageLocalMcpDist\(path\.join\(mcpDir, "dist"\)/);
    assert.doesNotMatch(
        source,
        /cpSync\(path\.join\(mcpDir, "dist"\), path\.join\(bundleDir, "dist"\)/,
    );
});

test("MCPB builder invokes the pinned package through its explicit binary", () => {
    const source = readFileSync(path.join(root, "scripts", "build-mcpb.mjs"), "utf8");
    assert.match(source, /`--package=\$\{MCPB\}`, "mcpb", "pack"/);
});
