#!/usr/bin/env node
// Sync the generated TS SDK from ../output/ts-sdk/ into ./src/, then
// regenerate wrapper/docs/resources/ -- both atomically. Replaces the prior
// rm-rf-then-rsync bash script: a failure partway through the old script
// left wrapper/src empty or half-copied, corrupting the local build tree.
//
// The local generator overwrites the entire output/ts-sdk/ tree on every
// regen, so any package metadata (package.json, tsconfig*.json,
// node_modules, etc.) placed there gets wiped. The wrapper/ layout keeps
// the package metadata in this directory and pulls the generator output
// into src/ at publish time. Re-run after every `make sdk-codegen`, and
// before `npm run build` / `npm publish`.
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { generateCanonicalAtomically } from "../../scripts/sdk-codegen/safe-output.mjs";

const WRAPPER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(WRAPPER_ROOT, "..");
const SDK_OUT = path.join(WRAPPER_ROOT, "..", "output", "ts-sdk");

const EXCLUDED_NAMES = new Set([
    "node_modules",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "codegen-receipt.json",
    ".npmignore",
    ".gitignore",
    ".git",
]);
function isExcludedName(name) {
    if (EXCLUDED_NAMES.has(name)) return true;
    if (name === "tsconfig.json") return true;
    if (name.startsWith("tsconfig.") && name.endsWith(".json")) return true;
    return false;
}

const REQUIRED_ROOT_FILES = ["index.ts", "Client.ts", "BaseClient.ts"];

/**
 * Recursively copy sourceDir into destDir, skipping excluded package-
 * metadata names and never following symlinks (a symlinked entry is
 * reported, not copied). Returns { fileCount, unexpectedSymlinks }.
 */
export async function copyGeneratedTree(sourceDir, destDir) {
    let fileCount = 0;
    const unexpectedSymlinks = [];

    async function walk(srcDir, dstDir) {
        await fsp.mkdir(dstDir, { recursive: true });
        const entries = await fsp.readdir(srcDir, { withFileTypes: true });
        for (const entry of entries) {
            if (isExcludedName(entry.name)) continue;
            const srcPath = path.join(srcDir, entry.name);
            const dstPath = path.join(dstDir, entry.name);
            const info = await fsp.lstat(srcPath);
            if (info.isSymbolicLink()) {
                unexpectedSymlinks.push(path.relative(sourceDir, srcPath));
                continue;
            }
            if (info.isDirectory()) {
                await walk(srcPath, dstPath);
            } else if (info.isFile()) {
                await fsp.copyFile(srcPath, dstPath);
                if (entry.name.endsWith(".ts")) fileCount += 1;
            }
        }
    }

    await walk(sourceDir, destDir);
    return { fileCount, unexpectedSymlinks };
}

/**
 * Independently re-check a staged sync tree on disk (not by trusting the
 * copy step's own bookkeeping for anything a directory listing can answer):
 * every required root file exists, the TypeScript file count is positive,
 * and no excluded package-metadata name is present. unexpectedSymlinks is
 * passed through from the copy step since a skipped symlink, by design,
 * never appears in destDir for a listing to find.
 */
export function validateStagedTree(stagingDir, { unexpectedSymlinks }) {
    const reasons = [];

    for (const required of REQUIRED_ROOT_FILES) {
        if (!fs.existsSync(path.join(stagingDir, required))) {
            reasons.push(`missing required file: ${required}`);
        }
    }

    let fileCount = 0;
    const excludedNamesPresent = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (isExcludedName(entry.name)) {
                excludedNamesPresent.push(path.relative(stagingDir, path.join(dir, entry.name)));
                continue;
            }
            const entryPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(entryPath);
            } else if (entry.isFile() && entry.name.endsWith(".ts")) {
                fileCount += 1;
            }
        }
    }
    walk(stagingDir);

    if (fileCount <= 0) reasons.push("staged tree contains no TypeScript files");
    for (const excluded of excludedNamesPresent) {
        reasons.push(`excluded file/dir present in staged tree: ${excluded}`);
    }
    for (const symlink of unexpectedSymlinks ?? []) {
        reasons.push(`unexpected symlink in generated tree: ${symlink}`);
    }

    return { ok: reasons.length === 0, reasons, fileCount };
}

/**
 * Copy sourceDir into a fresh staging directory beside destDir, validate
 * it, then atomically swap it into destDir via generateCanonicalAtomically.
 * injectFailure.afterCopy forces a post-copy failure for tests, without
 * touching real generation.
 */
export async function syncTreeAtomically({ sourceDir, destDir, injectFailure = {} }) {
    let fileCount = 0;
    await generateCanonicalAtomically({
        canonicalPath: destDir,
        generateInto: async (stagingDir) => {
            const copyResult = await copyGeneratedTree(sourceDir, stagingDir);
            fileCount = copyResult.fileCount;
            if (injectFailure.afterCopy) {
                throw new Error("injected failure after copy");
            }
            const validation = validateStagedTree(stagingDir, { unexpectedSymlinks: copyResult.unexpectedSymlinks });
            if (!validation.ok) {
                throw new Error(`staged sync tree failed validation: ${validation.reasons.join("; ")}`);
            }
        },
        injectFailure,
    });
    return { fileCount };
}

/**
 * Run wrapper/scripts/gen-resource-docs.ts into a staging directory (via
 * --out) and atomically swap it into wrapper/docs/resources -- a crash
 * partway through generation must not leave a mix of stale and fresh
 * per-resource markdown files.
 */
async function regenerateResourceDocsAtomically() {
    const docsDir = path.join(WRAPPER_ROOT, "docs", "resources");
    await generateCanonicalAtomically({
        canonicalPath: docsDir,
        generateInto: (stagingDir) =>
            new Promise((resolve, reject) => {
                execFile(
                    process.execPath,
                    ["--import", "tsx", path.join(WRAPPER_ROOT, "scripts", "gen-resource-docs.ts"), "--out", stagingDir],
                    { cwd: WRAPPER_ROOT },
                    (error, stdout, stderr) => {
                        if (error) {
                            error.stdout = stdout;
                            error.stderr = stderr;
                            reject(error);
                            return;
                        }
                        resolve();
                    },
                );
            }),
    });
}

async function main() {
    if (!fs.existsSync(SDK_OUT)) {
        console.error(`ERROR: generated SDK output not found at ${SDK_OUT}`);
        console.error("Run: make sdk-codegen");
        process.exit(1);
    }

    const { fileCount } = await syncTreeAtomically({ sourceDir: SDK_OUT, destDir: path.join(WRAPPER_ROOT, "src") });
    console.log(`Synced ${fileCount} TypeScript files from ${SDK_OUT} -> ${path.join(WRAPPER_ROOT, "src")}/`);

    console.log("Regenerating per-resource docs...");
    await regenerateResourceDocsAtomically();
    console.log(`Generated docs into ${path.relative(REPO_ROOT, path.join(WRAPPER_ROOT, "docs", "resources"))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
