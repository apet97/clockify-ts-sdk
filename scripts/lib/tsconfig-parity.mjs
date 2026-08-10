// Structural introspection of the repo's tsconfig files, used by
// scripts/check-tsconfig-parity.mjs. All committed tsconfig*.json files in
// this repo are plain JSON (no comments, no trailing commas), so a plain
// JSON.parse is sufficient -- no jsonc parser needed.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export async function loadTsconfig(root, relativePath, readImpl = readFile) {
    const text = await readImpl(path.join(root, relativePath), "utf8");
    return JSON.parse(text);
}

/** Find every tsconfig*.json file directly inside the given package directories (non-recursive: this repo keeps them flat per package). */
export async function discoverTsconfigs(root, packageDirs, readdirImpl = readdir) {
    const found = [];
    for (const dir of packageDirs) {
        const entries = await readdirImpl(path.join(root, dir), { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && /^tsconfig.*\.json$/.test(entry.name)) {
                found.push(path.posix.join(dir, entry.name));
            }
        }
    }
    return found.sort();
}

/** Compare a required flag's value across configs; returns a list of {package, expected, actual} mismatches (empty when all match). */
export function checkRequiredFlags(configsByPackage, requiredFlags) {
    const mismatches = [];
    for (const [flag, expected] of Object.entries(requiredFlags)) {
        for (const [packageName, config] of Object.entries(configsByPackage)) {
            const actual = config.compilerOptions?.[flag];
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                mismatches.push({ flag, packageName, expected, actual });
            }
        }
    }
    return mismatches;
}

/** Compare a declared allowedDiffs entry's per-package expected values against the actual configs; returns mismatches (empty when the declaration is honest). */
export function checkAllowedDiffs(configsByPackage, allowedDiffs) {
    const mismatches = [];
    for (const [flag, declaration] of Object.entries(allowedDiffs)) {
        for (const packageName of Object.keys(configsByPackage)) {
            if (!Object.prototype.hasOwnProperty.call(declaration.values, packageName)) continue;
            const expected = declaration.values[packageName];
            const actual = configsByPackage[packageName].compilerOptions?.[flag] ?? null;
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                mismatches.push({ flag, packageName, expected, actual });
            }
        }
    }
    return mismatches;
}
