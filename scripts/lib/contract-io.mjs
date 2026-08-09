// Shared contract-IO helpers for the scripts/check-*.mjs gate family.
//
// Before 2026-08-09, `safeRelativePath` existed as 42 private copies, one per
// checker, so a hardening fix to the path-traversal guard had to propagate 42
// times. The canonical logic lives here now; checkers convert incrementally
// (new checkers must import). The helper is pure — it reports instead of
// failing — because every checker owns its own failure accounting.
import path from "node:path";

/**
 * Validate a repo-relative path from a contract document.
 *
 * Returns `{ path }` with the normalized forward-slash path on success, or
 * `{ error }` with a human-readable reason when the value is empty, absolute,
 * or escapes the repository root. Never throws.
 */
export function normalizeSafeRelativePath(relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        return { error: "must be a non-empty repo-relative path" };
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        return { error: `must not escape the repository root: ${relativePath}` };
    }

    return { path: normalized };
}
