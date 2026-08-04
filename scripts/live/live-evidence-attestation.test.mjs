import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    canonicalJsonBytes,
    compareHashSnapshots,
    computeHashesFingerprint,
    createCampaignArtifacts,
    GOVERNED_SAFETY_DEMOTIONS,
    hashArtifactTree,
    isDirectInvocation,
    safeErrorSummary,
    validateApprovalReceipt,
    validateCampaignReceipt,
} from "./live-evidence-attestation.mjs";
import { CLEANUP_ENTITY_ORDER } from "./cleanup.mjs";

const INPUTS = ["a.json", "b.mjs"];
const INPUT_HASHES = Object.freeze({ "a.json": "a".repeat(64), "b.mjs": "b".repeat(64) });
const ARTIFACT = Object.freeze({ root: "wrapper/dist", sha256: "c".repeat(64), fileCount: 2 });
const SAFETY_DEMOTIONS = Object.freeze(
    Object.entries(GOVERNED_SAFETY_DEMOTIONS).map(([operationKey, reason]) => ({
        operationKey,
        reason,
    })),
);
const MANIFEST = Object.freeze({
    operations: [
        { operationKey: "GET /x", status: "live-success" },
        { operationKey: "GET /deferred", status: "documented" },
    ],
});

test("direct invocation resolves symlinked paths before exact comparison", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "live-direct-invocation-"));
    const target = path.join(directory, "target.mjs");
    const alias = path.join(directory, "alias.mjs");
    try {
        fs.writeFileSync(target, "export {};\n");
        fs.symlinkSync(target, alias);

        assert.equal(isDirectInvocation(target, target), true);
        assert.equal(isDirectInvocation(alias, target), true);
        assert.equal(isDirectInvocation(path.join(directory, "missing.mjs"), target), false);
        assert.equal(isDirectInvocation(undefined, target), false);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

function validCleanup() {
    return {
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
    };
}

function validReceipt() {
    return {
        schemaVersion: 1,
        baseCommit: "d".repeat(40),
        startedAt: "2026-08-04T00:00:00.000Z",
        completedAt: "2026-08-04T00:01:00.000Z",
        manifestSha256: "e".repeat(64),
        previousManifestSha256: "f".repeat(64),
        campaignInputFingerprint: computeHashesFingerprint(INPUTS, INPUT_HASHES),
        campaignInputHashes: { ...INPUT_HASHES },
        sdkArtifact: { ...ARTIFACT },
        runtime: { nodeVersion: "v22.13.0" },
        outcomes: {
            operationCount: 2,
            liveSuccessCount: 1,
            statusRegressions: 0,
            unexpectedProbeFailures: 0,
            deferredProbeFailures: 3,
            safetyDemotions: [],
        },
        cleanup: validCleanup(),
        lock: { released: true },
    };
}

function validate(receipt) {
    return validateCampaignReceipt(receipt, {
        manifest: MANIFEST,
        manifestSha256: "e".repeat(64),
        campaignInputs: INPUTS,
        campaignInputHashes: INPUT_HASHES,
        sdkArtifact: ARTIFACT,
        baseCommitExists: () => true,
        nowMs: Date.parse("2026-08-04T02:00:00Z"),
    });
}

test("campaign receipt binds exact inputs, artifact, outcomes, cleanup, and lock release", () => {
    assert.deepEqual(validate(validReceipt()), []);
});

test("campaign receipt rejects input drift and SDK artifact drift", () => {
    const inputDrift = validReceipt();
    inputDrift.campaignInputHashes["a.json"] = "0".repeat(64);
    assert.ok(validate(inputDrift).some((message) => message.includes("stale input a.json")));

    const artifactDrift = validReceipt();
    artifactDrift.sdkArtifact.sha256 = "0".repeat(64);
    assert.ok(validate(artifactDrift).some((message) => message.includes("SDK artifact tree")));
});

test("campaign receipt rejects regressions, cleanup uncertainty, and unreleased lock", () => {
    const receipt = validReceipt();
    receipt.outcomes.statusRegressions = 1;
    receipt.cleanup.actions[0].remainingCount = null;
    receipt.cleanup.leftovers = null;
    receipt.lock.released = false;
    const errors = validate(receipt);
    assert.ok(errors.some((message) => message.includes("outcome counts")));
    assert.ok(errors.some((message) => message.includes("cleanup")));
    assert.ok(errors.some((message) => message.includes("lock")));
});

test("campaign receipt recursively closes every nested object", () => {
    const receipt = validReceipt();
    receipt.sdkArtifact.rawResponse = "hidden";
    receipt.runtime.extra = true;
    receipt.outcomes.extra = 1;
    receipt.cleanup.extra = 1;
    receipt.cleanup.actions[0].rawId = "not-permitted";
    receipt.lock.pid = 123;

    const errors = validate(receipt);
    for (const field of ["sdkArtifact", "runtime", "outcomes", "cleanup", "rawId", "lock"]) {
        assert.ok(
            errors.some((message) => message.includes(field)),
            field,
        );
    }
});

test("campaign receipt rejects duplicate, unknown, partial, and impossible cleanup inventories", () => {
    const duplicate = validReceipt();
    duplicate.cleanup.actions[1].entityType = duplicate.cleanup.actions[0].entityType;
    assert.ok(validate(duplicate).some((message) => message.includes("cleanup must be complete")));

    const partial = validReceipt();
    partial.cleanup.actions.pop();
    assert.ok(validate(partial).some((message) => message.includes("cleanup must be complete")));

    const impossible = validReceipt();
    impossible.cleanup.actions[0].sanitizedIdCount = 2;
    impossible.cleanup.actions[0].deletedCount = 1;
    assert.ok(validate(impossible).some((message) => message.includes("cleanup must be complete")));

    const inconsistentLeftovers = validReceipt();
    inconsistentLeftovers.cleanup.actions[0].remainingCount = 1;
    assert.ok(
        validate(inconsistentLeftovers).some((message) =>
            message.includes("cleanup must be complete"),
        ),
    );
});

test("campaign and approval receipts recursively reject secret-like keys and values", () => {
    const receipt = validReceipt();
    receipt.cleanup.actions[0].apiKey = "not-even-a-real-key";
    assert.ok(validate(receipt).some((message) => message.includes("sensitive data")));

    const approval = {
        schemaVersion: 1,
        manifestSha256: "e".repeat(64),
        campaignReceiptSha256: "a".repeat(64),
        approvedBy: "operator@example.com",
        approvedAt: "2026-08-04T01:00:00Z",
    };
    assert.ok(
        validateApprovalReceipt(approval, {
            manifestSha256: "e".repeat(64),
            campaignReceiptSha256: "a".repeat(64),
            campaignCompletedAt: "2026-08-04T00:01:00.000Z",
            nowMs: Date.parse("2026-08-04T02:00:00Z"),
        }).some((message) => message.includes("sensitive data")),
    );
});

test("safety demotions are closed, unique, known, and limited to governed reasons", () => {
    const manifest = {
        operations: [
            ...MANIFEST.operations,
            ...SAFETY_DEMOTIONS.map(({ operationKey }) => ({
                operationKey,
                status: "probe-documented",
            })),
        ],
    };
    const receipt = validReceipt();
    receipt.outcomes.operationCount = manifest.operations.length;
    receipt.outcomes.safetyDemotions = structuredClone(SAFETY_DEMOTIONS);
    const options = {
        manifest,
        manifestSha256: "e".repeat(64),
        campaignInputs: INPUTS,
        campaignInputHashes: INPUT_HASHES,
        sdkArtifact: ARTIFACT,
        baseCommitExists: () => true,
        nowMs: Date.parse("2026-08-04T02:00:00Z"),
    };
    assert.deepEqual(validateCampaignReceipt(receipt, options), []);

    const invalid = structuredClone(receipt);
    invalid.outcomes.safetyDemotions[0].reason = "operator_choice";
    assert.ok(
        validateCampaignReceipt(invalid, options).some((message) =>
            message.includes("outcome counts"),
        ),
    );
});

test("canonical JSON bytes ignore object insertion order and always end with one newline", () => {
    assert.ok(
        canonicalJsonBytes({ b: 2, a: { d: 4, c: 3 } }).equals(
            canonicalJsonBytes({ a: { c: 3, d: 4 }, b: 2 }),
        ),
    );
    assert.equal(canonicalJsonBytes({ a: 1 }).toString("utf8").endsWith("\n"), true);
});

test("approval receipt binds both candidate artifacts and postdates campaign completion", () => {
    const options = {
        manifestSha256: "e".repeat(64),
        campaignReceiptSha256: "a".repeat(64),
        campaignCompletedAt: "2026-08-04T00:01:00.000Z",
        nowMs: Date.parse("2026-08-04T02:00:00Z"),
    };
    const approval = {
        schemaVersion: 1,
        manifestSha256: options.manifestSha256,
        campaignReceiptSha256: options.campaignReceiptSha256,
        approvedBy: "apet97",
        approvedAt: "2026-08-04T01:00:00Z",
    };
    assert.deepEqual(validateApprovalReceipt(approval, options), []);
    assert.ok(
        validateApprovalReceipt({ ...approval, manifestSha256: "0".repeat(64) }, options).some(
            (message) => message.includes("manifestSha256"),
        ),
    );
    assert.ok(
        validateApprovalReceipt({ ...approval, approvedAt: "2026-08-03T23:00:00Z" }, options).some(
            (message) => message.includes("predates"),
        ),
    );
});

test("artifact tree hash binds relative paths and bytes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-evidence-artifact-"));
    try {
        fs.mkdirSync(path.join(dir, "nested"));
        fs.writeFileSync(path.join(dir, "a.js"), "one");
        fs.writeFileSync(path.join(dir, "nested", "b.js"), "two");
        const first = hashArtifactTree(dir);
        assert.equal(first.fileCount, 2);
        fs.writeFileSync(path.join(dir, "nested", "b.js"), "changed");
        assert.notEqual(hashArtifactTree(dir).sha256, first.sha256);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("hash snapshot comparison is deterministic and logs never use error messages", () => {
    assert.deepEqual(compareHashSnapshots({ a: "1", b: "2" }, { a: "1", b: "3", c: "4" }), [
        "b",
        "c",
    ]);
    const error = Object.assign(new Error("secret response body"), {
        statusCode: 503,
        code: "upstream_unavailable",
    });
    assert.deepEqual(safeErrorSummary(error), {
        code: "operation_failed",
        httpStatus: 503,
        httpClass: "5xx",
    });
    assert.equal(JSON.stringify(safeErrorSummary(error)).includes("secret"), false);
});

function artifactOptions(overrides = {}) {
    const manifest = {
        operations: [
            { operationKey: "GET /x", status: "live-success" },
            { operationKey: "GET /deferred", status: "documented" },
        ],
    };
    return {
        manifest,
        previousManifest: structuredClone(manifest),
        previousManifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
        baseCommit: "d".repeat(40),
        startedAt: "2026-08-04T00:00:00.000Z",
        completedAt: "2026-08-04T00:01:00.000Z",
        inputBefore: {
            hashes: { "a.json": "a".repeat(64) },
            fingerprint: computeHashesFingerprint(["a.json"], { "a.json": "a".repeat(64) }),
        },
        inputAfter: {
            hashes: { "a.json": "a".repeat(64) },
            fingerprint: computeHashesFingerprint(["a.json"], { "a.json": "a".repeat(64) }),
        },
        artifactBefore: ARTIFACT,
        artifactAfter: ARTIFACT,
        probeFailures: [{ operationKey: "GET /deferred" }],
        cleanup: validCleanup(),
        lockReleased: true,
        nodeVersion: "v22.13.0",
        validateManifest: () => [],
        baseCommitExists: () => true,
        nowMs: Date.parse("2026-08-04T02:00:00Z"),
        ...overrides,
    };
}

test("candidate artifacts are emitted only after lifecycle invariants pass", () => {
    const result = createCampaignArtifacts(artifactOptions());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.receipt.outcomes.deferredProbeFailures, 1);
    assert.equal(result.receipt.outcomes.unexpectedProbeFailures, 0);
});

