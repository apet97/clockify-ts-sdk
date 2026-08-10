// P1 SDK surface extractor. Reads a package root's own package.json
// `exports` map (NOT a hardcoded subpath list -- a removed/renamed subpath
// is itself part of the surface this differ must catch) and, for each
// subpath's ESM `import.default` target, dynamically imports the compiled
// module and records its named exports.
//
// Deliberately points at compiled `dist/**`, not TypeScript source, on
// BOTH sides of the comparison (the local candidate build and the unpacked
// published tarball) -- the tarball ships only `dist`, `README.md`,
// `LICENSE` (no `docs/`, no `src/`), so using anything but each root's own
// dist would compare two different KINDS of artifact and produce phantom
// deltas. See docs/published-surface-diff-contract.json's `purpose` for the
// symmetry rationale.
//
// Scope: this captures VALUE exports only (what `Object.keys()` on the
// imported module sees at runtime) -- TypeScript `export type`/`export
// interface` declarations are erased at compile time and do not appear
// here. A function or class disappearing is caught; a type-only export
// disappearing is not. That is a real, documented scope boundary, not an
// oversight -- see the contract's `purpose`.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @param {string} packageRoot absolute path to the package root (must
 *   contain package.json and the dist/ tree its exports map points at)
 * @returns {Promise<{ version: string, subpaths: Record<string, string[]> }>}
 *   `subpaths` maps each exports-map key (e.g. ".", "./create-client") to
 *   its sorted list of named export identifiers.
 */
export async function extractSdkSurface(packageRoot) {
    const pkgPath = path.join(packageRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const exportsMap = pkg.exports ?? {};

    const subpaths = {};
    for (const [subpath, target] of Object.entries(exportsMap)) {
        const importTarget =
            target?.import?.default ?? (typeof target === "string" ? target : undefined) ?? target?.default;
        if (typeof importTarget !== "string") {
            // Non-JS or unrecognized export condition shape (e.g. a bare
            // "./package.json" -> "./package.json" entry some packages
            // declare) -- not a code surface, skip rather than fail closed.
            continue;
        }
        const resolved = path.join(packageRoot, importTarget);
        const mod = await import(pathToFileURL(resolved).href);
        subpaths[subpath] = Object.keys(mod).sort();
    }

    return { version: pkg.version, subpaths };
}
