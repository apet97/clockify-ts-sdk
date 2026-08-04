import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { importLiveEvidenceManifest } from "./import-live-evidence-manifest.mjs";
import { canonicalJsonBytes, computeHashesFingerprint } from "./live/live-evidence-attestation.mjs";
import { CLEANUP_ENTITY_ORDER } from "./live/cleanup.mjs";

const SOURCE_LOCK = Object.freeze({ commit: "a".repeat(40), sourceSha256: "b".repeat(64) });
const OPERATION_INVENTORY = Object.freeze([
    {
        method: "GET",
        path: "/workspaces/{workspaceId}/projects",
        operationId: "getWorkspaceProjects",
    },
]);
const CAMPAIGN_INPUTS = ["source.json", "generator.mjs"];
const CAMPAIGN_INPUT_HASHES = Object.freeze({
    "source.json": "1".repeat(64),
    "generator.mjs": "2".repeat(64),
});
const SDK_ARTIFACT = Object.freeze({ root: "wrapper/dist", sha256: "3".repeat(64), fileCount: 10 });

function sha256(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function validManifestObject() {
    return {
        schemaVersion: 1,
        canonicalCommit: SOURCE_LOCK.commit,
        canonicalOpenApiSha256: SOURCE_LOCK.sourceSha256,
        redactionVersion: 1,
        generatedAt: "2026-08-04T00:01:00.000Z",
        operations: [
            {
                operationKey: "GET /workspaces/{workspaceId}/projects",
                operationId: "getWorkspaceProjects",
                status: "live-success",
                proofKind: "read-only",
                observedHttpClass: "2xx",
                requestShapeSha256: "c".repeat(64),
                responseShapeSha256: "d".repeat(64),
                evidenceId: "probe-abcdef12-001",
                verifiedAt: "2026-08-04T00:00:30.000Z",
            },
        ],
    };
}

function makeTempTargets() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-live-evidence-manifest-test-"));
    const targets = {
        dir,
        targetPath: path.join(dir, "live-evidence-manifest.json"),
        campaignReceiptTargetPath: path.join(dir, "live-evidence-campaign-receipt.json"),
    };
    fs.writeFileSync(targets.targetPath, '{"previous":true}\n');
    return targets;
}

