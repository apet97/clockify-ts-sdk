#!/usr/bin/env node
// Binds the already-imported live-evidence manifest's trustworthiness to the
// exact governed inputs that determine whether it is still current: the
// upstream OpenAPI source lock, the canonical operation inventory, and the
// local live-harness generator that ran the sandbox probe campaign
// (docs/live-evidence-currentness-contract.json names the exact list).
//
// A manifest that predates a change to any governed input is stale and must
// be rejected as release evidence -- staleness is fixed only by a genuine
// re-verification against the real governed inputs, never by hand-editing
// docs/live-evidence-currentness.json to match. This module also re-runs the
// existing manifest-vs-source-lock/operation-inventory cross-check
// (check-live-evidence-manifest.mjs) instead of duplicating that logic.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateLiveEvidenceManifest } from "./check-live-evidence-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;

function sha256Hex(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}

function isSafeRelativePath(value) {
    if (typeof value !== "string" || value.trim().length === 0) return false;
    const normalized = path.normalize(value).replace(/\\/g, "/");
    return !path.isAbsolute(value) && normalized !== ".." && !normalized.startsWith("../");
}

/** Deterministic combined fingerprint over an ordered list of governed inputs and their hashes. */
export function computeInputFingerprint(governedInputs, inputHashes) {
    const lines = governedInputs.map((inputPath) => `${inputPath}:${inputHashes[inputPath] ?? ""}`);
    return sha256Hex(Buffer.from(lines.join("\n"), "utf8"));
}

/**
 * Hash every governed input via the injected reader (testable without real
 * files). Returns { hashes, missing } -- missing lists inputs the reader
 * could not resolve, so callers can classify them as stale instead of
 * throwing.
 */
export function hashGovernedInputs(governedInputs, readFileBytes) {
    const hashes = {};
    const missing = [];
    for (const inputPath of governedInputs) {
        let bytes = null;
        try {
            bytes = readFileBytes(inputPath);
        } catch {
            bytes = null;
        }
        if (!Buffer.isBuffer(bytes)) {
            missing.push(inputPath);
            continue;
        }
        hashes[inputPath] = sha256Hex(bytes);
    }
    return { hashes, missing };
}

/**
 * Pure currentness check: recomputes governed-input hashes and the combined
 * fingerprint, compares them against the recorded currentness record, and
 * (when a manifest is supplied) re-validates it against the current source
 * lock and operation inventory. Returns { ok, staleReasons, errors }.
 */
export function checkLiveEvidenceCurrentness({
    governedInputs,
    readFileBytes,
    record,
    manifest,
    sourceLock,
    operationInventory,
}) {
    const staleReasons = [];
    const errors = [];

    if (!Array.isArray(governedInputs) || governedInputs.length === 0) {
        errors.push("governedInputs must be a non-empty array");
        return { ok: false, staleReasons, errors };
    }

    const validInputs = [];
    for (const inputPath of governedInputs) {
        if (isSafeRelativePath(inputPath)) {
            validInputs.push(inputPath);
        } else {
            errors.push(`governedInputs: unsafe path ${JSON.stringify(inputPath)}`);
        }
    }

    const { hashes: actualHashes, missing } = hashGovernedInputs(validInputs, readFileBytes);
    for (const inputPath of missing) {
        staleReasons.push({ path: inputPath, reason: "governed input could not be read" });
    }

    const recordedHashes = record?.inputHashes ?? {};
    for (const inputPath of validInputs) {
        if (missing.includes(inputPath)) continue;
        const recordedHash = recordedHashes[inputPath];
        const actualHash = actualHashes[inputPath];
        if (recordedHash !== actualHash) {
            staleReasons.push({
                path: inputPath,
                reason: "content changed since currentness was last verified",
                recordedHash: recordedHash ?? null,
                actualHash,
            });
        }
    }

    if (missing.length === 0 && errors.length === 0) {
        const actualFingerprint = computeInputFingerprint(validInputs, actualHashes);
        if (record?.inputFingerprint !== actualFingerprint) {
            staleReasons.push({
                path: "<combined>",
                reason: "input fingerprint does not match the recorded currentness record",
                recordedHash: record?.inputFingerprint ?? null,
                actualHash: actualFingerprint,
            });
        }
    }

    if (record != null) {
        if (!FULL_COMMIT_SHA_RE.test(record.proofCommit ?? "")) {
            errors.push("record.proofCommit must be a full 40-character lowercase hex commit SHA");
        }
        if (!HEX_SHA256_RE.test(record.inputFingerprint ?? "")) {
            errors.push("record.inputFingerprint must be a 64-character lowercase hex SHA-256 digest");
        }
    } else {
        errors.push("no currentness record supplied");
    }

    if (manifest !== undefined) {
        errors.push(...validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory }));
    }

    return { ok: staleReasons.length === 0 && errors.length === 0, staleReasons, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const contract = JSON.parse(
        fs.readFileSync(path.join(root, "docs", "live-evidence-currentness-contract.json"), "utf8"),
    );
    const recordPath = path.join(root, contract.wiring.recordPath);
    if (!fs.existsSync(recordPath)) {
        console.error(
            `${path.relative(root, recordPath)} does not exist yet -- it is written only once the governed inputs have been genuinely re-verified as current.`,
        );
        process.exit(1);
    }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

    const manifestPath = path.join(root, "spec", "evidence", "live-evidence-manifest.json");
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : undefined;
    const sourceLockPath = path.join(root, "docs", "openapi-source-lock.json");
    const sourceLock = fs.existsSync(sourceLockPath) ? JSON.parse(fs.readFileSync(sourceLockPath, "utf8")) : undefined;
    const operationInventoryPath = path.join(root, "docs", "openapi-operations.json");
    const operationInventory = fs.existsSync(operationInventoryPath)
        ? JSON.parse(fs.readFileSync(operationInventoryPath, "utf8")).operations
        : undefined;

    const result = checkLiveEvidenceCurrentness({
        governedInputs: contract.governedInputs,
        readFileBytes: (relPath) => fs.readFileSync(path.join(root, relPath)),
        record,
        manifest,
        sourceLock,
        operationInventory,
    });

    if (!result.ok) {
        console.error("live-evidence-currentness check failed:");
        if (result.staleReasons.length > 0) {
            console.error(JSON.stringify({ staleReasons: result.staleReasons }, null, 2));
        }
        for (const message of result.errors) console.error(`- ${message}`);
        process.exit(1);
    }
    console.log(
        `live-evidence-currentness: current (proofCommit=${record.proofCommit}, ${contract.governedInputs.length} governed inputs)`,
    );
}
