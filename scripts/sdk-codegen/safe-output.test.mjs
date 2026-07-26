import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { generateCanonicalAtomically, validateOutputPath } from "./safe-output.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function withTempDir(run) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "clockify-safe-output-"));
    try {
        await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

test("validateOutputPath rejects the repository root, its parent, and any further ancestor", () => {
    assert.equal(validateOutputPath(repoRoot, { root: repoRoot, mode: "ephemeral" }).ok, false);
    assert.equal(validateOutputPath(path.dirname(repoRoot), { root: repoRoot, mode: "ephemeral" }).ok, false);
    assert.equal(validateOutputPath(path.dirname(path.dirname(repoRoot)), { root: repoRoot, mode: "ephemeral" }).ok, false);
    assert.equal(validateOutputPath(path.join(repoRoot, "."), { root: repoRoot, mode: "ephemeral" }).ok, false);
    assert.equal(validateOutputPath(path.join(repoRoot, ".."), { root: repoRoot, mode: "ephemeral" }).ok, false);
});

test("validateOutputPath rejects the filesystem root and the home directory", () => {
    assert.equal(validateOutputPath(path.parse(repoRoot).root, { root: repoRoot, mode: "ephemeral" }).ok, false);
    assert.equal(validateOutputPath(os.homedir(), { root: repoRoot, mode: "ephemeral" }).ok, false);
});

test("validateOutputPath rejects the whole wrapper, cli, mcp, spec, docs, and scripts top-level directories", () => {
    for (const nested of [
        "wrapper",
        "wrapper/src",
        "wrapper/src/api",
        "cli",
        "mcp",
        "spec",
        "spec/corrected",
        "docs",
        "scripts",
        ".git",
        "node_modules",
    ]) {
        const result = validateOutputPath(path.join(repoRoot, nested), { root: repoRoot, mode: "ephemeral" });
        assert.equal(result.ok, false, `expected ${nested} to be rejected`);
    }
});

test("validateOutputPath rejects the input OpenAPI file's parent directory and any further ancestor", () => {
    const inputPath = path.join(repoRoot, "spec/corrected/clockify.corrected.openapi.yaml");
    assert.equal(
        validateOutputPath(path.dirname(inputPath), { root: repoRoot, mode: "ephemeral", inputPath }).ok,
        false,
    );
    assert.equal(
        validateOutputPath(path.dirname(path.dirname(inputPath)), { root: repoRoot, mode: "ephemeral", inputPath })
            .ok,
        false,
    );
});

test("validateOutputPath (ephemeral) rejects an already-existing explicit path", async () => {
    await withTempDir(async (dir) => {
        const existing = path.join(dir, "already-here");
        fs.mkdirSync(existing);
        const result = validateOutputPath(existing, { root: repoRoot, mode: "ephemeral" });
        assert.equal(result.ok, false);
    });
});

test("validateOutputPath (ephemeral) accepts a fresh non-existing leaf whose parent exists", async () => {
    await withTempDir(async (dir) => {
        const fresh = path.join(dir, "fresh-leaf");
        const result = validateOutputPath(fresh, { root: repoRoot, mode: "ephemeral" });
        assert.equal(result.ok, true, JSON.stringify(result));
    });
});

test("validateOutputPath (ephemeral) rejects a path whose parent does not exist", async () => {
    await withTempDir(async (dir) => {
        const fresh = path.join(dir, "no-such-parent", "leaf");
        const result = validateOutputPath(fresh, { root: repoRoot, mode: "ephemeral" });
        assert.equal(result.ok, false);
    });
});

test("validateOutputPath rejects a symlink leaf", async () => {
    await withTempDir(async (dir) => {
        const real = path.join(dir, "real-target");
        fs.mkdirSync(real);
        const link = path.join(dir, "link-leaf");
        fs.symlinkSync(real, link, "dir");
        const result = validateOutputPath(link, { root: repoRoot, mode: "ephemeral" });
        assert.equal(result.ok, false);
    });
});

test("validateOutputPath rejects an output whose parent directory escapes through a symlink", async () => {
    await withTempDir(async (dir) => {
        const outside = path.join(dir, "outside");
        fs.mkdirSync(outside);
        const linkedParent = path.join(dir, "linked-parent");
        fs.symlinkSync(outside, linkedParent, "dir");
        const leaf = path.join(linkedParent, "leaf");
        const result = validateOutputPath(leaf, { root: dir, mode: "ephemeral" });
        assert.equal(result.ok, false);
    });
});

test("validateOutputPath (canonical) requires the path to be a child of output/", () => {
    const good = path.join(repoRoot, "output", "ts-sdk");
    const bad = path.join(repoRoot, "somewhere-else", "ts-sdk");
    assert.equal(validateOutputPath(good, { root: repoRoot, mode: "canonical" }).ok, true);
    assert.equal(validateOutputPath(bad, { root: repoRoot, mode: "canonical" }).ok, false);
});

test("generateCanonicalAtomically swaps staged content into the canonical path", async () => {
    await withTempDir(async (dir) => {
        const canonicalPath = path.join(dir, "ts-sdk");
        fs.mkdirSync(canonicalPath);
        await writeFile(path.join(canonicalPath, "old-sentinel.txt"), "old");

        await generateCanonicalAtomically({
            canonicalPath,
            generateInto: async (stagingDir) => {
                fs.mkdirSync(stagingDir, { recursive: true });
                await writeFile(path.join(stagingDir, "new-file.txt"), "new");
            },
        });

        assert.equal(fs.existsSync(path.join(canonicalPath, "new-file.txt")), true);
        assert.equal(fs.existsSync(path.join(canonicalPath, "old-sentinel.txt")), false);
        const leftovers = fs.readdirSync(dir);
        assert.deepEqual(leftovers, ["ts-sdk"], `no staging/backup directories should remain: ${leftovers}`);
    });
});

test("generateCanonicalAtomically works when the canonical path does not exist yet", async () => {
    await withTempDir(async (dir) => {
        const canonicalPath = path.join(dir, "ts-sdk");

        await generateCanonicalAtomically({
            canonicalPath,
            generateInto: async (stagingDir) => {
                fs.mkdirSync(stagingDir, { recursive: true });
                await writeFile(path.join(stagingDir, "new-file.txt"), "new");
            },
        });

        assert.equal(fs.existsSync(path.join(canonicalPath, "new-file.txt")), true);
    });
});

test("a failure during generation leaves the prior canonical sentinel intact", async () => {
    await withTempDir(async (dir) => {
        const canonicalPath = path.join(dir, "ts-sdk");
        fs.mkdirSync(canonicalPath);
        await writeFile(path.join(canonicalPath, "old-sentinel.txt"), "old");

        await assert.rejects(
            generateCanonicalAtomically({
                canonicalPath,
                generateInto: async () => {
                    throw new Error("simulated generation failure");
                },
            }),
            /simulated generation failure/,
        );

        assert.equal(fs.existsSync(path.join(canonicalPath, "old-sentinel.txt")), true);
        const leftovers = fs.readdirSync(dir);
        assert.deepEqual(leftovers, ["ts-sdk"], `no staging/backup directories should remain: ${leftovers}`);
    });
});

test("an injected failure during the swap restores the prior canonical content", async () => {
    await withTempDir(async (dir) => {
        const canonicalPath = path.join(dir, "ts-sdk");
        fs.mkdirSync(canonicalPath);
        await writeFile(path.join(canonicalPath, "old-sentinel.txt"), "old");

        await assert.rejects(
            generateCanonicalAtomically({
                canonicalPath,
                generateInto: async (stagingDir) => {
                    fs.mkdirSync(stagingDir, { recursive: true });
                    await writeFile(path.join(stagingDir, "new-file.txt"), "new");
                },
                injectFailure: { afterBackup: true },
            }),
            /injected failure after backup/,
        );

        assert.equal(fs.existsSync(path.join(canonicalPath, "old-sentinel.txt")), true, "backup must be restored");
        assert.equal(fs.existsSync(path.join(canonicalPath, "new-file.txt")), false);
        const leftovers = fs.readdirSync(dir);
        assert.deepEqual(leftovers, ["ts-sdk"], `no staging/backup directories should remain: ${leftovers}`);
    });
});
