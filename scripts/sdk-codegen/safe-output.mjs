// Path-safe output validation for scripts/generate-sdk-from-openapi.mjs.
// Two output modes only: "canonical" (must resolve under output/) and
// "ephemeral" (an explicit --out leaf that must not already exist, for
// tests/determinism callers). There is no --unsafe-out.
//
// validateOutputPath never touches the filesystem beyond stat/lstat and
// never throws -- it returns a structured result so callers/tests can
// exercise every rejection path without risking a real deletion.
import fs from "node:fs";
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
