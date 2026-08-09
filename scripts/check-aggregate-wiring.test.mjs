// Proves check-support-bundle.mjs's Makefile-wiring check is real: it must
// pass on an unmodified Makefile and fail when `support-bundle` is removed
// from the governance-contracts aggregate prerequisite line.
//
// Runs against an mkdtemp fixture repo, not the tracked Makefile in place:
// the previous version rewrote the real Makefile and restored it in a
// `finally`, but a crash or SIGINT left a dirty tree, and inside the same
// aggregate run docs-drift's `git diff --check` / generated-edit-check would
// then red for the wrong reason (docs/test-wiring-contract.json quarantine,
// resolved 2026-08-07). check-support-bundle.mjs roots every readRel/existsRel
// at process.cwd(), so the fixture needs the Makefile plus every docs/scripts
// file docs/support-bundle-contract.json names; buildBundle() and
// loadRetiredGates() resolve against the REAL repo via import.meta.url and
// are unaffected by the fixture cwd.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts/check-support-bundle.mjs");
const fixtureRoots = [];

const FIXTURE_FILES = [
    "Makefile",
    "docs/support-bundle-contract.json",
    "docs/support-runbook.md",
    "docs/receipt-examples.md",
    "docs/security-threat-model.md",
    "docs/troubleshooting.md",
    "docs/live-tests.md",
    "docs/env-contract.json",
    "docs/error-codes.json",
    "docs/README.md",
    "docs/quality-gates.md",
    "docs/contract-inventory.json",
    "docs/enterprise-hardening-audit.json",
    "scripts/create-support-bundle.mjs",
];

async function fixtureRepository() {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "aggregate-wiring-"));
    fixtureRoots.push(fixtureRoot);
    const repo = path.join(fixtureRoot, "repo");
    await mkdir(repo, { recursive: true });
    for (const relativePath of FIXTURE_FILES) {
        const destination = path.join(repo, relativePath);
        await mkdir(path.dirname(destination), { recursive: true });
        await cp(path.join(root, relativePath), destination);
    }
    return repo;
}

function runChecker(cwd) {
    return spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" });
}

test.after(async () => {
    await Promise.all(fixtureRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

test("check-support-bundle.mjs passes on an unmodified fixture Makefile", async () => {
    const repo = await fixtureRepository();
    const result = runChecker(repo);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("check-support-bundle.mjs fails when support-bundle is removed from governance-contracts", async () => {
    const repo = await fixtureRepository();
    const makefilePath = path.join(repo, "Makefile");
    const original = await readFile(makefilePath, "utf8");
    const mutated = original
        .split("\n")
        .map((line) =>
            line.startsWith("governance-contracts:")
                ? line.replace(/\s+support-bundle(?=\s|$)/, "")
                : line,
        )
        .join("\n");
    assert.notEqual(mutated, original, "test setup: governance-contracts line must contain support-bundle");
    await writeFile(makefilePath, mutated);

    const result = runChecker(repo);
    assert.notEqual(result.status, 0, "checker must fail when support-bundle is removed from governance-contracts");
    assert.match(result.stderr, /governance-audit missing support-bundle/);
});

console.log("ok - aggregate wiring self-check is scoped to governance-audit (mkdtemp fixture)");
