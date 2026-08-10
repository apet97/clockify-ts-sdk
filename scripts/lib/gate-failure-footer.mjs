// Shared success/failure footer for the scripts/check-*.mjs gate family,
// living beside contract-io.mjs and riding its opportunistic-conversion
// convention: checkers adopt one at a time, new checkers must import (R2).
//
// The success footer exists because of a real failure class: a checker that
// dies mid-run (e.g. ENOSPC) can leave a truncated or entirely missing
// stdout, and a terse ad hoc success line ("X passed") looks identical to a
// genuine clean pass either way. Printing an explicit, checker-owned count on
// every success run turns "missing or short footer" into a detectable
// signal instead of a guess -- the "all-green with no test summary" trap
// this repo has already been bitten by once.
//
// The failure footer exists because most checkers, before adopting this,
// printed the defect list and stopped: no re-run hint, no contract path.
// Both are cheap and someone reading a red CI log always needs them.

/**
 * Print the failure footer and exit 1: the defect list, a re-run hint, and
 * the governing contract path. Call this in place of a bespoke
 * `console.error` + `process.exit(1)` block.
 *
 * @param {object} options
 * @param {string} options.label - what failed, e.g. "docs counts contract"
 * @param {string[]} options.failures - one message per defect
 * @param {string} options.makeTarget - the Make target that runs this checker
 * @param {string} [options.contractPath] - the JSON/doc this checker enforces
 */
export function reportGateFailure({ label, failures, makeTarget, contractPath }) {
    console.error(`${label} failed:`);
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`re-run: make ${makeTarget}`);
    if (contractPath) console.error(`contract: ${contractPath}`);
    process.exit(1);
}

/**
 * Print the success footer: an explicit count of checks executed, zero
 * failures, and the re-run target. A checker that dies mid-run produces a
 * visibly missing or short footer instead of looking identical to a clean
 * pass.
 *
 * @param {object} options
 * @param {number} options.checksExecuted - a checker-owned count; any stable
 *   measure of how much this run actually covered (assertions, files, rows)
 * @param {string} options.makeTarget - the Make target that runs this checker
 * @param {string} [options.extra] - optional detail appended in parentheses
 */
export function reportGateSuccess({ checksExecuted, makeTarget, extra }) {
    const suffix = extra ? ` (${extra})` : "";
    console.log(`${checksExecuted} checks executed, 0 failures${suffix} -- re-run: make ${makeTarget}`);
}
