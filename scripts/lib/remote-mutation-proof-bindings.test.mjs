import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateRemoteMutationProofRecord } from "./remote-mutation-proof-contract.mjs";
import { validateRemoteMutationProofBindings } from "./remote-mutation-proof-bindings.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const readJson = (relative) => JSON.parse(readFileSync(path.join(root, relative), "utf8"));
const receipt = () => readFileSync(path.join(root, "docs/roadmap-1.0-receipts/task-18-remote-mutation.md"), "utf8");
const roadmap = () => readFileSync(path.join(root, "docs/roadmap-1.0.md"), "utf8");

function inputs() {
    return {
        record: readJson("docs/remote-mutation-proof-contract.json"),
        roadmapStatus: readJson("docs/roadmap-1.0-status.json"),
        receipt: receipt(),
        roadmap: roadmap(),
        riskRegister: readJson("docs/risk-register.json"),
    };
}

test("canonical Task 18 duplicate evidence binds to the verified record", () => {
    const value = inputs();
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.deepEqual(validateRemoteMutationProofBindings(value), []);
});

test("proof-SHA substitution that preserves the score contract fails duplicate binding", () => {
    const value = inputs();
    const substitute = "3fdf27913470b09a79149fc4e2518e7837164c90";
    value.record.proofCommit = substitute;
    value.record.run.headSha = substitute;
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.match(validateRemoteMutationProofBindings(value).join("\n"), /taskBase|headSha|receipt|roadmap/i);
});

test("status and readable receipt substitutions fail exact canonical bindings", () => {
    const statusValue = inputs();
    statusValue.roadmapStatus.remoteMutationProof.aggregateProof.artifactSizeBytes += 1;
    assert.match(validateRemoteMutationProofBindings(statusValue).join("\n"), /artifactSizeBytes/);

    const receiptValue = inputs();
    receiptValue.receipt = receiptValue.receipt.replace(receiptValue.record.artifact.archiveSha256, "0".repeat(64));
    assert.match(validateRemoteMutationProofBindings(receiptValue).join("\n"), /canonical evidence block differs/i);
});

test("verified proof requires completed aggregate parent state and a coherent Task 18 lifecycle", () => {
    const value = inputs();
    value.roadmapStatus.remoteMutationProof.status = "pending-live-evidence";
    value.roadmapStatus.remoteMutationProof.aggregateApprovedTargetProofComplete = false;
    value.roadmapStatus.task18.status = "implemented-awaiting-live-evidence";
    assert.match(
        validateRemoteMutationProofBindings(value).join("\n"),
        /verified aggregate approved-target proof completion|task18\.status/i,
    );
});

test("verified proof permits a later evidence-only Task 18 closeout at 2/2", () => {
    const value = inputs();
    value.roadmapStatus.task18.status = "complete";
    value.roadmapStatus.task18.recordedIndependentApprovals = 2;
    value.roadmapStatus.task18.reviewedHead = value.record.proofCommit;
    value.roadmapStatus.task18.reviewedRange = `${value.record.proofCommit}..${value.record.proofCommit}`;
    assert.deepEqual(validateRemoteMutationProofBindings(value), []);
});

test("receipt score, module-floor, expiry, and no-local claims bind to canonical measurements", () => {
    const cases = [
        ["wrapper global score", (value) => { value.receipt = value.receipt.replace("86.31067961165049", "99"); }, /canonical evidence block differs/],
        ["wrapper module floor", (value) => { value.receipt = value.receipt.replace("`wrapper/ensure.ts`: 94.5945945945946/94", "`wrapper/ensure.ts`: 94.5945945945946/95"); }, /canonical evidence block differs/],
        ["artifact expiry", (value) => { value.receipt = value.receipt.replace("expired `false` at verification", "expired `true` at verification"); }, /canonical evidence block differs/],
        ["no-local assertion", (value) => { value.receipt = value.receipt.replace("Canonical no-local-mutation assertion: `true`.", "Canonical no-local-mutation assertion: `false`."); }, /canonical evidence block differs/],
    ];
    for (const [name, mutate, expected] of cases) {
        const value = inputs();
        mutate(value);
        assert.match(validateRemoteMutationProofBindings(value).join("\n"), expected, name);
    }
});

