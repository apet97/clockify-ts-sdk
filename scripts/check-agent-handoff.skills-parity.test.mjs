// Guards the skills-parity half of check-agent-handoff.mjs: the skills on
// disk under .claude/skills/, the names AGENTS.md claims, and the contract's
// guidanceScanPaths must agree in both directions. Before this check, a
// typo'd or dropped name in AGENTS.md — or a new skill never documented —
// passed silently; only a missing SKILL.md file went red.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { appendFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "check-agent-handoff.mjs");

async function createFixture() {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-agent-handoff-"));
    const contract = JSON.parse(await readFile(path.join(root, "docs", "agent-handoff-contract.json"), "utf8"));
    const files = new Set([
        "docs/agent-handoff-contract.json",
        contract.policyDocument.path,
        ...(contract.guidance ?? []).map((entry) => entry.path),
        ...(contract.supportingChecks ?? []).map((entry) => entry.path),
        ...(contract.guidanceScanPaths ?? []),
        "docs/README.md",
        "docs/quality-gates.md",
        "docs/contract-inventory.json",
        "docs/enterprise-hardening-audit.json",
    ]);
    files.delete("Makefile");
    for (const relative of files) {
        const target = path.join(fixtureRoot, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.join(root, relative), target);
    }
    await cp(path.join(root, contract.skillsParity.directory), path.join(fixtureRoot, contract.skillsParity.directory), {
        recursive: true,
    });
    await writeFile(
        path.join(fixtureRoot, "Makefile"),
        "governance-audit: agent-handoff\nagent-handoff:\n\tnode scripts/check-agent-handoff.mjs\n",
    );
    return fixtureRoot;
}

async function runFixture(fixtureRoot) {
    return new Promise((resolve) => {
        execFile("node", [script, "--root", fixtureRoot], { cwd: fixtureRoot }, (error, stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stdout, stderr });
        });
    });
}

async function withFixture(mutator) {
    const fixtureRoot = await createFixture();
    try {
        await mutator(fixtureRoot);
        return await runFixture(fixtureRoot);
    } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
    }
}

test("agent-handoff accepts the current skills parity", async () => {
    const result = await withFixture(async () => {});
    assert.equal(result.code, 0, result.stderr);
});

test("agent-handoff rejects a renamed skill directory in both directions", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const skills = path.join(fixtureRoot, ".claude", "skills");
        await rename(path.join(skills, "clockify-sdk-verify"), path.join(skills, "clockify-sdk-verify-renamed"));
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not name the skill clockify-sdk-verify-renamed/);
    assert.match(result.stderr, /names the skill clockify-sdk-verify, but/);
});

test("agent-handoff rejects a documented skill name with no directory behind it", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        await appendFile(path.join(fixtureRoot, "AGENTS.md"), "\nAlso see `clockify-sdk-nonexistent`.\n");
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /names the skill clockify-sdk-nonexistent, but/);
});

test("agent-handoff rejects a new on-disk skill absent from AGENTS.md and guidanceScanPaths", async () => {
    const result = await withFixture(async (fixtureRoot) => {
        const skill = path.join(fixtureRoot, ".claude", "skills", "clockify-sdk-scratch");
        await mkdir(skill, { recursive: true });
        await writeFile(path.join(skill, "SKILL.md"), "# scratch\n");
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /does not name the skill clockify-sdk-scratch/);
    assert.match(result.stderr, /guidanceScanPaths: missing \.claude\/skills\/clockify-sdk-scratch\/SKILL\.md/);
});
