// Guards the removal of the draft/final-receipt branch from
// check-enterprise-hardening.mjs (2026-07-27).
//
// The branch was a latent false-green, not merely dead code: its
// `!temporaryExists && finalReceiptExists` arm `continue`d past the whole
// per-evidence verification loop, so a requirement carrying the pair would
// have had ALL of its evidence silently unchecked the moment a final receipt
// file appeared. Zero requirements carried the keys, so it never fired -- but
// it would have, and silently, which is the exact failure class the 2026-06-29
// review was called to find.
//
// This mirrors the existing retired-path guard style in
// scripts/check-mutation-score.mjs, which asserts that
// mcp/src/orchestration/confirm-guard.ts never reappears.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checker = readFileSync(new URL("./check-enterprise-hardening.mjs", import.meta.url), "utf8");
const audit = JSON.parse(readFileSync(new URL("../docs/enterprise-hardening-audit.json", import.meta.url), "utf8"));

test("the retired receipt keys govern nothing in the audit", () => {
    const carrying = audit.requirements.filter(
        (requirement) => requirement.temporaryPath !== undefined || requirement.finalReceiptPath !== undefined,
    );
    assert.deepEqual(
        carrying.map((requirement) => requirement.id),
        [],
        "final-readiness receipts were retired 2026-05-28; a requirement carrying temporaryPath/finalReceiptPath " +
            "means the retired concept is being reintroduced",
    );
});

test("the checker no longer reads the retired receipt keys", () => {
    for (const key of ["temporaryPath", "finalReceiptPath"]) {
        assert.equal(
            checker.includes(`requirement.${key}`),
            false,
            `check-enterprise-hardening.mjs reads requirement.${key} again; the skip branch it belonged to could ` +
                "bypass evidence verification for the whole requirement",
        );
    }
});

test("no code path can skip a requirement before its evidence is verified", () => {
    // The deleted branch was the only `continue` between the evidence-array
    // shape check and the per-evidence loop. Any new one is the same hazard,
    // so make it fail loudly rather than merely be discouraged in a comment.
    const start = checker.indexOf('.evidence[].path');
    const loop = checker.indexOf("for (const [evidenceIndex, evidence] of requirement.evidence.entries())");
    assert.ok(start !== -1 && loop !== -1 && loop > start, "checker shape changed; re-derive this guard");
    const between = checker.slice(start, loop);
    assert.equal(
        /\bcontinue\b/.test(between),
        false,
        "a `continue` was reintroduced between the evidence shape check and the evidence loop; that skips " +
            "verification for the entire requirement",
    );
});
