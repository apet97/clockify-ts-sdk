// Proves check-mcp-write-safety.mjs's own annotation checks are real: it
// must pass on the unmodified manifest and fail when a manifest is mutated
// to forget a destructiveHint or carry inconsistent risk metadata.
//
// Points MCP_WRITE_SAFETY_MANIFEST at a mutated copy instead of rewriting the
// tracked docs/mcp-tool-manifest.json in place: the previous version wrote
// the real file and restored it with a `writeFileSync` safety net, but a
// crash or SIGINT before that ran left a dirty tracked file, which docs-
// drift's `git diff --check` / generated-edit-check would then red for the
// wrong reason (docs/test-wiring-contract.json quarantine, resolved
// 2026-08-07). check-mcp-write-safety.mjs already honors
// MCP_WRITE_SAFETY_MANIFEST as an override (repo-relative only --
// safeRelativePath rejects absolute paths and `..` traversal), resolved
// against the real repo root via import.meta.url regardless of cwd. Writing
// the mutated fixture into scripts/live/.manifest-work/ (already gitignored
// as "local scratch only") means a crash leaves only an untracked file no
// git-diff gate reds on.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = path.join(root, "scripts/check-mcp-write-safety.mjs");
const originalManifest = readFileSync(path.join(root, "docs/mcp-tool-manifest.json"), "utf8");

const workDir = "scripts/live/.manifest-work";
const fixtureRelPath = `${workDir}/write-safety-test-manifest.json`;
const fixtureAbsPath = path.join(root, fixtureRelPath);
mkdirSync(path.join(root, workDir), { recursive: true });

after(() => {
    rmSync(fixtureAbsPath, { force: true });
});

function runGate(manifest) {
    writeFileSync(fixtureAbsPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return spawnSync(process.execPath, [scriptPath], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, MCP_WRITE_SAFETY_MANIFEST: fixtureRelPath },
    });
}

test("gate passes on the unmodified repo manifest (via the override path)", () => {
    const result = runGate(JSON.parse(originalManifest));
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
    const result = runGate(manifest);
    assert.notEqual(
        result.status,
        0,
        "expected the gate to FAIL on a forgotten destructiveHint annotation",
    );
    assert.match(result.stderr, /clockify_zzz_delete: must publish risk destructive/);
});

test("gate derives counts from the manifest instead of a hand-typed copy", () => {
    // Before 2026-08-09 the counts lived in docs/mcp-write-safety-contract.json
    // and every tool addition hand-moved them in lockstep. A consistently
    // changed manifest (one read tool removed, summary recounted) must now
    // pass: the manifest is the count source, and exactness is anchored in
    // mcp/tests. This test fails against the old hand-copy design.
    const manifest = JSON.parse(originalManifest);
    const index = manifest.tools.findIndex((entry) => entry.risk === "read");
    const [removed] = manifest.tools.splice(index, 1);
    manifest.summary.totalTools -= 1;
    manifest.summary.riskDistribution.read -= 1;
    if (removed.group === "workflow") manifest.summary.workflowTools -= 1;
    else manifest.summary.domainTools -= 1;
    const result = runGate(manifest);
    assert.equal(
        result.status,
        0,
        `expected the gate to follow the manifest, got ${result.status}\nSTDERR:\n${result.stderr}`,
    );
});

test("gate fails when the manifest summary disagrees with its own tool rows", () => {
    const manifest = JSON.parse(originalManifest);
    manifest.summary.guardedTools += 1;
    const result = runGate(manifest);
    assert.notEqual(result.status, 0, "expected the gate to reject a padded summary count");
    assert.match(result.stderr, /guardedTools/);
});

test("gate fails when runtime risk metadata is missing or inconsistent", () => {
    const manifest = JSON.parse(originalManifest);
    const tool = manifest.tools.find((entry) => entry.name === "clockify_approvals_list");
    tool.risk = "routine_write";
    tool.confirmation = "preview_token";
    const result = runGate(manifest);
    assert.notEqual(result.status, 0, "expected the gate to reject inconsistent risk metadata");
    assert.match(result.stderr, /clockify_approvals_list/);
    assert.match(result.stderr, /risk|confirmation/i);
});
