import assert from "node:assert/strict";
import test from "node:test";

import { coveredMutationScore } from "./mutation-score.mjs";

test("coveredMutationScore counts killed and timed-out mutants as passing", () => {
    const measured = coveredMutationScore([
        { status: "Killed" },
        { status: "Timeout" },
        { status: "Survived" },
        { status: "NoCoverage" },
        { status: "Ignored" },
    ]);
    assert.ok(Math.abs(measured - (2 / 3) * 100) < 1e-9);
});

test("coveredMutationScore fails closed when a governed module has no covered mutants", () => {
    assert.throws(
        () => coveredMutationScore([{ status: "NoCoverage" }, { status: "Ignored" }]),
        /zero covered mutants/,
    );
});
