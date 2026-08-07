#!/usr/bin/env node
// Binds the already-imported live-evidence manifest's trustworthiness to the
// exact governed inputs that determine whether it is still current: the
// upstream OpenAPI source lock, the downstream corrected snapshot, the
// canonical operation inventory, and the local live-harness generator
// (docs/live-evidence-currentness-contract.json names the exact list).
//
// A manifest that predates a change to any governed input is stale and must
// be rejected as release evidence -- staleness is fixed only by a genuine
// re-verification against the real governed inputs, never by hand-editing
// docs/live-evidence-currentness.json to match. This module also re-runs the
// existing manifest-vs-source-lock/operation-inventory cross-check
// (check-live-evidence-manifest.mjs) instead of duplicating that logic.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateLiveEvidenceManifest } from "./check-live-evidence-manifest.mjs";
import {
    validateApprovalReceipt,
    validateCampaignReceipt,
} from "./live/live-evidence-attestation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FULL_COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
const HEX_SHA256_RE = /^[0-9a-f]{64}$/;
const UTC_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RECORD_FIELDS = new Set([
    "schemaVersion",
    "attestationMode",
    "baseCommit",
    "verifiedAt",
    "manifestSha256",
    "campaignReceiptSha256",
    "approvalReceiptSha256",
    "inputFingerprint",
    "inputHashes",
]);

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
 * Read each input once and retain an immutable byte snapshot. Callers can then
 * parse and hash the same bytes instead of reopening mutable files between
 * validation steps.
 */
export function captureInputSnapshot(inputPaths, readFileBytes) {
    const bytesByPath = new Map();
    for (const inputPath of new Set(inputPaths)) {
        try {
            const bytes = readFileBytes(inputPath);
            if (Buffer.isBuffer(bytes)) bytesByPath.set(inputPath, Buffer.from(bytes));
        } catch {
            // The snapshot reader below reports missing inputs to the validator.
        }
    }
    return (inputPath) => {
        const bytes = bytesByPath.get(inputPath);
        if (!bytes) throw new Error(`input absent from byte snapshot: ${inputPath}`);
        return bytes;
    };
}

/**
 * Pure currentness check: recomputes governed-input hashes and the combined
 * fingerprint, compares them against the recorded currentness record, and
 * (when a manifest is supplied) re-validates it against the current source
 * lock and operation inventory. Returns { ok, staleReasons, errors }.
 */
