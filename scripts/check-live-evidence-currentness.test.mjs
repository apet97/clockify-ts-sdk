import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
    captureInputSnapshot,
    checkLiveEvidenceCurrentness,
    computeInputFingerprint,
    hashGovernedInputs,
} from "./check-live-evidence-currentness.mjs";
import { computeHashesFingerprint } from "./live/live-evidence-attestation.mjs";
import { CLEANUP_ENTITY_ORDER } from "./live/cleanup.mjs";

const CAMPAIGN_INPUTS = [
    "docs/openapi-source-lock.json",
    "spec/corrected/clockify.corrected.openapi.yaml",
    "docs/openapi-operations.json",
    "docs/live-sandbox-fingerprint.json",
    "scripts/live/generate-live-evidence-manifest.mjs",
    "scripts/live/live-evidence-attestation.mjs",
];
const GOVERNED_INPUTS = [
    ...CAMPAIGN_INPUTS.slice(0, 4),
    "docs/live-evidence-manifest.schema.json",
    ...CAMPAIGN_INPUTS.slice(4),
    "scripts/check-live-evidence-manifest.mjs",
    "spec/evidence/live-evidence-manifest.json",
    "spec/evidence/live-evidence-campaign-receipt.json",
    "docs/live-evidence-approval.json",
];
const SOURCE_LOCK = Object.freeze({ commit: "a".repeat(40), sourceSha256: "b".repeat(64) });
const OPERATION_INVENTORY = Object.freeze([{ method: "GET", path: "/x", operationId: "getX" }]);
const MANIFEST = Object.freeze({
    schemaVersion: 1,
    canonicalCommit: SOURCE_LOCK.commit,
    canonicalOpenApiSha256: SOURCE_LOCK.sourceSha256,
    redactionVersion: 1,
    generatedAt: "2026-08-04T00:01:00.000Z",
    operations: [
        {
            operationKey: "GET /x",
            operationId: "getX",
            status: "live-success",
            proofKind: "read-only",
            observedHttpClass: "2xx",
            requestShapeSha256: "c".repeat(64),
            responseShapeSha256: "d".repeat(64),
            evidenceId: "probe-abcdef12-001",
            verifiedAt: "2026-08-04T00:00:30.000Z",
        },
    ],
});

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function reader(bytesByPath) {
    return (relativePath) => {
        const bytes = bytesByPath[relativePath];
        if (!Buffer.isBuffer(bytes)) throw new Error(`fixture missing: ${relativePath}`);
        return bytes;
    };
}

function buildFixture() {
    const bytes = {
        "docs/openapi-source-lock.json": Buffer.from("source-lock-v1"),
        "spec/corrected/clockify.corrected.openapi.yaml": Buffer.from("corrected-openapi-v1"),
        "docs/openapi-operations.json": Buffer.from("operation-inventory-v1"),
        "docs/live-sandbox-fingerprint.json": Buffer.from("sandbox-v1"),
        "docs/live-evidence-manifest.schema.json": Buffer.from("schema-v1"),
        "scripts/live/generate-live-evidence-manifest.mjs": Buffer.from("generator-v1"),
        "scripts/live/live-evidence-attestation.mjs": Buffer.from("attestation-v1"),
        "scripts/check-live-evidence-manifest.mjs": Buffer.from("validator-v1"),
        "spec/evidence/live-evidence-manifest.json": Buffer.from(`${JSON.stringify(MANIFEST)}\n`),
    };
    const campaignInputHashes = hashGovernedInputs(CAMPAIGN_INPUTS, reader(bytes)).hashes;
    const campaignReceipt = {
        schemaVersion: 1,
        baseCommit: "e".repeat(40),
        startedAt: "2026-08-04T00:00:00.000Z",
        completedAt: "2026-08-04T00:01:30.000Z",
        manifestSha256: sha256(bytes["spec/evidence/live-evidence-manifest.json"]),
        previousManifestSha256: "f".repeat(64),
        campaignInputFingerprint: computeHashesFingerprint(CAMPAIGN_INPUTS, campaignInputHashes),
        campaignInputHashes,
        sdkArtifact: { root: "wrapper/dist", sha256: "1".repeat(64), fileCount: 12 },
        runtime: { nodeVersion: "v22.13.0" },
        outcomes: {
            operationCount: 1,
            liveSuccessCount: 1,
            statusRegressions: 0,
            unexpectedProbeFailures: 0,
            deferredProbeFailures: 0,
            safetyDemotions: [],
        },
        cleanup: {
            status: "passed",
            prefixCount: 1,
            leftovers: 0,
            actions: [...CLEANUP_ENTITY_ORDER, "registered_fallbacks"].map((entityType) => ({
                entityType,
                sanitizedIdCount: 0,
                deletedCount: 0,
                failedCount: 0,
                remainingCount: 0,
                complete: true,
            })),
        },
        lock: { released: true },
    };
    bytes["spec/evidence/live-evidence-campaign-receipt.json"] = Buffer.from(
        `${JSON.stringify(campaignReceipt)}\n`,
    );
    const approvalReceipt = {
        schemaVersion: 1,
        manifestSha256: campaignReceipt.manifestSha256,
        campaignReceiptSha256: sha256(bytes["spec/evidence/live-evidence-campaign-receipt.json"]),
        approvedBy: "apet97",
        approvedAt: "2026-08-04T00:02:00Z",
    };
    bytes["docs/live-evidence-approval.json"] = Buffer.from(`${JSON.stringify(approvalReceipt)}\n`);
    const inputHashes = hashGovernedInputs(GOVERNED_INPUTS, reader(bytes)).hashes;
    const record = {
        schemaVersion: 2,
        attestationMode: "base-commit-plus-content-hashes",
        baseCommit: campaignReceipt.baseCommit,
        verifiedAt: "2026-08-04T00:02:30Z",
        manifestSha256: campaignReceipt.manifestSha256,
        campaignReceiptSha256: approvalReceipt.campaignReceiptSha256,
        approvalReceiptSha256: sha256(bytes["docs/live-evidence-approval.json"]),
        inputFingerprint: computeInputFingerprint(GOVERNED_INPUTS, inputHashes),
        inputHashes,
    };
    return { bytes, record, campaignReceipt, approvalReceipt };
}

