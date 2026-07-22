import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
    parsePerfectFullPrereqs,
    perfectFullRunsLocalMutation,
} from "./perfect-full-prereqs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("perfectFullRunsLocalMutation matches only the exact `mutation` prerequisite token", () => {
    // Current real shape: the Make prerequisite list carries only the light fast
    // setup; the canonical verify plan owns mutation-ci and all heavy ordering.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety official-openapi-drift",
        ),
        false,
    );

    // Trailing-position bare `mutation` — the blind spot the old substring check missed.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation-ci performance-budgets mutation",
        ),
        true,
    );

    // Mid-position bare `mutation`.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation size mutation-ci",
        ),
        true,
    );

    // Multi-segment tokens must never be mistaken for the bare token.
    assert.equal(
        perfectFullRunsLocalMutation("perfect-full: mutation-ci mutation-safety"),
        false,
    );
});

test("parsePerfectFullPrereqs returns an empty array for a target with no prerequisites", () => {
    assert.deepEqual(parsePerfectFullPrereqs("perfect-full:"), []);
});

test("perfect-full guidance names the canonical verify-plan owner", () => {
    const makefile = readFileSync(path.join(root, "Makefile"), "utf8");
    const claude = readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    const helper = readFileSync(path.join(root, "scripts/lib/perfect-full-prereqs.mjs"), "utf8");

    for (const [label, source] of [
        ["Makefile", makefile],
        ["CLAUDE.md", claude],
        ["perfect-full-prereqs.mjs", helper],
    ]) {
        assert.match(source, /canonical verify plan|sole fast\/full command authority/i, label);
    }
    assert.doesNotMatch(claude, /last prerequisite in both `perfect-full` and `perfect-fast`/i);
    assert.doesNotMatch(helper, /only the lightweight `mutation-ci` wiring check belongs there/i);
});