test("canonical receipt block rejects duplicate, hidden, and later overriding evidence", () => {
    const cases = [
        ["duplicate block", (value) => { value.receipt += `\n${value.receipt.match(/<!-- task18-canonical-evidence:start -->[\s\S]*?<!-- task18-canonical-evidence:end -->/)[0]}`; }, /exactly one canonical evidence block/],
        ["hidden score", (value) => { value.receipt += "\n<!-- | wrapper | 86.31067961165049 | 82 | -->"; }, /appears outside its block/],
        ["later override", (value) => { value.receipt += "\n| wrapper | 99 | 82 |"; }, /appears outside its block/],
        ["visible score plus appended canonical row", (value) => { value.receipt = value.receipt.replace("| wrapper | 86.31067961165049 | 82 |", "| wrapper | 99 | 82 |") + "\n| wrapper | 86.31067961165049 | 82 |"; }, /canonical evidence block differs|appears outside its block/],
        ["hidden claim", (value) => { value.receipt += "\n<!-- - Verified at: `2026-07-22T12:03:07Z` -->"; }, /Verified at.*appears outside its block/],
        ["later claim override", (value) => { value.receipt += "\n- Canonical no-local-mutation assertion: `false`."; }, /no-local-mutation assertion.*appears outside its block/],
        ["conflicting report hash", (value) => { value.receipt += "\n| `wrapper/reports/mutation/mutation.json` | `0" + "0".repeat(63) + "` |"; }, /wrapper\/reports\/mutation\/mutation\.json.*appears outside its block/],
    ];
    for (const [name, mutate, expected] of cases) {
        const value = inputs();
        mutate(value);
        assert.match(validateRemoteMutationProofBindings(value).join("\n"), expected, name);
    }
});

test("pending template is valid nonproof evidence only with every surface pending", () => {
    const value = inputs();
    value.record.status = "pending-live-evidence";
    value.record.run = null;
    value.record.job = null;
    value.record.artifact = null;
    value.record.measurements = null;
    value.record.verifiedAt = null;
    value.roadmapStatus.remoteMutationProof = {
        status: "pending-live-evidence",
        aggregateApprovedTargetProofComplete: false,
        aggregateProof: null,
    };
    value.roadmapStatus.task18 = {
        status: "implemented-awaiting-live-evidence",
        aggregateProofRunId: null,
        aggregateProofArtifactId: null,
    };
    value.receipt = "Task 18 pending live evidence; no aggregate run, job, artifact, report, or score is recorded.";
    value.roadmap = "Task 18 pending live evidence.";
    const risk = value.riskRegister.risks.find((entry) => entry.id === "remote-mutation-proof-pending");
    risk.status = "open";
    risk.finalReadinessBlocking = true;
    risk.summary = "Task 18 pending live evidence.";
    assert.deepEqual(validateRemoteMutationProofRecord(value.record), []);
    assert.deepEqual(validateRemoteMutationProofBindings(value), []);
});

test("pending record rejects a retained job or verified duplicate governance surface", () => {
    const value = inputs();
    value.record.status = "pending-live-evidence";
    value.record.run = null;
    value.record.artifact = null;
    value.record.measurements = null;
    value.record.verifiedAt = null;
    assert.match(validateRemoteMutationProofRecord(value.record).join("\n"), /job: pending template must remain null/i);
    value.record.job = null;
    assert.match(validateRemoteMutationProofBindings(value).join("\n"), /must be pending|awaiting live evidence|pending nonproof|must state Task 18 pending|must remain open/i);
});

test("pending receipt rejects uppercase verified language", () => {
    const value = inputs();
    value.record.status = "pending-live-evidence";
    value.record.run = null;
    value.record.job = null;
    value.record.artifact = null;
    value.record.measurements = null;
    value.record.verifiedAt = null;
    value.roadmapStatus.remoteMutationProof = { status: "pending-live-evidence", aggregateApprovedTargetProofComplete: false, aggregateProof: null };
    value.roadmapStatus.task18 = { status: "implemented-awaiting-live-evidence", aggregateProofRunId: null, aggregateProofArtifactId: null };
    value.receipt = "Task 18 pending live evidence; no aggregate run, job, artifact, report, or score is recorded. VERIFIED";
    value.roadmap = "Task 18 pending live evidence.";
    const risk = value.riskRegister.risks.find((entry) => entry.id === "remote-mutation-proof-pending");
    risk.status = "open";
    risk.finalReadinessBlocking = true;
    risk.summary = "Task 18 pending live evidence.";
    assert.match(validateRemoteMutationProofBindings(value).join("\n"), /pending template must not contain verified/i);
});
