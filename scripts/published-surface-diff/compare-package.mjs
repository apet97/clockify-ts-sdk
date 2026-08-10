// P1: builds the `deltas` array evaluatePolicy() consumes from one
// package's already-extracted candidate and published surfaces. Pure (no
// I/O) and separated from the extractors so the SDK's two-level
// (subpath-list + per-subpath-symbols) shape is unit-testable with plain
// object fixtures.
import { diffItems } from "./diff-engine.mjs";

/**
 * SDK surfaces are two-level: the subpath list itself, plus each subpath's
 * named exports. A subpath present on only one side is reported ONCE, in
 * the subpath-list delta -- its symbols are deliberately NOT also
 * enumerated as a second, redundant per-symbol delta for the same removal.
 * Only subpaths present on BOTH sides get a per-subpath symbol delta.
 */
function buildSdkDeltas(published, candidate) {
    const deltas = [];
    const subpathDiff = diffItems(Object.keys(published.subpaths), Object.keys(candidate.subpaths));
    deltas.push({ module: "sdk", kind: "subpaths", ...subpathDiff });

    const sharedSubpaths = Object.keys(candidate.subpaths)
        .filter((subpath) => subpath in published.subpaths)
        .sort();
    for (const subpath of sharedSubpaths) {
        const symbolDiff = diffItems(published.subpaths[subpath], candidate.subpaths[subpath]);
        if (symbolDiff.added.length > 0 || symbolDiff.removed.length > 0) {
            deltas.push({ module: "sdk", kind: `subpath ${subpath}`, ...symbolDiff });
        }
    }
    return deltas;
}

/**
 * @param {"sdk"|"cli"|"mcp"} id
 * @param {object} published extractor output for the published tarball
 * @param {object} candidate extractor output for the local candidate build
 * @returns {Array<{module: string, kind: string, added: string[], removed: string[]}>}
 */
export function buildDeltas(id, published, candidate) {
    if (id === "sdk") return buildSdkDeltas(published, candidate);
    if (id === "cli") return [{ module: "cli", kind: "commands", ...diffItems(published.commands, candidate.commands) }];
    if (id === "mcp") return [{ module: "mcp", kind: "tools", ...diffItems(published.tools, candidate.tools) }];
    throw new Error(`buildDeltas: unknown package id ${JSON.stringify(id)}`);
}
