// P1: pure diff + bump-class policy engine for the published-vs-candidate
// surface differ. No I/O here -- deliberately separated from the per-module
// extractors (extract-sdk-surface.mjs / extract-cli-surface.mjs /
// extract-mcp-surface.mjs) and the network-touching orchestrator (run.mjs)
// so this half is unit-testable offline and fast, mirroring
// scripts/lib/wiring-contract.mjs's split from scripts/check-test-wiring.mjs.

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse a clean "X.Y.Z" version string. Throws on anything else (a
 *  pre-release/build-metadata tag, "latest", or malformed input) -- this
 *  differ only ever compares two package.json `version` fields, which this
 *  repo's own version-consistency gate already requires to be clean semver
 *  (scripts/check-version-consistency.mjs), so a non-matching string here
 *  means something upstream is already broken and this should fail loud
 *  rather than guess. */
export function parseSemver(version) {
    const match = SEMVER_RE.exec(String(version ?? ""));
    if (!match) {
        throw new Error(`parseSemver: not a clean "X.Y.Z" version: ${JSON.stringify(version)}`);
    }
    const [, major, minor, patch] = match;
    return { major: Number(major), minor: Number(minor), patch: Number(patch) };
}

/**
 * Classify the step from `publishedVersion` to `candidateVersion` as
 * "major" | "minor" | "patch" | "none" | "downgrade". "none" means the two
 * versions are identical; "downgrade" means the candidate's version sorts
 * BEFORE the published one, which should never legitimately happen and is
 * always treated as a policy violation regardless of any surface delta.
 */
export function deriveBumpClass(publishedVersion, candidateVersion) {
    const p = parseSemver(publishedVersion);
    const c = parseSemver(candidateVersion);
    if (c.major > p.major) return "major";
    if (c.major < p.major) return "downgrade";
    if (c.minor > p.minor) return "minor";
    if (c.minor < p.minor) return "downgrade";
    if (c.patch > p.patch) return "patch";
    if (c.patch < p.patch) return "downgrade";
    return "none";
}

/**
 * Set-difference two string arrays. Returns `{ added, removed }` relative to
 * `publishedItems` -- `added` is present in `candidateItems` but not
 * `publishedItems`; `removed` is the reverse. Both are sorted for
 * deterministic output.
 */
export function diffItems(publishedItems, candidateItems) {
    const publishedSet = new Set(publishedItems);
    const candidateSet = new Set(candidateItems);
    const added = [...candidateSet].filter((item) => !publishedSet.has(item)).sort();
    const removed = [...publishedSet].filter((item) => !candidateSet.has(item)).sort();
    return { added, removed };
}

/**
 * Policy: what surface deltas are allowed at each bump class, applied
 * uniformly across every module (SDK subpaths, SDK per-subpath symbols, CLI
 * commands, MCP tools) and aggregated into one verdict. Standard public-API
 * semver discipline:
 *   - "downgrade" or "none" with any delta: always BLOCKED (a version that
 *     did not move forward must not carry ANY surface change -- you cannot
 *     legitimately republish the same version with different content).
 *   - "patch": BLOCKED if added.length > 0 OR removed.length > 0 (patch
 *     releases are bug fixes only; no surface change is a "patch" purely by
 *     the appearance of the version number, so any delta at all means the
 *     version bump under-states what actually changed).
 *   - "minor": BLOCKED if removed.length > 0 (removing anything is
 *     backward-incompatible by definition); additions are fine.
 *   - "major": never blocked by this policy (major is the explicit escape
 *     valve for breaking changes).
 *
 * `deltas` is `[{ module, kind, added, removed }, ...]` (one entry per
 * surface compared: e.g. one SDK-subpath-list entry, N SDK-per-subpath
 * entries, one CLI-commands entry, one MCP-tools entry). Returns
 * `{ blocked, bumpClass, violations }` where `violations` is a flat list of
 * human-readable reasons, empty iff `blocked` is false.
 */
export function evaluatePolicy({ bumpClass, deltas }) {
    const violations = [];

    if (bumpClass === "downgrade") {
        violations.push(
            "candidate version is lower than (or precedes) the published version -- refusing to evaluate a downgrade.",
        );
    }

    for (const delta of deltas) {
        const { module, kind, added, removed } = delta;
        const label = `${module}/${kind}`;
        if (bumpClass === "none" && (added.length > 0 || removed.length > 0)) {
            violations.push(
                `${label}: candidate version equals the published version but the surface differs ` +
                    `(added: [${added.join(", ")}], removed: [${removed.join(", ")}]). ` +
                    "The version must move forward whenever the surface changes.",
            );
        } else if (bumpClass === "patch") {
            if (removed.length > 0) {
                violations.push(`${label}: patch bump removes [${removed.join(", ")}] -- requires a major bump.`);
            }
            if (added.length > 0) {
                violations.push(`${label}: patch bump adds [${added.join(", ")}] -- requires at least a minor bump.`);
            }
        } else if (bumpClass === "minor" && removed.length > 0) {
            violations.push(`${label}: minor bump removes [${removed.join(", ")}] -- requires a major bump.`);
        }
        // "major" bump class: no restriction. "downgrade" already reported once above.
    }

    return { blocked: violations.length > 0, bumpClass, violations };
}
