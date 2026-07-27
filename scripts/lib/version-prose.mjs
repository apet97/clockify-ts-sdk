// Derived version-prose contract.
//
// Counts already have a derived gate: `liveSuccessProse` in
// docs-counts-contract.json recomputes `135/169` from the corrected spec and
// reds until the prose agrees. Versions had no such gate, and the result was
// exactly the rot you would predict -- `wrapper/README.md` sat at `0.12.2`
// through two releases, and `cli/README.md` advertised a `>=0.12.0 <1` peer
// range after the SDK had moved to `>=0.13.0 <1`.
//
// The old `installExampleMustContain` looked like coverage but was not: it
// asserted the *literal* string "clockify-sdk-ts-115-<version>.tgz", which is
// a placeholder that never changes, so `readme.includes(...)` was tautological.
//
// This module derives the truth from the package manifests and checks the
// prose two ways. Both directions are needed:
//
//   AFFIRM  at least `minMatches` occurrences of the labelled shape exist.
//           Catches a doc that dropped the claim, or a label that was reworded
//           out from under the gate.
//   DENY    every occurrence equals the derived value. Affirmation alone is
//           not enough: once `cli/README.md:7` was fixed the file *contained*
//           the right string, and the stale `>=0.12.0 <1` at line 225 would
//           have survived untouched.
//
// Each pattern is anchored to its literal label ("Current release: `...`",
// "the SDK is `...`") rather than matching bare versions anywhere in the file.
// A bare-version regex would red on legitimate release-artifact references
// such as `mcp/README.md`'s `mcp-v0.7.0` download URLs and the
// `clockify115-mcp-0.7.0.mcpb` filename, and the next agent would weaken the
// gate to shut it up.

const SDK_PACKAGE = "clockify-sdk-ts-115";

/**
 * Resolve the value a rule asserts, straight from the package manifest.
 * `version` and `peerRange` come from different manifest fields on purpose --
 * the CLI and MCP peer ranges are what went stale, and they are not derivable
 * from the package's own version.
 */
export function deriveValue(derive, manifest) {
    if (derive === "version") return manifest?.version;
    if (derive === "peerRange") return manifest?.peerDependencies?.[SDK_PACKAGE];
    return undefined;
}

/**
 * Pure evaluation. Takes already-read inputs so the test can exercise every
 * branch without touching a tracked README -- the same discipline the
 * quarantined gate self-tests violate.
 *
 * @param {object} input
 * @param {Array} input.rules      contract rules
 * @param {object} input.manifests packageId -> parsed package.json
 * @param {object} input.docs      doc path -> file contents
 * @returns {string[]} failure messages, empty when the prose is current
 */
export function evaluateVersionProse({ rules, manifests, docs }) {
    const failures = [];
    for (const rule of rules ?? []) {
        const manifest = manifests?.[rule.packageId];
        if (!manifest) {
            failures.push(`${rule.id}: unknown packageId ${JSON.stringify(rule.packageId)}`);
            continue;
        }

        const expected = deriveValue(rule.derive, manifest);
        if (typeof expected !== "string" || expected.length === 0) {
            failures.push(
                `${rule.id}: cannot derive ${rule.derive} for package ${rule.packageId}` +
                    (rule.derive === "peerRange" ? ` (no peerDependencies["${SDK_PACKAGE}"])` : ""),
            );
            continue;
        }

        const text = docs?.[rule.doc];
        if (typeof text !== "string") {
            failures.push(`${rule.id}: ${rule.doc} is missing`);
            continue;
        }

        let matcher;
        try {
            matcher = new RegExp(rule.pattern, "g");
        } catch (cause) {
            failures.push(`${rule.id}: invalid pattern ${JSON.stringify(rule.pattern)} (${cause.message})`);
            continue;
        }

        const found = [];
        for (const match of text.matchAll(matcher)) {
            if (match.length < 2) {
                failures.push(`${rule.id}: pattern must have exactly one capture group`);
                break;
            }
            found.push(match[1]);
        }

        const minMatches = rule.minMatches ?? 1;
        if (found.length < minMatches) {
            failures.push(
                `${rule.id}: ${rule.doc} states the ${rule.derive} ${found.length} time(s), expected at least ` +
                    `${minMatches} -- the labelled prose is missing or was reworded away from the gate`,
            );
            continue;
        }

        // Deny: no occurrence may disagree with the manifest.
        found.forEach((actual, index) => {
            if (actual !== expected) {
                failures.push(
                    `${rule.id}: ${rule.doc} occurrence ${index + 1} says ${rule.derive} ${JSON.stringify(actual)}, ` +
                        `manifest says ${JSON.stringify(expected)}`,
                );
            }
        });
    }
    return failures;
}

/**
 * Shape validation. Mirrors the repo's `expected*Count` convention so adding
 * or removing a rule is a deliberate contract edit rather than a silent drift.
 */
export function assertVersionProseShape(versionProse) {
    const failures = [];
    if (!versionProse || typeof versionProse !== "object") {
        return ["versionProse block is missing"];
    }
    const rules = versionProse.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
        return ["versionProse.rules must be a non-empty array"];
    }
    if (versionProse.expectedRuleCount !== rules.length) {
        failures.push(
            `versionProse.expectedRuleCount ${versionProse.expectedRuleCount} does not match ${rules.length} rules`,
        );
    }
    const seen = new Set();
    for (const rule of rules) {
        for (const field of ["id", "doc", "packageId", "derive", "pattern"]) {
            if (typeof rule?.[field] !== "string" || rule[field].length === 0) {
                failures.push(`versionProse rule ${JSON.stringify(rule?.id)} missing ${field}`);
            }
        }
        if (rule?.derive !== "version" && rule?.derive !== "peerRange") {
            failures.push(`versionProse rule ${rule?.id}: derive must be "version" or "peerRange"`);
        }
        if (seen.has(rule?.id)) failures.push(`versionProse duplicate rule id ${rule?.id}`);
        seen.add(rule?.id);
    }
    return failures;
}