export function checkLiveEvidenceCurrentness({
    governedInputs,
    campaignInputs,
    readFileBytes,
    record,
    manifest,
    campaignReceipt,
    approvalReceipt,
    sourceLock,
    operationInventory,
    baseCommitExists = () => true,
    nowMs = Date.now(),
}) {
    const staleReasons = [];
    const errors = [];

    if (!Array.isArray(governedInputs) || governedInputs.length === 0) {
        errors.push("governedInputs must be a non-empty array");
        return { ok: false, staleReasons, errors };
    }

    const validInputs = [];
    const seenGovernedInputs = new Set();
    for (const inputPath of governedInputs) {
        if (seenGovernedInputs.has(inputPath)) {
            errors.push(`governedInputs: duplicate path ${JSON.stringify(inputPath)}`);
        } else if (isSafeRelativePath(inputPath)) {
            validInputs.push(inputPath);
        } else {
            errors.push(`governedInputs: unsafe path ${JSON.stringify(inputPath)}`);
        }
        seenGovernedInputs.add(inputPath);
    }

    if (!Array.isArray(campaignInputs) || campaignInputs.length === 0) {
        errors.push("campaignInputs must be a non-empty array");
    } else {
        const seenCampaignInputs = new Set();
        for (const inputPath of campaignInputs) {
            if (seenCampaignInputs.has(inputPath)) {
                errors.push(`campaignInputs: duplicate path ${JSON.stringify(inputPath)}`);
            } else if (!isSafeRelativePath(inputPath)) {
                errors.push(`campaignInputs: unsafe path ${JSON.stringify(inputPath)}`);
            } else if (!validInputs.includes(inputPath)) {
                errors.push(`campaignInputs: ${inputPath} must also be a governed input`);
            }
            seenCampaignInputs.add(inputPath);
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

    if (record != null && typeof record === "object" && !Array.isArray(record)) {
        for (const key of Object.keys(record)) {
            if (!RECORD_FIELDS.has(key)) errors.push(`record: unknown field ${key}`);
        }
        for (const field of RECORD_FIELDS) {
            if (!(field in record)) errors.push(`record: missing required field ${field}`);
        }
        if (record.schemaVersion !== 2) errors.push("record.schemaVersion must be exactly 2");
        if (record.attestationMode !== "base-commit-plus-content-hashes") {
            errors.push("record.attestationMode must be base-commit-plus-content-hashes");
        }
        if (!FULL_COMMIT_SHA_RE.test(record.baseCommit ?? "")) {
            errors.push("record.baseCommit must be a full 40-character lowercase hex commit SHA");
        } else if (!baseCommitExists(record.baseCommit)) {
            errors.push("record.baseCommit does not exist in the repository");
        }
        if (
            !UTC_INSTANT_RE.test(record.verifiedAt ?? "") ||
            !Number.isFinite(Date.parse(record.verifiedAt))
        ) {
            errors.push("record.verifiedAt must be a strict UTC ISO-8601 instant");
        } else if (Date.parse(record.verifiedAt) > nowMs + 5 * 60_000) {
            errors.push("record.verifiedAt must not be in the future");
        }
        if (!HEX_SHA256_RE.test(record.inputFingerprint ?? "")) {
            errors.push(
                "record.inputFingerprint must be a 64-character lowercase hex SHA-256 digest",
            );
        }
        if (
            record.inputHashes == null ||
            typeof record.inputHashes !== "object" ||
            Array.isArray(record.inputHashes)
        ) {
            errors.push("record.inputHashes must be an object");
        } else {
            const recordedInputPaths = Object.keys(record.inputHashes);
            for (const inputPath of recordedInputPaths) {
                if (!validInputs.includes(inputPath)) {
                    errors.push(`record.inputHashes: unknown path ${inputPath}`);
                } else if (!HEX_SHA256_RE.test(record.inputHashes[inputPath] ?? "")) {
                    errors.push(`record.inputHashes: invalid SHA-256 digest for ${inputPath}`);
                }
            }
            for (const inputPath of validInputs) {
                if (!Object.hasOwn(record.inputHashes, inputPath)) {
                    errors.push(`record.inputHashes: missing path ${inputPath}`);
                }
            }
        }
    } else {
        errors.push("no currentness record supplied");
    }

    if (manifest === undefined) errors.push("live-evidence manifest is required");
    else
        errors.push(
            ...validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory, nowMs }),
        );

    // The manifest-vs-lock cross-check above only proves internal
    // consistency: that the manifest agrees with whatever the lock claims.
    // It never proves the lock itself tells the truth about the bytes this
    // repo actually ships. Compare the lock's attested hash/size directly
    // against the shipped snapshot's real, freshly-computed hash (audit
    // S-01/finding F1: the lock attested a stale GOCLMCP commit while every
    // other gate passed because nothing made this comparison).
    const shippedSpecPath = "spec/corrected/clockify.corrected.openapi.yaml";
    if (sourceLock !== undefined && validInputs.includes(shippedSpecPath)) {
        const actualSpecSha256 = actualHashes[shippedSpecPath];
        if (actualSpecSha256 !== undefined && sourceLock.sourceSha256 !== actualSpecSha256) {
            errors.push(
                `docs/openapi-source-lock.json sourceSha256 (${sourceLock.sourceSha256}) does not match the shipped snapshot's real hash (${actualSpecSha256}) -- the lock diverged from the bytes this repo ships`,
            );
        }
        const shippedBytes = readFileBytes(shippedSpecPath)?.length;
        if (
            shippedBytes !== undefined &&
            typeof sourceLock.sourceBytes === "number" &&
            sourceLock.sourceBytes !== shippedBytes
        ) {
            errors.push(
                `docs/openapi-source-lock.json sourceBytes (${sourceLock.sourceBytes}) does not match the shipped snapshot's real size (${shippedBytes})`,
            );
        }
    }

    if (campaignReceipt === undefined) {
        errors.push("live-evidence campaign receipt is required");
    }
    if (approvalReceipt === undefined) {
        errors.push("live-evidence approval receipt is required");
    }

    const manifestSha256 = actualHashes["spec/evidence/live-evidence-manifest.json"];
    const campaignReceiptSha256 = actualHashes["spec/evidence/live-evidence-campaign-receipt.json"];
    const approvalReceiptSha256 = actualHashes["docs/live-evidence-approval.json"];
    if (record != null) {
        for (const [field, actual] of [
            ["manifestSha256", manifestSha256],
            ["campaignReceiptSha256", campaignReceiptSha256],
            ["approvalReceiptSha256", approvalReceiptSha256],
        ]) {
            if (!HEX_SHA256_RE.test(record[field] ?? "") || record[field] !== actual) {
                errors.push(`record.${field} does not match the governed artifact bytes`);
            }
        }
    }

    if (campaignReceipt !== undefined && manifest !== undefined && Array.isArray(campaignInputs)) {
        const currentCampaignHashes = Object.fromEntries(
            campaignInputs
                .filter((inputPath) => actualHashes[inputPath] !== undefined)
                .map((inputPath) => [inputPath, actualHashes[inputPath]]),
        );
        errors.push(
            ...validateCampaignReceipt(campaignReceipt, {
                manifest,
                manifestSha256,
                campaignInputs,
                campaignInputHashes: currentCampaignHashes,
                sdkArtifact: campaignReceipt.sdkArtifact,
                baseCommitExists,
                nowMs,
            }),
        );
        if (record?.baseCommit !== campaignReceipt.baseCommit) {
            errors.push("record.baseCommit does not match the campaign receipt");
        }
    }
    if (approvalReceipt !== undefined && campaignReceipt !== undefined) {
        errors.push(
            ...validateApprovalReceipt(approvalReceipt, {
                manifestSha256,
                campaignReceiptSha256,
                campaignCompletedAt: campaignReceipt.completedAt,
                nowMs,
            }),
        );
        if (
            UTC_INSTANT_RE.test(record?.verifiedAt ?? "") &&
            UTC_INSTANT_RE.test(approvalReceipt.approvedAt ?? "") &&
            Date.parse(record.verifiedAt) < Date.parse(approvalReceipt.approvedAt)
        ) {
            errors.push("record.verifiedAt predates the human approval receipt");
        }
    }

    return { ok: staleReasons.length === 0 && errors.length === 0, staleReasons, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const contractRelativePath = "docs/live-evidence-currentness-contract.json";
    const contractBytes = fs.readFileSync(path.join(root, contractRelativePath));
    const contract = JSON.parse(contractBytes.toString("utf8"));
    const snapshotRead = captureInputSnapshot(contract.governedInputs, (relativePath) =>
        relativePath === contractRelativePath
            ? contractBytes
            : fs.readFileSync(path.join(root, relativePath)),
    );
    const recordPath = path.join(root, contract.wiring.recordPath);
    if (!fs.existsSync(recordPath)) {
        console.error(
            `${path.relative(root, recordPath)} does not exist yet -- it is written only once the governed inputs have been genuinely re-verified as current.`,
        );
        process.exit(1);
    }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));

    const parseSnapshot = (relativePath) => {
        try {
            return JSON.parse(snapshotRead(relativePath).toString("utf8"));
        } catch {
            return undefined;
        }
    };
    const manifest = parseSnapshot(contract.manifestPath);
    const campaignReceipt = parseSnapshot(contract.campaignReceiptPath);
    const approvalReceipt = parseSnapshot(contract.approvalReceiptPath);
    const sourceLock = parseSnapshot("docs/openapi-source-lock.json");
    const operationInventory = parseSnapshot("docs/openapi-operations.json")?.operations;

    const result = checkLiveEvidenceCurrentness({
        governedInputs: contract.governedInputs,
        campaignInputs: contract.campaignInputs,
        readFileBytes: snapshotRead,
        record,
        manifest,
        campaignReceipt,
        approvalReceipt,
        sourceLock,
        operationInventory,
        baseCommitExists: (commit) =>
            spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
                cwd: root,
                stdio: "ignore",
            }).status === 0,
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
        `live-evidence-currentness: current (baseCommit=${record.baseCommit}, ${contract.governedInputs.length} governed inputs)`,
    );
}
