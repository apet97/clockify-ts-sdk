import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { importLiveEvidenceManifest } from "./import-live-evidence-manifest.mjs";

const SOURCE_LOCK = Object.freeze({ commit: "a".repeat(40), sourceSha256: "b".repeat(64) });
const OPERATION_INVENTORY = Object.freeze([{ method: "GET", path: "/workspaces/{workspaceId}/projects" }]);

function validManifestObject() {
    return {
        schemaVersion: 1,
        canonicalCommit: SOURCE_LOCK.commit,
        canonicalOpenApiSha256: SOURCE_LOCK.sourceSha256,
        redactionVersion: 1,
        generatedAt: "2026-07-26T00:00:00Z",
        operations: [
            {
                operationKey: "GET /workspaces/{workspaceId}/projects",
                operationId: "getWorkspaceProjects",
                status: "documented",
            },
        ],
    };
}

function makeTempTarget() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "import-live-evidence-manifest-test-"));
    return { dir, targetPath: path.join(dir, "live-evidence-manifest.json") };
}

test("imports a well-formed, hash-verified manifest", () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const sourceBytes = Buffer.from(JSON.stringify(validManifestObject()));
        const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
        const result = importLiveEvidenceManifest({
            sourceBytes,
            expectedSha256,
            targetPath,
            sourceLock: SOURCE_LOCK,
            operationInventory: OPERATION_INVENTORY,
        });
        assert.equal(result.ok, true);
        assert.equal(result.changed, true);
        assert.equal(result.counts.total, 1);
        assert.ok(fs.readFileSync(targetPath).equals(sourceBytes));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to import when the artifact hash does not match the expected SHA-256", () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const sourceBytes = Buffer.from(JSON.stringify(validManifestObject()));
        const wrongSha256 = "0".repeat(64);
        const result = importLiveEvidenceManifest({
            sourceBytes,
            expectedSha256: wrongSha256,
            targetPath,
            sourceLock: SOURCE_LOCK,
            operationInventory: OPERATION_INVENTORY,
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("artifact hash mismatch")));
        assert.equal(fs.existsSync(targetPath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to import a hash-correct but semantically invalid manifest (no headline count without rows)", () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const invalid = { ...validManifestObject(), operations: [] };
        const sourceBytes = Buffer.from(JSON.stringify(invalid));
        const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
        const result = importLiveEvidenceManifest({
            sourceBytes,
            expectedSha256,
            targetPath,
            sourceLock: SOURCE_LOCK,
            operationInventory: OPERATION_INVENTORY,
        });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("must contain at least one row")));
        assert.equal(fs.existsSync(targetPath), false, "an invalid manifest must never be written, even hash-verified");
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("refuses to import malformed JSON even with a correct hash", () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const sourceBytes = Buffer.from("{not valid json");
        const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
        const result = importLiveEvidenceManifest({ sourceBytes, expectedSha256, targetPath, sourceLock: SOURCE_LOCK });
        assert.equal(result.ok, false);
        assert.ok(result.errors.some((message) => message.includes("not valid JSON")));
        assert.equal(fs.existsSync(targetPath), false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("is a no-op when the target already matches the imported bytes", () => {
    const { dir, targetPath } = makeTempTarget();
    try {
        const sourceBytes = Buffer.from(JSON.stringify(validManifestObject()));
        const expectedSha256 = createHash("sha256").update(sourceBytes).digest("hex");
        fs.writeFileSync(targetPath, sourceBytes);
        const result = importLiveEvidenceManifest({
            sourceBytes,
            expectedSha256,
            targetPath,
            sourceLock: SOURCE_LOCK,
            operationInventory: OPERATION_INVENTORY,
        });
        assert.equal(result.ok, true);
        assert.equal(result.changed, false);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
