import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts/check-version-consistency.mjs");

function runStagedScript(stagedRoot) {
    return new Promise((resolve) => {
        execFile(
            process.execPath,
            [path.join(stagedRoot, "scripts/check-version-consistency.mjs")],
            (error, stdout, stderr) => {
                resolve({
                    code: error && typeof error.code === "number" ? error.code : 0,
                    stdout,
                    stderr,
                });
            },
        );
    });
}

async function stageRoot(versionPolicy, releaseManifest) {
    const stagedRoot = await mkdtemp(path.join(os.tmpdir(), "clockify-vc-test-"));
    await mkdir(path.join(stagedRoot, "scripts"), { recursive: true });
    await mkdir(path.join(stagedRoot, "docs"), { recursive: true });
    await copyFile(script, path.join(stagedRoot, "scripts/check-version-consistency.mjs"));
    await writeFile(
        path.join(stagedRoot, "docs/version-policy.json"),
        JSON.stringify(versionPolicy),
    );
    await writeFile(
        path.join(stagedRoot, ".release-please-manifest.json"),
        JSON.stringify(releaseManifest),
    );
    for (const id of ["wrapper", "cli", "mcp"]) {
        await mkdir(path.join(stagedRoot, id), { recursive: true });
        await writeFile(
            path.join(stagedRoot, id, "package.json"),
            JSON.stringify({ version: "0.9.0" }),
        );
    }
    return stagedRoot;
}

const packages = [
    { id: "wrapper", manifest: "wrapper/package.json" },
    { id: "cli", manifest: "cli/package.json" },
    { id: "mcp", manifest: "mcp/package.json" },
];

test("fails when manifestKeyForReleasePlease is not a configured package id", async () => {
    const stagedRoot = await stageRoot(
        {
            versionConsistency: {
                releasePleaseManifest: ".release-please-manifest.json",
                manifestKeyForReleasePlease: ".",
                packages,
            },
        },
        { ".": "9.9.9" },
    );
    try {
        const result = await runStagedScript(stagedRoot);
        assert.equal(result.code, 1);
        assert.match(
            result.stderr,
            /manifestKeyForReleasePlease "\." is not one of the configured package ids/,
        );
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});

test("passes when manifestKeyForReleasePlease is a configured package id and tracks it", async () => {
    const stagedRoot = await stageRoot(
        {
            versionConsistency: {
                releasePleaseManifest: ".release-please-manifest.json",
                manifestKeyForReleasePlease: "wrapper",
                packages,
            },
        },
        { wrapper: "0.9.0" },
    );
    try {
        const result = await runStagedScript(stagedRoot);
        assert.equal(result.code, 0);
        assert.match(result.stdout, /release-please manifest in sync/);
    } finally {
        await rm(stagedRoot, { recursive: true, force: true });
    }
});