function validOptions(targets, manifest = validManifestObject()) {
    const sourceBytes = canonicalJsonBytes(manifest);
    const campaignReceipt = {
        schemaVersion: 1,
        baseCommit: "e".repeat(40),
        startedAt: "2026-08-04T00:00:00.000Z",
        completedAt: "2026-08-04T00:01:30.000Z",
        manifestSha256: sha256(sourceBytes),
        previousManifestSha256: "f".repeat(64),
        campaignInputFingerprint: computeHashesFingerprint(CAMPAIGN_INPUTS, CAMPAIGN_INPUT_HASHES),
        campaignInputHashes: { ...CAMPAIGN_INPUT_HASHES },
        sdkArtifact: { ...SDK_ARTIFACT },
        runtime: { nodeVersion: "v22.13.0" },
        outcomes: {
            operationCount: manifest.operations.length,
            liveSuccessCount: manifest.operations.filter((row) => row.status === "live-success")
                .length,
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
    campaignReceipt.previousManifestSha256 = sha256(fs.readFileSync(targets.targetPath));
    const campaignReceiptBytes = canonicalJsonBytes(campaignReceipt);
    return {
        ...targets,
        sourceBytes,
        expectedSha256: sha256(sourceBytes),
        campaignReceiptBytes,
        expectedCampaignReceiptSha256: sha256(campaignReceiptBytes),
        approvalReceipt: {
            schemaVersion: 1,
            manifestSha256: sha256(sourceBytes),
            campaignReceiptSha256: sha256(campaignReceiptBytes),
            approvedBy: "apet97",
            approvedAt: "2026-08-04T00:02:00Z",
        },
        sourceLock: SOURCE_LOCK,
        operationInventory: OPERATION_INVENTORY,
        campaignInputs: CAMPAIGN_INPUTS,
        campaignInputHashes: CAMPAIGN_INPUT_HASHES,
        sdkArtifact: SDK_ARTIFACT,
        baseCommitExists: () => true,
        nowMs: Date.parse("2026-08-04T01:00:00Z"),
    };
}

test("imports exact hash-verified manifest and campaign receipt after approval", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.changed, true);
        assert.ok(fs.readFileSync(targets.targetPath).equals(options.sourceBytes));
        assert.ok(
            fs.readFileSync(targets.campaignReceiptTargetPath).equals(options.campaignReceiptBytes),
        );
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("refuses manifest or campaign-receipt hash substitution", () => {
    const targets = makeTempTargets();
    try {
        const before = fs.readFileSync(targets.targetPath);
        const manifestSwap = importLiveEvidenceManifest({
            ...validOptions(targets),
            expectedSha256: "0".repeat(64),
        });
        assert.equal(manifestSwap.ok, false);
        const receiptSwap = importLiveEvidenceManifest({
            ...validOptions(targets),
            expectedCampaignReceiptSha256: "0".repeat(64),
        });
        assert.equal(receiptSwap.ok, false);
        assert.ok(fs.readFileSync(targets.targetPath).equals(before));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("refuses a semantically invalid manifest even when both hashes match", () => {
    const targets = makeTempTargets();
    try {
        const before = fs.readFileSync(targets.targetPath);
        const result = importLiveEvidenceManifest(
            validOptions(targets, { ...validManifestObject(), operations: [] }),
        );
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((message) => message.includes("must contain at least one row")),
        );
        assert.ok(fs.readFileSync(targets.targetPath).equals(before));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("refuses malformed JSON and missing canonical references", () => {
    const targets = makeTempTargets();
    try {
        const malformedBytes = Buffer.from("{not valid json");
        const malformed = importLiveEvidenceManifest({
            ...validOptions(targets),
            sourceBytes: malformedBytes,
            expectedSha256: sha256(malformedBytes),
        });
        assert.equal(malformed.ok, false);
        assert.ok(malformed.errors.some((message) => message.includes("not valid JSON")));

        const missingReferences = importLiveEvidenceManifest({
            ...validOptions(targets),
            sourceLock: undefined,
            operationInventory: undefined,
        });
        assert.equal(missingReferences.ok, false);
        assert.ok(missingReferences.errors.some((message) => message.startsWith("sourceLock:")));
        assert.ok(
            missingReferences.errors.some((message) => message.startsWith("operationInventory:")),
        );
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("refuses approval that does not bind the exact artifacts", () => {
    const targets = makeTempTargets();
    try {
        const before = fs.readFileSync(targets.targetPath);
        const options = validOptions(targets);
        options.approvalReceipt = { ...options.approvalReceipt, manifestSha256: "0".repeat(64) };
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, false);
        assert.ok(
            result.errors.some((message) =>
                message.includes("approval receipt: manifestSha256 mismatch"),
            ),
        );
        assert.ok(fs.readFileSync(targets.targetPath).equals(before));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("is a no-op only when both imported artifacts already match", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        fs.writeFileSync(targets.targetPath, options.sourceBytes);
        fs.writeFileSync(targets.campaignReceiptTargetPath, options.campaignReceiptBytes);
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, true);
        assert.equal(result.changed, false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("normalizes validated artifacts to canonical JSON instead of copying supplied formatting", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        const manifest = JSON.parse(options.sourceBytes);
        options.sourceBytes = Buffer.from(JSON.stringify(manifest));
        options.expectedSha256 = sha256(options.sourceBytes);

        const receipt = JSON.parse(options.campaignReceiptBytes);
        options.campaignReceiptBytes = Buffer.from(JSON.stringify(receipt));
        options.expectedCampaignReceiptSha256 = sha256(options.campaignReceiptBytes);

        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.ok(fs.readFileSync(targets.targetPath).equals(canonicalJsonBytes(manifest)));
        assert.ok(
            fs.readFileSync(targets.campaignReceiptTargetPath).equals(canonicalJsonBytes(receipt)),
        );
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("compare-and-swap rejects a target changed after the campaign receipt was created", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        const swapped = Buffer.from('{"concurrent":"change"}\n');
        fs.writeFileSync(targets.targetPath, swapped);
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("compare-and-swap")));
        assert.ok(fs.readFileSync(targets.targetPath).equals(swapped));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("exclusive import lock refuses concurrent importers without touching either target", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        const before = fs.readFileSync(targets.targetPath);
        fs.writeFileSync(`${targets.targetPath}.import.lock`, "held");
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("lock is already held")));
        assert.ok(fs.readFileSync(targets.targetPath).equals(before));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("compare-and-swap refuses an import when the tracked target is absent", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        fs.rmSync(targets.targetPath);
        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("compare-and-swap")));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});

test("import rejects recursively hidden receipt fields and secret-like leaves", () => {
    const targets = makeTempTargets();
    try {
        const options = validOptions(targets);
        const receipt = JSON.parse(options.campaignReceiptBytes);
        receipt.cleanup.actions[0].rawResponse = "Bearer hidden-value";
        options.campaignReceiptBytes = canonicalJsonBytes(receipt);
        options.expectedCampaignReceiptSha256 = sha256(options.campaignReceiptBytes);
        options.approvalReceipt.campaignReceiptSha256 = sha256(options.campaignReceiptBytes);

        const result = importLiveEvidenceManifest(options);
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("unknown field rawResponse")));
        assert.ok(result.errors.some((message) => message.includes("sensitive data")));
        assert.equal(fs.existsSync(targets.campaignReceiptTargetPath), false);
    } finally {
        fs.rmSync(targets.dir, { recursive: true, force: true });
    }
});
