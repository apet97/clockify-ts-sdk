import assert from "node:assert/strict";
import { test } from "node:test";

import { computeInputFingerprint } from "./check-live-evidence-currentness.mjs";
import { buildCurrentnessRecord } from "./record-live-evidence-currentness.mjs";
import { sha256Hex } from "./live/live-evidence-attestation.mjs";

test("buildCurrentnessRecord explicitly binds base commit and all three approved artifacts", () => {
    const governedInputs = ["a", "b"];
    const inputHashes = { a: "a".repeat(64), b: "b".repeat(64) };
    const manifestBytes = Buffer.from("manifest");
    const campaignReceiptBytes = Buffer.from("campaign");
    const approvalReceiptBytes = Buffer.from("approval");
    const record = buildCurrentnessRecord({
        governedInputs,
        inputHashes,
        baseCommit: "c".repeat(40),
        verifiedAt: "2026-08-04T00:00:00Z",
        manifestBytes,
        campaignReceiptBytes,
        approvalReceiptBytes,
    });
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.attestationMode, "base-commit-plus-content-hashes");
    assert.equal(record.baseCommit, "c".repeat(40));
    assert.equal(record.manifestSha256, sha256Hex(manifestBytes));
    assert.equal(record.campaignReceiptSha256, sha256Hex(campaignReceiptBytes));
    assert.equal(record.approvalReceiptSha256, sha256Hex(approvalReceiptBytes));
    assert.equal(record.inputFingerprint, computeInputFingerprint(governedInputs, inputHashes));
});