function check(fixture, overrides = {}) {
    return checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        campaignInputs: CAMPAIGN_INPUTS,
        readFileBytes: reader(fixture.bytes),
        record: fixture.record,
        manifest: MANIFEST,
        campaignReceipt: fixture.campaignReceipt,
        approvalReceipt: fixture.approvalReceipt,
        sourceLock: SOURCE_LOCK,
        operationInventory: OPERATION_INVENTORY,
        baseCommitExists: () => true,
        nowMs: Date.parse("2026-08-04T01:00:00Z"),
        ...overrides,
    });
}

test("computeInputFingerprint is deterministic and order-sensitive", () => {
    const hashes = { a: "111", b: "222" };
    assert.equal(
        computeInputFingerprint(["a", "b"], hashes),
        computeInputFingerprint(["a", "b"], hashes),
    );
    assert.notEqual(
        computeInputFingerprint(["a", "b"], hashes),
        computeInputFingerprint(["b", "a"], hashes),
    );
});

test("captureInputSnapshot reads each path once and isolates later buffer mutation", () => {
    const source = Buffer.from("first");
    let reads = 0;
    const snapshotRead = captureInputSnapshot(["a", "a"], () => {
        reads += 1;
        return source;
    });
    source.fill("x");

    assert.equal(snapshotRead("a").toString("utf8"), "first");
    assert.equal(snapshotRead("a").toString("utf8"), "first");
    assert.equal(reads, 1);
});

test("accepts a fully bound manifest, campaign receipt, approval, and currentness record", () => {
    const result = check(buildFixture());
    assert.equal(result.ok, true, JSON.stringify(result));
});

for (const inputPath of [
    "docs/openapi-source-lock.json",
    "spec/corrected/clockify.corrected.openapi.yaml",
    "docs/openapi-operations.json",
    "scripts/live/generate-live-evidence-manifest.mjs",
    "spec/evidence/live-evidence-manifest.json",
    "spec/evidence/live-evidence-campaign-receipt.json",
    "docs/live-evidence-approval.json",
]) {
    test(`rejects governed input drift: ${inputPath}`, () => {
        const fixture = buildFixture();
        fixture.bytes[inputPath] = Buffer.from("changed");
        const result = check(fixture);
        assert.equal(result.ok, false);
        assert.ok(
            result.staleReasons.some((entry) => entry.path === inputPath),
            JSON.stringify(result),
        );
    });
}

test("rejects a missing or swapped manifest instead of skipping validation", () => {
    const fixture = buildFixture();
    delete fixture.bytes["spec/evidence/live-evidence-manifest.json"];
    const result = check(fixture, { manifest: undefined });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("manifest is required")));
});

test("rejects a nonexistent base commit", () => {
    const result = check(buildFixture(), { baseCommitExists: () => false });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("does not exist")));
});

test("rejects an approval that does not bind the exact campaign receipt", () => {
    const fixture = buildFixture();
    fixture.approvalReceipt = { ...fixture.approvalReceipt, campaignReceiptSha256: "0".repeat(64) };
    const result = check(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("campaignReceiptSha256 mismatch")));
});

test("flags an unreadable governed input as stale rather than throwing", () => {
    const fixture = buildFixture();
    delete fixture.bytes["docs/openapi-operations.json"];
    const result = check(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.staleReasons.some((entry) => entry.path === "docs/openapi-operations.json"));
});

test("rejects duplicate governed and campaign paths", () => {
    const fixture = buildFixture();
    const result = check(fixture, {
        governedInputs: [...GOVERNED_INPUTS, GOVERNED_INPUTS[0]],
        campaignInputs: [...CAMPAIGN_INPUTS, CAMPAIGN_INPUTS[0]],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("governedInputs: duplicate")));
    assert.ok(result.errors.some((message) => message.includes("campaignInputs: duplicate")));
});

test("rejects extra or malformed recorded input hashes", () => {
    const fixture = buildFixture();
    fixture.record.inputHashes.extra = "0".repeat(64);
    fixture.record.inputHashes[GOVERNED_INPUTS[0]] = "not-a-digest";
    const result = check(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("unknown path extra")));
    assert.ok(result.errors.some((message) => message.includes("invalid SHA-256")));
});
