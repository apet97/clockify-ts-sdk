// Tests for the forbidden-import-marker scan used by
// scripts/check-dependency-boundary.mjs.
//
// The marker direction here is FORBIDDEN: presence fails the gate. The
// false-* risk is therefore inverted relative to required-identifier gates
// like check-replay-fixtures: a doc comment that merely *mentions* a marker
// must not red the gate (false RED), while a real import of the marker must
// keep failing. Do not require call/import position beyond that — weakening
// the code-side match would turn this into a false-green gate.
import assert from "node:assert/strict";
import test from "node:test";

import { forbiddenMarkerFindings } from "./lib/dependency-boundary-markers.mjs";

const MARKERS = ["output/ts-sdk", "../wrapper/src", "wrapper/src"];

test("a line comment mentioning a forbidden marker does not fail the gate", () => {
    const text = [
        "// Never import from output/ts-sdk or wrapper/src — those are generated.",
        'import { createClockifyClient } from "clockify-sdk-ts-115";',
    ].join("\n");
    assert.deepEqual(forbiddenMarkerFindings(text, MARKERS), []);
});

test("a block comment mentioning a forbidden marker does not fail the gate", () => {
    const text = [
        "/**",
        " * The generated client lives in ../wrapper/src and must not be",
        " * imported directly (see docs/dependency-boundary.json).",
        " */",
        "export const x = 1;",
    ].join("\n");
    assert.deepEqual(forbiddenMarkerFindings(text, MARKERS), []);
});

test("a real import of a forbidden marker still fails the gate", () => {
    const text = 'import { ClockifyApi } from "../wrapper/src/api/index.js";\n';
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.ok(findings.some((finding) => finding.marker === "../wrapper/src"));
    assert.ok(findings.some((finding) => finding.marker === "wrapper/src"));
});

test("a require of a forbidden marker still fails the gate", () => {
    const text = 'const api = require("output/ts-sdk/api");\n';
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].marker, "output/ts-sdk");
    assert.equal(findings[0].line, 1);
});

test("a marker in non-import code still fails the gate (no call-position weakening)", () => {
    const text = 'const path = "output/ts-sdk/api/types";\n';
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].marker, "output/ts-sdk");
});

test("a // sequence inside a string literal does not start a comment", () => {
    const text = [
        'const url = "https://example.com"; const bad = "wrapper/src";',
    ].join("\n");
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].marker, "wrapper/src");
});

test("a // sequence inside a template literal does not start a comment", () => {
    const text = "const url = `https://example.com/${id}`; const bad = `wrapper/src`;\n";
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].marker, "wrapper/src");
});

test("a comment after real code does not mask code on the same line", () => {
    const text = 'import x from "wrapper/src/x.js"; // wrapper/src is forbidden\n';
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].marker, "wrapper/src");
    assert.equal(findings[0].line, 1);
});

test("an escaped quote does not end a string early", () => {
    const text = 'const s = "not a comment: \\" // wrapper/src still code";\n';
    const findings = forbiddenMarkerFindings(text, MARKERS);
    assert.equal(findings.length, 1);
});

test("markers split across a comment boundary do not match", () => {
    // "wrapper/" in code + "src" only inside a comment must not concatenate.
    const text = 'const a = "wrapper/"; /* src */\n';
    assert.deepEqual(forbiddenMarkerFindings(text, MARKERS), []);
});
