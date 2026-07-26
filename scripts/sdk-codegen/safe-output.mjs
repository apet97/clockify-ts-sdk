// Path-safe, atomic output handling for scripts/generate-sdk-from-openapi.mjs.
// Two output modes only: "canonical" (must resolve under output/, staged and
// swapped atomically) and "ephemeral" (an explicit --out leaf that must not
// already exist, for tests/determinism callers). There is no --unsafe-out.
//
// validateOutputPath never touches the filesystem beyond stat/lstat and
// never throws -- it returns a structured result so callers/tests can
// exercise every rejection path without risking a real deletion.
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const FORBIDDEN_TOP_LEVEL_DIRS = ["wrapper", "cli", "mcp", "spec", "docs", "scripts", ".git", "node_modules"];

function isSymlink(candidatePath) {
    try {
        return fs.lstatSync(candidatePath).isSymbolicLink();
    } catch {
        return false;
    }
}

function isWithin(candidate, parent) {
    return candidate === parent || candidate.startsWith(parent + path.sep);
}

/**
 * Validate a resolved output path for either "canonical" or "ephemeral"
 * mode. Returns { ok: true } or { ok: false, reason }.
 */
export function validateOutputPath(rawPath, { root, inputPath, mode }) {
    if (typeof rawPath !== "string" || rawPath.trim() === "") {
        return { ok: false, reason: "output path must be a non-empty string" };
    }
    if (mode !== "canonical" && mode !== "ephemeral") {
        return { ok: false, reason: `unknown output mode: ${mode}` };
    }

    const resolved = path.resolve(rawPath);
    const rootResolved = path.resolve(root);
    const parentOfRoot = path.dirname(rootResolved);
    const home = path.resolve(os.homedir());
    const fsRoot = path.parse(resolved).root;

    if (resolved === fsRoot) return { ok: false, reason: "output path must not be the filesystem root" };
    if (resolved === rootResolved) return { ok: false, reason: "output path must not be the repository root" };
    if (resolved === parentOfRoot) {
        return { ok: false, reason: "output path must not be the repository's parent directory" };
    }
    if (resolved === home) return { ok: false, reason: "output path must not be the home directory" };
    if (isWithin(rootResolved, resolved) && resolved !== rootResolved) {
        return { ok: false, reason: "output path must not be an ancestor of the repository root" };
    }
    if (inputPath) {
        const inputResolved = path.resolve(inputPath);
        if (isWithin(inputResolved, resolved)) {
            return { ok: false, reason: "output path must not be the input OpenAPI file or one of its ancestors" };
        }
    }

    for (const nested of FORBIDDEN_TOP_LEVEL_DIRS) {
        const forbidden = path.resolve(path.join(rootResolved, nested));
        if (isWithin(resolved, forbidden)) {
            return { ok: false, reason: `output path must not be nested inside ${nested}/` };
        }
    }

    if (isSymlink(resolved)) {
        return { ok: false, reason: "output path must not be a symlink" };
    }
    if (isSymlink(path.dirname(resolved))) {
        return {
            ok: false,
            reason: "output path's parent directory is a symlink and could redirect generation output unexpectedly",
        };
    }

    if (mode === "canonical") {
        const canonicalParent = path.resolve(path.join(rootResolved, "output"));
        if (!isWithin(resolved, canonicalParent)) {
            return { ok: false, reason: "canonical output must be a child of output/" };
        }
        return { ok: true };
    }

    if (fs.existsSync(resolved)) {
        return { ok: false, reason: "explicit --out path already exists" };
    }
    const parentDir = path.dirname(resolved);
    let parentInfo;
    try {
        parentInfo = fs.statSync(parentDir);
    } catch {
        return { ok: false, reason: "explicit --out path's parent directory does not exist" };
    }
    if (!parentInfo.isDirectory()) {
        return { ok: false, reason: "explicit --out path's parent must be a real directory" };
    }
    return { ok: true };
}

/**
 * Generate into a fresh staging directory beside canonicalPath, then
 * atomically swap it into place: rename the existing canonical directory
 * (if any) to a backup, rename staging into canonicalPath, then remove the
 * backup. On any failure after the backup rename, the backup is restored.
 * generateInto(stagingDir) performs the actual generation; injectFailure
 * lets tests force a failure at a specific point without touching real
 * generation.
 */
export async function generateCanonicalAtomically({ canonicalPath, generateInto, verify, injectFailure = {} }) {
    const parent = path.dirname(canonicalPath);
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const staging = path.join(parent, `.${path.basename(canonicalPath)}.staging-${suffix}`);
    const backup = path.join(parent, `.${path.basename(canonicalPath)}.backup-${suffix}`);

    await fsp.rm(staging, { recursive: true, force: true });
    try {
        await generateInto(staging);
        if (injectFailure.afterStaging) {
            throw new Error("injected failure after staging");
        }
        if (verify) await verify(staging);

        const canonicalExists = fs.existsSync(canonicalPath);
        if (canonicalExists) {
            await fsp.rm(backup, { recursive: true, force: true });
            await fsp.rename(canonicalPath, backup);
        }
        if (injectFailure.afterBackup) {
            if (canonicalExists) await fsp.rename(backup, canonicalPath);
            throw new Error("injected failure after backup");
        }
        try {
            await fsp.rename(staging, canonicalPath);
        } catch (error) {
            if (canonicalExists) await fsp.rename(backup, canonicalPath);
            throw error;
        }
        if (canonicalExists) {
            await fsp.rm(backup, { recursive: true, force: true });
        }
    } finally {
        await fsp.rm(staging, { recursive: true, force: true });
    }
}
