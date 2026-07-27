import assert from "node:assert/strict";
import test from "node:test";

import { assertVersionProseShape, deriveValue, evaluateVersionProse } from "./version-prose.mjs";

const MANIFESTS = {
    wrapper: { version: "0.13.0" },
    cli: { version: "0.4.0", peerDependencies: { "clockify-sdk-ts-115": ">=0.13.0 <1" } },
    mcp: { version: "0.7.0", peerDependencies: { "clockify-sdk-ts-115": ">=0.13.0 <1" } },
};

const CURRENT_RELEASE = "Current release: `([0-9]+\\.[0-9]+\\.[0-9]+)`";
const PEER_RANGE = "(>=[0-9]+\\.[0-9]+\\.[0-9]+ <1)";

function rule(overrides = {}) {
    return {
        id: "wrapper-readme-current-release",
        doc: "wrapper/README.md",
        packageId: "wrapper",
        derive: "version",
        pattern: CURRENT_RELEASE,
        ...overrides,
    };
}

test("deriveValue reads version and peerRange from different manifest fields", () => {
    assert.equal(deriveValue("version", MANIFESTS.cli), "0.4.0");
    assert.equal(deriveValue("peerRange", MANIFESTS.cli), ">=0.13.0 <1");
    assert.equal(deriveValue("unknown", MANIFESTS.cli), undefined);
});

test("current prose passes", () => {
    const failures = evaluateVersionProse({
        rules: [rule()],
        manifests: MANIFESTS,
        docs: { "wrapper/README.md": "Current release: `0.13.0`. Requires Node.js `>=22.13.0`." },
    });
    assert.deepEqual(failures, []);
});

// The regression this gate exists to prevent. `wrapper/README.md` really did
// sit at 0.12.2 through the 0.12.3 and 0.13.0 releases.
test("a stale version is reported with both the prose and the manifest value", () => {
    const failures = evaluateVersionProse({
        rules: [rule()],
        manifests: MANIFESTS,
        docs: { "wrapper/README.md": "Current release: `0.12.2`. Requires Node.js `>=22.13.0`." },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /says version "0\.12\.2".*manifest says "0\.13\.0"/);
});

// Affirmation alone would pass this: the doc *contains* the correct range at
// the first occurrence. Only the deny direction catches the second one.
test("a second stale occurrence is caught even when the first is correct", () => {
    const failures = evaluateVersionProse({
        rules: [
            rule({ id: "cli-peer", doc: "cli/README.md", packageId: "cli", derive: "peerRange", pattern: PEER_RANGE, minMatches: 2 }),
        ],
        manifests: MANIFESTS,
        docs: {
            "cli/README.md": [
                "`clockify-sdk-ts-115 >=0.13.0 <1`.",
                "a `>=0.12.0 <1` peer dependency for published consumers.",
            ].join("\n"),
        },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /occurrence 2 says peerRange ">=0\.12\.0 <1"/);
});

test("dropping the labelled prose fails the affirmation direction", () => {
    const failures = evaluateVersionProse({
        rules: [rule()],
        manifests: MANIFESTS,
        docs: { "wrapper/README.md": "This README no longer states a release." },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /states the version 0 time\(s\), expected at least 1/);
});

test("a reworded label fails rather than silently passing", () => {
    const failures = evaluateVersionProse({
        rules: [rule({ minMatches: 1 })],
        manifests: MANIFESTS,
        docs: { "wrapper/README.md": "Latest version: `0.13.0`." },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /reworded away from the gate/);
});

// Negative control. Without label anchoring, a bare-version regex reds on the
// legitimate `mcp-v0.7.0` release URL and the `.mcpb` asset filename, and the
// next agent weakens the gate to silence it.
test("release-tag URLs and asset filenames are not treated as version prose", () => {
    const failures = evaluateVersionProse({
        rules: [rule({ id: "mcp-current-release", doc: "mcp/README.md", packageId: "mcp" })],
        manifests: MANIFESTS,
        docs: {
            "mcp/README.md": [
                "Current release: `0.7.0`. Requires Node.js `>=22.13.0` and",
                "[`clockify115-mcp-0.7.0.mcpb`](https://github.com/apet97/clockify-ts-sdk/releases/download/mcp-v0.7.0/clockify115-mcp-0.7.0.mcpb)",
                "from the [`mcp-v0.6.6` release](https://github.com/apet97/clockify-ts-sdk/releases/tag/mcp-v0.6.6)",
            ].join("\n"),
        },
    });
    assert.deepEqual(failures, []);
});

test("a missing doc, unknown package, and underivable peer range each fail closed", () => {
    assert.match(
        evaluateVersionProse({ rules: [rule()], manifests: MANIFESTS, docs: {} })[0],
        /wrapper\/README\.md is missing/,
    );
    assert.match(
        evaluateVersionProse({ rules: [rule({ packageId: "ghost" })], manifests: MANIFESTS, docs: {} })[0],
        /unknown packageId "ghost"/,
    );
    assert.match(
        evaluateVersionProse({
            rules: [rule({ derive: "peerRange", pattern: PEER_RANGE })],
            manifests: MANIFESTS,
            docs: { "wrapper/README.md": "x" },
        })[0],
        /cannot derive peerRange/,
    );
});

test("an invalid pattern fails closed instead of throwing", () => {
    const failures = evaluateVersionProse({
        rules: [rule({ pattern: "Current release: `([0-9]+" })],
        manifests: MANIFESTS,
        docs: { "wrapper/README.md": "Current release: `0.13.0`." },
    });
    assert.equal(failures.length, 1);
    assert.match(failures[0], /invalid pattern/);
});

test("shape validation pins the rule count and rejects malformed rules", () => {
    assert.deepEqual(assertVersionProseShape({ expectedRuleCount: 1, rules: [rule()] }), []);
    assert.match(assertVersionProseShape({ expectedRuleCount: 9, rules: [rule()] })[0], /does not match 1 rules/);
    assert.match(assertVersionProseShape({ expectedRuleCount: 1, rules: [rule({ derive: "nope" })] })[0], /derive must be/);
    assert.match(
        assertVersionProseShape({ expectedRuleCount: 2, rules: [rule(), rule()] }).join("\n"),
        /duplicate rule id/,
    );
    assert.match(assertVersionProseShape(undefined)[0], /versionProse block is missing/);
});
