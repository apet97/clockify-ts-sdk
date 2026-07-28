import assert from "node:assert/strict";

import { describe, test } from "vitest";

import { isValidSubdomainLabel } from "../internal/subdomain-label.js";

/**
 * Direct coverage for the shared workspace-subdomain DNS label validator.
 *
 * Until now this module was only exercised transitively, through
 * `validateRoutingOptions` (one negative case) and
 * `authenticated-boundary-fetch.ts`. It decides whether a
 * `<label>.clockify.me` host is trusted at the final authenticated-dispatch
 * boundary, so it is governed by Stryker directly.
 *
 * Note the guard clauses in the module are deliberately layered: most are
 * redundant with `SUBDOMAIN_LABEL_RE` on their own. Each case below still
 * pins the *observable* contract, so a guard that starts returning `true`
 * (rather than being skipped) is caught.
 */

// 1 + 61 + 1 = the longest label SUBDOMAIN_LABEL_RE admits.
const MAX_LENGTH_LABEL = "a".repeat(63);
const OVERLONG_LABEL = "a".repeat(64);

describe("isValidSubdomainLabel", () => {
    describe("accepts", () => {
        test.each([
            ["a single character", "a"],
            ["a single digit", "1"],
            ["a plain word", "acme"],
            ["an internal hyphen", "acme-corp"],
            ["multiple internal hyphens", "a-b-c"],
            ["a leading digit", "1acme"],
            ["digits and letters", "acme2024"],
            ["the maximum length", MAX_LENGTH_LABEL],
        ])("%s: %s", (_why, label) => {
            assert.equal(isValidSubdomainLabel(label), true);
        });
    });

    describe("rejects", () => {
        test.each([
            // The one rule the regex alone does NOT enforce: "xn--foo" matches
            // SUBDOMAIN_LABEL_RE, so the punycode guard is load-bearing.
            ["a punycode/IDN prefix", "xn--foo"],
            ["a bare punycode prefix", "xn--"],
            ["an embedded dot", "a.b"],
            ["a trailing dot", "acme."],
            ["a leading hyphen", "-abc"],
            ["a trailing hyphen", "abc-"],
            ["a lone hyphen", "-"],
            ["uppercase characters", "ACME"],
            ["mixed case", "Acme"],
            ["an empty string", ""],
            ["whitespace only", "   "],
            ["an embedded space", "acme corp"],
            ["an underscore", "acme_corp"],
            ["punctuation", "acme!"],
            ["a label one character too long", OVERLONG_LABEL],
        ])("%s: %s", (_why, label) => {
            assert.equal(isValidSubdomainLabel(label), false);
        });
    });

    describe("non-string input is rejected, never thrown on", () => {
        // The runtime `typeof` guard is defense-in-depth for plain-JS callers:
        // without it, `label.trim()` would throw rather than return false.
        test.each([
            ["undefined", undefined],
            ["null", null],
            ["a number", 42],
            ["an object", {}],
            ["an array", []],
        ])("%s", (_why, value) => {
            assert.equal(isValidSubdomainLabel(value as unknown as string), false);
        });
    });
});
