import assert from "node:assert/strict";
import { test } from "node:test";

import {
    deriveHeadlineCounts,
    scanForSensitiveData,
    validateLiveEvidenceManifest,
    validateLiveEvidenceManifestShape,
} from "./check-live-evidence-manifest.mjs";

const SOURCE_LOCK = Object.freeze({
    commit: "a".repeat(40),
    sourceSha256: "b".repeat(64),
});

const OPERATION_INVENTORY = Object.freeze([
    { method: "GET", path: "/workspaces/{workspaceId}/projects" },
    { method: "POST", path: "/workspaces/{workspaceId}/tags" },
]);

function validRow(overrides = {}) {
    return {
        operationKey: "GET /workspaces/{workspaceId}/projects",
        operationId: "getWorkspaceProjects",
        status: "documented",
        ...overrides,
    };
}

function validLiveSuccessRow(overrides = {}) {
    return validRow({
        operationKey: "POST /workspaces/{workspaceId}/tags",
        operationId: "createTag",
        status: "live-success",
        proofKind: "read-only",
        observedHttpClass: "2xx",
        requestShapeSha256: "c".repeat(64),
        responseShapeSha256: "d".repeat(64),
        evidenceId: "evidence-001",
        verifiedAt: "2026-07-26T00:00:00Z",
        ...overrides,
    });
}

function validManifest(rows) {
    return {
        schemaVersion: 1,
        canonicalCommit: SOURCE_LOCK.commit,
        canonicalOpenApiSha256: SOURCE_LOCK.sourceSha256,
        redactionVersion: 1,
        generatedAt: "2026-07-26T00:00:00Z",
        operations: rows,
    };
}

test("accepts a well-formed manifest covering the full canonical inventory", () => {
    const manifest = validManifest([validRow(), validLiveSuccessRow()]);
    assert.deepEqual(validateLiveEvidenceManifestShape(manifest), []);
    assert.deepEqual(
        validateLiveEvidenceManifest(manifest, { sourceLock: SOURCE_LOCK, operationInventory: OPERATION_INVENTORY }),
        [],
    );
});

test("rejects a manifest missing a required operation row", () => {
    const manifest = validManifest([validRow()]); // missing the second canonical operation
    const errors = validateLiveEvidenceManifest(manifest, { sourceLock: SOURCE_LOCK, operationInventory: OPERATION_INVENTORY });
    assert.ok(
        errors.some((message) => message.includes("missing a row for canonical operation POST /workspaces/{workspaceId}/tags")),
        `expected missing-operation error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects duplicate operationKey rows", () => {
    const manifest = validManifest([validRow(), validRow()]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(
        errors.some((message) => message.includes("duplicate operationKey")),
        `expected duplicate-key error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects an unknown status value", () => {
    const manifest = validManifest([validRow({ status: "totally-fine-trust-me" }), validLiveSuccessRow()]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(
        errors.some((message) => message.includes("unknown status")),
        `expected unknown-status error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a row containing secret-like data (24-hex id, email, URL)", () => {
    const manifest = validManifest([
        validRow({ operationId: "workspace 507f1f77bcf86cd799439011 lookup" }),
        validLiveSuccessRow(),
    ]);
    const findings = scanForSensitiveData(manifest);
    assert.ok(
        findings.some((message) => message.includes("24-hex")),
        `expected a 24-hex finding, got: ${JSON.stringify(findings)}`,
    );

    const emailManifest = validManifest([validRow({ operationId: "notify alex@example.com" }), validLiveSuccessRow()]);
    assert.ok(scanForSensitiveData(emailManifest).some((message) => message.includes("email")));

    const urlManifest = validManifest([validRow({ operationId: "see https://internal.example/leak" }), validLiveSuccessRow()]);
    assert.ok(scanForSensitiveData(urlManifest).some((message) => message.includes("URL")));
});

test("rejects a manifest tied to a stale source-lock fingerprint", () => {
    const manifest = validManifest([validRow(), validLiveSuccessRow()]);
    manifest.canonicalCommit = "f".repeat(40);
    const errors = validateLiveEvidenceManifest(manifest, { sourceLock: SOURCE_LOCK, operationInventory: OPERATION_INVENTORY });
    assert.ok(
        errors.some((message) => message.startsWith("canonicalCommit: stale")),
        `expected stale-commit error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects an unverifiable (malformed) proof SHA", () => {
    const manifest = validManifest([validRow(), validLiveSuccessRow({ requestShapeSha256: "not-a-real-hash" })]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(
        errors.some((message) => message.includes("requestShapeSha256")),
        `expected malformed-hash error, got: ${JSON.stringify(errors)}`,
    );
});

test("rejects a live-success row missing evidence id or verified time", () => {
    const manifest = validManifest([
        validRow(),
        {
            operationKey: "POST /workspaces/{workspaceId}/tags",
            operationId: "createTag",
            status: "live-success",
            proofKind: "read-only",
            observedHttpClass: "2xx",
            requestShapeSha256: "c".repeat(64),
            responseShapeSha256: "d".repeat(64),
            // evidenceId and verifiedAt deliberately omitted
        },
    ]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(errors.some((message) => message.includes("live-success rows require evidenceId")));
    assert.ok(errors.some((message) => message.includes("live-success rows require verifiedAt")));
});

test("rejects a sandbox-mutation row without a cleanup state", () => {
    const manifest = validManifest([validRow(), validLiveSuccessRow({ proofKind: "sandbox-mutation" })]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(errors.some((message) => message.includes("sandbox-mutation rows require a cleanup state")));
});

test("rejects a row for an operation outside the canonical inventory", () => {
    const manifest = validManifest([
        validRow(),
        validLiveSuccessRow(),
        validRow({ operationKey: "DELETE /workspaces/{workspaceId}/does-not-exist", operationId: "phantom" }),
    ]);
    const errors = validateLiveEvidenceManifest(manifest, { sourceLock: SOURCE_LOCK, operationInventory: OPERATION_INVENTORY });
    assert.ok(errors.some((message) => message.includes("unknown operation DELETE /workspaces/{workspaceId}/does-not-exist")));
});

test("headline counts are derived from rows, never accepted as a free-standing input", () => {
    const manifest = validManifest([validRow(), validLiveSuccessRow()]);
    const counts = deriveHeadlineCounts(manifest);
    assert.equal(counts.total, 2);
    assert.equal(counts["live-success"], 1);
    assert.equal(counts.documented, 1);
    assert.ok(!("headlineCount" in manifest), "the schema itself has no free-standing headline-count field");
});

test("an empty operations array is rejected, not treated as zero live-success", () => {
    const manifest = validManifest([]);
    const errors = validateLiveEvidenceManifestShape(manifest);
    assert.ok(errors.some((message) => message.includes("must contain at least one row")));
});
