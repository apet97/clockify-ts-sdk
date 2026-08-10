// Guards the 2026-08-09 retirement of the completed 1.0-campaign gates
// (unique-claim-inventory, the one-point-zero inventory check, and the
// plan-lifecycle half of check-agent-handoff.mjs).
//
// The campaign closed with all 27 roadmap tasks done; its gates then
// re-proved an immutable history (git archaeology, claim-set equality)
// on every push. The retirement receipt is
// docs/roadmap-1.0-receipts/governance-gate-retirement.md. These tests
// fail if the retired machinery is rewired, which would mean the
// retirement silently reversed. They mirror the retired-path guard style
// of check-enterprise-hardening.retired-receipts.test.mjs.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The skills-parity sibling suite (scripts/check-agent-handoff.skills-parity.test.mjs)
// used to register through an import here, because the agent-handoff Makefile
// target line is a governed live-evidence input and adding a second `node --test`
// invocation there had to wait for a governed batch. This is that batch: it now
// has its own line in the `agent-handoff` target, so the import workaround is
// gone -- keeping it would have run those tests twice per invocation.

const checker = readFileSync(new URL("./check-agent-handoff.mjs", import.meta.url), "utf8");
const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");

test("check-agent-handoff.mjs no longer runs the plan-lifecycle campaign half", () => {
    for (const marker of [
        "plan-lifecycle-contract.mjs",
        "checkPlanLifecycle",
        "commitEvidence",
        "execFileSync",
    ]) {
        assert.equal(
            checker.includes(marker),
            false,
            `check-agent-handoff.mjs contains ${marker} again; the plan-lifecycle campaign half was retired ` +
                "to docs/roadmap-1.0-receipts/governance-gate-retirement.md",
        );
    }
});

test("the retired campaign checkers stay deleted", () => {
    for (const relative of [
        "./check-unique-claim-inventory.mjs",
        "./generate-one-point-zero-inventory.mjs",
        "./lib/plan-lifecycle-contract.mjs",
        "./lib/unique-claim-inventory.mjs",
        "./plan-lifecycle-contract.test.mjs",
    ]) {
        assert.equal(
            existsSync(new URL(relative, import.meta.url)),
            false,
            `${relative} reappeared; the 1.0-campaign gate it powered is retired`,
        );
    }
});

test("the Makefile no longer wires the retired campaign gates", () => {
    for (const marker of [
        "unique-claim-inventory:",
        "generate-one-point-zero-inventory",
        "plan-lifecycle-contract.test.mjs",
    ]) {
        assert.equal(
            makefile.includes(marker),
            false,
            `Makefile contains ${marker} again; the retired 1.0-campaign gate is being rewired`,
        );
    }
});

test("the campaign evidence docs stay as read-only history", () => {
    for (const relative of [
        "../docs/plan-lifecycle-contract.json",
        "../docs/roadmap-1.0-status.json",
        "../docs/unique-claim-inventory.json",
        "../docs/roadmap-1.0.md",
        "../docs/roadmap-1.0-receipts/governance-gate-retirement.md",
    ]) {
        assert.equal(
            existsSync(new URL(relative, import.meta.url)),
            true,
            `${relative} is missing; retirement keeps the campaign evidence, it does not delete history`,
        );
    }
});
