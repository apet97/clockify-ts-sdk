// Tests for scripts/create-naive-subject-install.mjs.
//
// The critical property this harness exists to prove is that the installed
// scratch directory OUTLIVES the process that created it -- a naive-subject
// install that gets deleted before a fresh session ever sees it is a
// silently useless harness. So this suite invokes the script as a REAL
// subprocess (spawnSync), waits for it to fully exit, and only THEN checks
// the filesystem -- checking from inside the process (or from a `finally`
// in the same process) would not catch a premature cleanup.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "create-naive-subject-install.mjs");

const EXPECTED_PACKAGES = [
    "clockify-sdk-ts-115",
    path.join("@apet97", "clockify-cli-115"),
    path.join("@apet97", "clockify-mcp-115"),
];

test("prints an installed directory that survives after the process exits, with all three packages present", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const lines = result.stdout.trim().split("\n");
    const dir = lines[lines.length - 1];
    assert.ok(path.isAbsolute(dir), `printed path must be absolute, got ${JSON.stringify(dir)}`);

    try {
        // The process has already exited (spawnSync only returns after
        // that) -- this is checking POST-exit filesystem state, not
        // in-process state.
        assert.ok(fs.existsSync(dir), `${dir} must still exist after the process exits`);
        for (const pkg of EXPECTED_PACKAGES) {
            const pkgDir = path.join(dir, "node_modules", pkg);
            assert.ok(fs.existsSync(pkgDir), `${pkgDir} must exist`);
            assert.ok(
                fs.existsSync(path.join(pkgDir, "package.json")),
                `${pkgDir}/package.json must exist`,
            );
            assert.ok(
                fs.existsSync(path.join(pkgDir, "dist")),
                `${pkgDir}/dist must exist -- an unbuilt/broken install would fail here`,
            );
        }

        // The packed .tgz files are intermediate, not the deliverable --
        // confirm they were cleaned up from the package source directories.
        for (const pkgDir of ["wrapper", "cli", "mcp"]) {
            const leftovers = fs
                .readdirSync(path.join(root, pkgDir))
                .filter((name) => name.endsWith(".tgz"));
            assert.deepEqual(leftovers, [], `${pkgDir} must have no leftover .tgz files`);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