test("candidate emission permits only the complete governed safety-demotion set", () => {
    const current = artifactOptions().manifest;
    current.operations.push(
        ...SAFETY_DEMOTIONS.map(({ operationKey }) => ({
            operationKey,
            status: "probe-documented",
        })),
    );
    const previous = structuredClone(current);
    for (const operation of previous.operations.slice(-SAFETY_DEMOTIONS.length)) {
        operation.status = "live-success";
    }
    const valid = createCampaignArtifacts(
        artifactOptions({
            manifest: current,
            previousManifest: previous,
            safetyDemotions: structuredClone(SAFETY_DEMOTIONS),
        }),
    );
    assert.equal(valid.ok, true, JSON.stringify(valid));

    const ungoverned = createCampaignArtifacts(
        artifactOptions({
            manifest: current,
            previousManifest: previous,
            safetyDemotions: [
                ...structuredClone(SAFETY_DEMOTIONS),
                { operationKey: "GET /x", reason: "operator_choice" },
            ],
        }),
    );
    assert.equal(ungoverned.ok, false);
});

test("candidate emission fails closed on regression, input drift, cleanup failure, or held lock", () => {
    const regression = artifactOptions();
    regression.manifest.operations[0].status = "documented";
    assert.equal(createCampaignArtifacts(regression).ok, false);

    const inputDrift = artifactOptions({
        inputAfter: { hashes: { "a.json": "0".repeat(64) }, fingerprint: "0".repeat(64) },
    });
    assert.equal(createCampaignArtifacts(inputDrift).ok, false);

    const cleanupFailure = artifactOptions({
        cleanup: { ...validReceipt().cleanup, leftovers: 1 },
    });
    assert.equal(createCampaignArtifacts(cleanupFailure).ok, false);

    assert.equal(createCampaignArtifacts(artifactOptions({ lockReleased: false })).ok, false);
});

test("a failure on a previously live or unknown operation is never silently deferred", () => {
    assert.equal(
        createCampaignArtifacts(artifactOptions({ probeFailures: [{ operationKey: "GET /x" }] }))
            .ok,
        false,
    );
    assert.equal(
        createCampaignArtifacts(artifactOptions({ probeFailures: [{ operationKey: "GET /new" }] }))
            .ok,
        false,
    );
});
