import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts/check-mcp-write-safety.mjs");
const manifestPath = path.join(root, "docs/mcp-tool-manifest.json");
const originalManifest = readFileSync(manifestPath, "utf8");

function runGate() {
    return spawnSync(process.execPath, [scriptPath], { cwd: root, encoding: "utf8" });
}

after(() => {
    // Safety net: always restore the committed manifest bytes.
    writeFileSync(manifestPath, originalManifest);
});

test("gate passes on the unmodified repo manifest", () => {
    const result = runGate();
    assert.equal(
        result.status,
        0,
        `expected exit 0, got ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
});

test("gate fails a _delete tool that forgot destructiveHint:true", () => {
    const manifest = JSON.parse(originalManifest);
    manifest.tools.push({
        name: "clockify_zzz_delete",
        title: "Forgotten destructive tool",
        group: "domain",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        destructiveHint: false,
    });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
        const result = runGate();
        assert.notEqual(
            result.status,
            0,
            "expected the gate to FAIL on a forgotten destructiveHint annotation",
        );
        assert.match(result.stderr, /clockify_zzz_delete: must publish risk destructive/);
    } finally {
        writeFileSync(manifestPath, originalManifest);
    }
});

test("gate fails when runtime risk metadata is missing or inconsistent", () => {
    const manifest = JSON.parse(originalManifest);
    const tool = manifest.tools.find((entry) => entry.name === "clockify_approvals_list");
    tool.risk = "routine_write";
    tool.confirmation = "preview_token";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
        const result = runGate();
        assert.notEqual(result.status, 0, "expected the gate to reject inconsistent risk metadata");
        assert.match(result.stderr, /clockify_approvals_list/);
        assert.match(result.stderr, /risk|confirmation/i);
    } finally {
        writeFileSync(manifestPath, originalManifest);
    }
});
