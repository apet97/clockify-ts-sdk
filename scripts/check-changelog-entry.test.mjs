import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts", "check-changelog-entry.mjs");

function git(cwd, args) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
}

function runChecker(cwd, baseRef) {
    return spawnSync(process.execPath, [checker], {
        cwd,
        encoding: "utf8",
        env: { ...process.env, CHANGELOG_BASE_REF: baseRef },
    });
}

async function makeRepo() {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clockify-changelog-test-"));
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["config", "user.email", "test@example.com"]);
    git(dir, ["config", "user.name", "Test"]);
    await mkdir(path.join(dir, "cli", "src"), { recursive: true });
    await writeFile(path.join(dir, "README.md"), "base\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", "base"]);
    const base = git(dir, ["rev-parse", "HEAD"]);
    return { dir, base };
}

test("committed source change without a changelog entry fails against the base ref", async () => {
    const { dir, base } = await makeRepo();
    try {
        await writeFile(path.join(dir, "cli", "src", "probe.ts"), "export const x = 1;\n");
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-q", "-m", "touch cli"]);
        const result = runChecker(dir, base);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(
            result.stderr,
            /cli: user-visible package files changed but cli\/CHANGELOG\.md did not/,
        );
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("committed source change with a changelog entry passes against the base ref", async () => {
    const { dir, base } = await makeRepo();
    try {
        await writeFile(path.join(dir, "cli", "src", "probe.ts"), "export const x = 1;\n");
        await writeFile(path.join(dir, "cli", "CHANGELOG.md"), "## [Unreleased]\n");
        git(dir, ["add", "-A"]);
        git(dir, ["commit", "-q", "-m", "touch cli + changelog"]);
        const result = runChecker(dir, base);
        assert.equal(result.status, 0, result.stdout + result.stderr);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("clean tree with no base ref stays green (local pre-commit behaviour preserved)", () => {
    const result = spawnSync(process.execPath, [checker], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, CHANGELOG_BASE_REF: "", GITHUB_BASE_REF: "", GITHUB_EVENT_BEFORE: "" },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
});
