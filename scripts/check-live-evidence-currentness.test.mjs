import assert from "node:assert/strict";
import { test } from "node:test";

import {
    checkLiveEvidenceCurrentness,
    computeInputFingerprint,
    hashGovernedInputs,
} from "./check-live-evidence-currentness.mjs";

const GOVERNED_INPUTS = [
    "docs/openapi-source-lock.json",
    "docs/openapi-operations.json",
    "scripts/live/generate-live-evidence-manifest.mjs",
];

const FIXTURE_BYTES = {
    "docs/openapi-source-lock.json": Buffer.from("source-lock-v1"),
    "docs/openapi-operations.json": Buffer.from("operation-inventory-v1"),
    "scripts/live/generate-live-evidence-manifest.mjs": Buffer.from("generator-v1"),
};

function reader(bytesByPath) {
    return (relPath) => {
        const bytes = bytesByPath[relPath];
        if (!Buffer.isBuffer(bytes)) throw new Error(`fixture missing: ${relPath}`);
        return bytes;
    };
}

function buildCurrentRecord() {
    const { hashes } = hashGovernedInputs(GOVERNED_INPUTS, reader(FIXTURE_BYTES));
    return {
        schemaVersion: 1,
        proofCommit: "2e1fcdfc975c28a4959f287cf28c6d5ab04cb298",
        inputFingerprint: computeInputFingerprint(GOVERNED_INPUTS, hashes),
        inputHashes: hashes,
    };
}

test("computeInputFingerprint is deterministic and order-sensitive", () => {
    const hashes = { a: "111", b: "222" };
    assert.equal(computeInputFingerprint(["a", "b"], hashes), computeInputFingerprint(["a", "b"], hashes));
    assert.notEqual(computeInputFingerprint(["a", "b"], hashes), computeInputFingerprint(["b", "a"], hashes));
});

test("accepts a record whose recorded hashes match current governed-input bytes", () => {
    const record = buildCurrentRecord();
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(FIXTURE_BYTES),
        record,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.staleReasons, []);
});

test("rejects a source-lock content change with an exact stale reason naming that path", () => {
    const record = buildCurrentRecord();
    const mutated = { ...FIXTURE_BYTES, "docs/openapi-source-lock.json": Buffer.from("source-lock-v2-DIFFERENT") };
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(mutated),
        record,
    });
    assert.equal(result.ok, false);
    const paths = result.staleReasons.map((entry) => entry.path);
    assert.ok(paths.includes("docs/openapi-source-lock.json"), JSON.stringify(result.staleReasons));
});

test("rejects an operation-inventory content change with an exact stale reason naming that path", () => {
    const record = buildCurrentRecord();
    const mutated = { ...FIXTURE_BYTES, "docs/openapi-operations.json": Buffer.from("operation-inventory-v2-DIFFERENT") };
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(mutated),
        record,
    });
    assert.equal(result.ok, false);
    const paths = result.staleReasons.map((entry) => entry.path);
    assert.ok(paths.includes("docs/openapi-operations.json"), JSON.stringify(result.staleReasons));
});

test("rejects a governed live-request implementation change with an exact stale reason naming that path", () => {
    const record = buildCurrentRecord();
    const mutated = {
        ...FIXTURE_BYTES,
        "scripts/live/generate-live-evidence-manifest.mjs": Buffer.from("generator-v2-DIFFERENT"),
    };
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(mutated),
        record,
    });
    assert.equal(result.ok, false);
    const paths = result.staleReasons.map((entry) => entry.path);
    assert.ok(
        paths.includes("scripts/live/generate-live-evidence-manifest.mjs"),
        JSON.stringify(result.staleReasons),
    );
});

test("a mismatched combined fingerprint alone is caught even if per-input hashes were hand-edited to match", () => {
    const record = buildCurrentRecord();
    record.inputFingerprint = "0".repeat(64);
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(FIXTURE_BYTES),
        record,
    });
    assert.equal(result.ok, false);
    assert.ok(result.staleReasons.some((entry) => entry.path === "<combined>"), JSON.stringify(result.staleReasons));
});

test("rejects a record with a malformed proofCommit or fingerprint shape", () => {
    const record = buildCurrentRecord();
    record.proofCommit = "not-a-sha";
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(FIXTURE_BYTES),
        record,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((message) => message.includes("proofCommit")), JSON.stringify(result.errors));
});

test("flags an unreadable governed input as stale rather than throwing", () => {
    const record = buildCurrentRecord();
    const partial = { ...FIXTURE_BYTES };
    delete partial["docs/openapi-operations.json"];
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(partial),
        record,
    });
    assert.equal(result.ok, false);
    assert.ok(
        result.staleReasons.some((entry) => entry.path === "docs/openapi-operations.json"),
        JSON.stringify(result.staleReasons),
    );
});

test("delegates manifest-vs-source-lock/operation-inventory validation instead of duplicating it", () => {
    const record = buildCurrentRecord();
    const staleManifest = {
        schemaVersion: 1,
        canonicalCommit: "f".repeat(40),
        canonicalOpenApiSha256: "a".repeat(64),
        redactionVersion: 1,
        generatedAt: "2020-01-01T00:00:00Z",
        operations: [{ operationKey: "GET /x", operationId: "getX", status: "documented" }],
    };
    const result = checkLiveEvidenceCurrentness({
        governedInputs: GOVERNED_INPUTS,
        readFileBytes: reader(FIXTURE_BYTES),
        record,
        manifest: staleManifest,
        sourceLock: { commit: "0".repeat(40), sourceSha256: "1".repeat(64) },
        operationInventory: [{ method: "GET", path: "/x" }],
    });
    assert.equal(result.ok, false);
    assert.ok(
        result.errors.some((message) => message.includes("stale")),
        JSON.stringify(result.errors),
    );
});
