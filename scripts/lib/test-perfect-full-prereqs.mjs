import assert from "node:assert/strict";
import test from "node:test";

import {
    parsePerfectFullPrereqs,
    perfectFullRunsLocalMutation,
} from "./perfect-full-prereqs.mjs";

test("perfectFullRunsLocalMutation matches only the exact `mutation` prerequisite token", () => {
    // Current real shape: mutation-safety + mutation-ci present, bare `mutation` absent.
    assert.equal(
        perfectFullRunsLocalMutation(
            "perfect-full: mutation-safety mutation-ci size performance-budgets",
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
