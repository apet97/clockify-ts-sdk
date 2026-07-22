/**
 * Pure helpers for inspecting the `perfect-full` make target's prerequisite list.
 *
 * The mutation-CI contract checker must reject a local Stryker `mutation`
 * prerequisite on `perfect-full`. The canonical verify plan owns the
 * `mutation-ci` wiring step and the full aggregate order; Make prerequisites are
 * only an additional setup surface. A space-delimited substring test misses a
 * trailing-position `mutation` token (no trailing space — .editorconfig trims it
 * on the Makefile), so these helpers tokenize on whitespace and compare exact
 * tokens instead. Multi-segment `mutation-ci` and `mutation-safety` tokens remain
 * safe if a fixture or future setup rule contains them.
 */

/**
 * Split a `target: a b c` make rule line into its prerequisite tokens.
 * Returns an empty array when the target has no prerequisites.
 * @param {string} perfectFullLine
 * @returns {string[]}
 */
export function parsePerfectFullPrereqs(perfectFullLine) {
    const afterColon = perfectFullLine.slice(perfectFullLine.indexOf(":") + 1).trim();
    return afterColon.length === 0 ? [] : afterColon.split(/\s+/);
}

/**
 * True when the local Stryker `mutation` target is an exact prerequisite token.
 * The multi-segment tokens `mutation-ci` and `mutation-safety` never match.
 * @param {string} perfectFullLine
 * @returns {boolean}
 */
export function perfectFullRunsLocalMutation(perfectFullLine) {
    return parsePerfectFullPrereqs(perfectFullLine).includes("mutation");
}
