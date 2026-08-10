// Structural + textual introspection of the repo's three ESLint flat
// configs (wrapper/eslint.config.js, cli/eslint.config.mjs,
// mcp/eslint.config.mjs). Used by scripts/check-lint-config.mjs.
//
// Two complementary techniques, deliberately kept separate:
//   - STRUCTURAL: dynamic `import()` of the real config module gives the
//     assembled flat-config array exactly as ESLint would see it -- immune
//     to reformatting, key reordering, or comment edits.
//   - TEXTUAL: regex scanning of the raw source finds the rationale comment
//     block that must precede a licensed disable. Structure alone cannot
//     see comments; text alone cannot see the assembled rule state (a
//     spread, a later override, an array-form severity). Neither
//     technique substitutes for the other.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LINT_CONFIGS = [
    { package: "wrapper", path: "wrapper/eslint.config.js" },
    { package: "cli", path: "cli/eslint.config.mjs" },
    { package: "mcp", path: "mcp/eslint.config.mjs" },
];

/** Import a flat-config module and return its default export (an array). */
export async function loadFlatConfig(root, relativePath, importImpl = (specifier) => import(specifier)) {
    const absolute = path.join(root, relativePath);
    const mod = await importImpl(pathToFileURL(absolute).href);
    return mod.default;
}

function severityIsOff(value) {
    if (value === "off" || value === 0) return true;
    return Array.isArray(value) && (value[0] === "off" || value[0] === 0);
}

function severityIsWarn(value) {
    if (value === "warn" || value === 1) return true;
    return Array.isArray(value) && (value[0] === "warn" || value[0] === 1);
}

/**
 * A block is the repo's recognized "test file" blanket exemption when its
 * `files` glob targets the tests directory. These blocks intentionally
 * disable many strictTypeChecked rules at once under one shared rationale
 * (see the config files' own comments) and are not part of the 6-entry
 * licensed-disable allowlist -- accounting for every rule they turn off
 * individually would defeat the allowlist's purpose of catching genuinely
 * new, unreviewed suppressions in hand-written production code.
 */
export function isTestScopeBlock(block) {
    return Array.isArray(block.files) && block.files.some((glob) => glob.includes("tests/**"));
}

/**
 * Walk an assembled flat-config array and return every rule state found in
 * every block's `rules` object, tagged with the block's `files` scope
 * (`null` for an unscoped/global block) and whether the block is the
 * recognized test-file exemption. Pass `skipBlocks` (a Set of block
 * references, see `findContiguousRange`) to exclude blocks that were
 * spread in from a preset (e.g. `tseslint.configs.strictTypeChecked`
 * itself disables several base-ESLint rules superseded by TS equivalents
 * -- those are preset-owned, not a repo-authored suppression, and must
 * not be scanned as one).
 */
export function collectRuleStates(configArray, skipBlocks = new Set()) {
    const states = [];
    for (const block of configArray) {
        if (block == null || typeof block !== "object" || block.rules == null) continue;
        if (skipBlocks.has(block)) continue;
        const scopeFiles = Array.isArray(block.files) ? [...block.files].sort() : null;
        const testScope = isTestScopeBlock(block);
        for (const [rule, value] of Object.entries(block.rules)) {
            states.push({ rule, value, scopeFiles, testScope, off: severityIsOff(value), warn: severityIsWarn(value) });
        }
    }
    return states;
}

/**
 * Find the contiguous run of `configArray` whose elements are, by
 * reference, exactly `needle` (typically `tseslint.configs.strictTypeChecked`).
 * Because a flat config assembles `...tseslint.configs.strictTypeChecked` by
 * spreading the SAME object references into the array, this is a
 * structural (not textual) proof that the preset was not dropped or
 * replaced with a hand-picked subset. Returns `null` if no such run exists.
 */
export function findContiguousRange(configArray, needle) {
    if (!Array.isArray(configArray) || !Array.isArray(needle) || needle.length === 0) return null;
    outer: for (let start = 0; start + needle.length <= configArray.length; start += 1) {
        for (let i = 0; i < needle.length; i += 1) {
            if (configArray[start + i] !== needle[i]) continue outer;
        }
        return new Set(configArray.slice(start, start + needle.length));
    }
    return null;
}

export function containsContiguousReferences(configArray, needle) {
    return findContiguousRange(configArray, needle) !== null;
}

// Lines that open the enclosing block around a single file-scoped rule
// (`files: [...]`, `rules: {`, a bare `{`) carry no rationale of their own
// -- the rationale, when one exists, sits above the block, not above the
// individual rule key. The upward walk in findOffRuleLines skips these so
// it can reach that comment instead of stopping one line too early.
const BLOCK_BOILERPLATE = /^\s*(\{|\}|\},?|files:\s*\[.*\],?|rules:\s*\{)\s*$/;

/**
 * Find every `"<rule>": <off-severity>` declaration's 1-based line number
 * in raw source text, along with the nearest preceding `//` comment block.
 * The walk goes upward from the rule's line, skipping blank lines and
 * block-boilerplate lines (see BLOCK_BOILERPLATE) so a rationale written
 * above a `files: [...]` block-opener (rather than directly above the
 * rule key) is still found; it stops at the first line that is neither
 * blank, boilerplate, nor a `//` comment.
 */
export function findOffRuleLines(sourceText, ruleName) {
    const lines = sourceText.split("\n");
    const escaped = ruleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^\\s*["']${escaped}["']\\s*:`);
    const hits = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (!pattern.test(lines[i])) continue;
        let start = i - 1;
        const commentLines = [];
        while (start >= 0) {
            const line = lines[start];
            if (/^\s*\/\//.test(line)) {
                commentLines.unshift(line);
            } else if (!/^\s*$/.test(line) && !BLOCK_BOILERPLATE.test(line)) {
                break;
            }
            start -= 1;
        }
        hits.push({ line: i + 1, rationaleText: commentLines.join("\n") });
    }
    return hits;
}

export async function readSource(root, relativePath, readImpl = readFile) {
    return readImpl(path.join(root, relativePath), "utf8");
}
