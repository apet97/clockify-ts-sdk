import assert from "node:assert/strict";
import { test } from "node:test";

import {
    expectedArtifactName,
    validateRemoteMutationProofRecord,
} from "./remote-mutation-proof-contract.mjs";

const proofCommit = "1f3e4de98ebd6445dde5280c23ce825f0719cfb3";

function pendingRecord() {
    return {
        schemaVersion: 1,
        status: "pending-live-evidence",
        owner: "apet97",
        repository: "clockify-ts-sdk",
        workflow: { path: ".github/workflows/mutation.yml", name: "Mutation", event: "workflow_dispatch" },
        approvedTargets: ["wrapper", "mcp", "cli"],
        aggregateTarget: "all",
        retentionDays: 14,
        reportPaths: [
            "wrapper/reports/mutation/mutation.json",
            "mcp/reports/mutation/mutation.json",
            "cli/reports/mutation/mutation.json",
        ],
        proofCommit,
        branch: "codex/clockify-1-0-truth",
        noLocalMutationCommandRan: true,
        run: null,
        job: null,
        artifact: null,
        scoreContract: {
            path: "docs/mutation-score-contract.json",
            sha256: "f2f1d184d240e33b8e878b4c672960a89d4689a70a61fee5a470b00dbd574649",
        },
        measurements: null,
        verifiedAt: null,
    };
}

test("pending record is deliberately non-integrated but structurally safe", () => {
    assert.deepEqual(validateRemoteMutationProofRecord(pendingRecord()), []);
});

test("verified record rejects a target-derived artifact name mismatch", () => {
    const record = pendingRecord();
    record.status = "verified";
    record.run = {
        id: 29914969280,
        attempt: 1,
        url: "https://github.com/apet97/clockify-ts-sdk/actions/runs/29914969280",
        conclusion: "success",
        headSha: proofCommit,
    };
    record.job = { id: 1, name: "Stryker mutation (all)", attempt: 1, conclusion: "success" };
    record.artifact = {
        id: 1,
        name: "mutation-reports-wrapper-1",
        sizeBytes: 1,
        createdAt: "2026-07-22T12:00:00Z",
        expiresAt: "2026-08-05T12:00:00Z",
        expired: false,
        archiveSha256: "a".repeat(64),
        reportSha256: "b".repeat(64),
    };
    record.measurements = {};
    record.verifiedAt = "2026-07-22T12:00:00Z";

    assert.match(
        validateRemoteMutationProofRecord(record).join("\n"),
        /artifact\.name.*mutation-reports-all-1/i,
    );
});

test("artifact names are canonically target and attempt derived", () => {
    assert.equal(expectedArtifactName("all", 2), "mutation-reports-all-2");
});

test("static proof validation fails closed for target, path, retention, and run metadata drift", () => {
    const cases = [
        ["wrong target", (record) => (record.aggregateTarget = "wrapper"), /aggregateTarget/],
        ["wrong report path", (record) => (record.reportPaths[2] = "cli/reports/mutation/other.json"), /reportPaths/],
        ["bad retention", (record) => (record.retentionDays = 13), /retentionDays/],
        ["bad run attempt", (record) => { record.status = "verified"; record.run = { id: 1, attempt: 0 }; }, /run\.attempt/],
        ["bad run URL", (record) => { record.status = "verified"; record.run = { id: 1, attempt: 1, url: "https://example.invalid", conclusion: "success", headSha: proofCommit, createdAt: "2026-07-22T10:00:00Z", startedAt: "2026-07-22T10:01:00Z", completedAt: "2026-07-22T10:02:00Z" }; }, /run\.url/],
        ["wrong run SHA", (record) => { record.status = "verified"; record.run = { id: 1, attempt: 1, url: "https://github.com/apet97/clockify-ts-sdk/actions/runs/1", conclusion: "success", headSha: "0".repeat(40), createdAt: "2026-07-22T10:00:00Z", startedAt: "2026-07-22T10:01:00Z", completedAt: "2026-07-22T10:02:00Z" }; }, /run\.headSha/],
        ["failed run", (record) => { record.status = "verified"; record.run = { id: 1, attempt: 1, url: "https://github.com/apet97/clockify-ts-sdk/actions/runs/1", conclusion: "failure", headSha: proofCommit, createdAt: "2026-07-22T10:00:00Z", startedAt: "2026-07-22T10:01:00Z", completedAt: "2026-07-22T10:02:00Z" }; }, /run\.conclusion/],
    ];
    for (const [name, mutate, expected] of cases) {
        const record = pendingRecord();
        mutate(record);
        assert.match(validateRemoteMutationProofRecord(record).join("\n"), expected, name);
    }
});
