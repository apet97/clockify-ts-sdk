#!/usr/bin/env node
// Import a freshly generated, human-approved live-evidence manifest
// (H01-LIVE) into spec/evidence/live-evidence-manifest.json. The sandbox
// campaign writes a sanitized candidate outside the tracked evidence tree;
// this separate step binds the exact approved bytes before import.
//
// Requires the exact expected SHA-256 of the source artifact bytes (H01-LIVE
// must supply this) so a swapped or tampered file cannot be imported
// silently. Refuses to write when hash verification, shape validation,
// source-lock fingerprint currency, or exact operation-set coverage fails.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    deriveHeadlineCounts,
    validateLiveEvidenceManifest,
} from "./check-live-evidence-manifest.mjs";
import { captureInputSnapshot } from "./check-live-evidence-currentness.mjs";
import {
    canonicalJsonBytes,
    hashArtifactTree,
    hashRelativeFiles,
    validateApprovalReceipt,
    validateCampaignReceipt,
    writeFileAtomic,
} from "./live/live-evidence-attestation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Verify an upstream manifest artifact's bytes against an expected SHA-256,
 * validate it, and atomically write it to targetPath only on success.
 * Never accepts a headline count as input -- counts are always derived
 * from validated operation rows after the fact. Returns
 * { ok, errors, changed, counts? } and never touches targetPath on failure.
 */
export function importLiveEvidenceManifest({
    sourceBytes,
    expectedSha256,
    targetPath,
    campaignReceiptBytes,
    expectedCampaignReceiptSha256,
    campaignReceiptTargetPath,
    approvalReceipt,
    sourceLock,
    operationInventory,
    campaignInputs,
    campaignInputHashes,
    sdkArtifact,
    baseCommitExists,
    nowMs,
}) {
    const errors = [];

    if (!Buffer.isBuffer(sourceBytes)) {
        return { ok: false, errors: ["sourceBytes must be a Buffer"], changed: false };
    }
    if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
        return {
            ok: false,
            errors: ["expectedSha256 must be a 64-character lowercase hex SHA-256 digest"],
            changed: false,
        };
    }
    if (!Buffer.isBuffer(campaignReceiptBytes)) {
        errors.push("campaignReceiptBytes must be a Buffer");
    }
    if (
        typeof expectedCampaignReceiptSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(expectedCampaignReceiptSha256)
    ) {
        errors.push(
            "expectedCampaignReceiptSha256 must be a 64-character lowercase hex SHA-256 digest",
        );
    }
    if (typeof campaignReceiptTargetPath !== "string" || campaignReceiptTargetPath.length === 0) {
        errors.push("campaignReceiptTargetPath is required");
    }
    if (typeof targetPath !== "string" || targetPath.length === 0) {
        errors.push("targetPath is required");
    }
    if (errors.length > 0) return { ok: false, errors, changed: false };

    const importLockPath = `${targetPath}.import.lock`;
    let importLock;
    try {
        importLock = fs.openSync(importLockPath, "wx", 0o600);
    } catch (error) {
        return {
            ok: false,
            errors: [
                error?.code === "EEXIST"
                    ? "live-evidence import lock is already held"
                    : "live-evidence import lock could not be acquired",
            ],
            changed: false,
        };
    }

    try {
        if (!fs.existsSync(targetPath)) {
            return {
                ok: false,
                errors: ["target manifest is required for compare-and-swap import"],
                changed: false,
            };
        }
        const suppliedArtifactSha256 = createHash("sha256").update(sourceBytes).digest("hex");
        if (suppliedArtifactSha256 !== expectedSha256) {
            return {
                ok: false,
                errors: [
                    `artifact hash mismatch: expected ${expectedSha256}, got ${suppliedArtifactSha256}`,
                ],
                changed: false,
            };
        }
        const suppliedCampaignReceiptSha256 = createHash("sha256")
            .update(campaignReceiptBytes)
            .digest("hex");
        if (suppliedCampaignReceiptSha256 !== expectedCampaignReceiptSha256) {
            return {
                ok: false,
                errors: [
                    `campaign receipt hash mismatch: expected ${expectedCampaignReceiptSha256}, got ${suppliedCampaignReceiptSha256}`,
                ],
                changed: false,
            };
        }

        let manifest;
        try {
            manifest = JSON.parse(sourceBytes.toString("utf8"));
        } catch (error) {
            return {
                ok: false,
                errors: [`artifact is not valid JSON: ${error.message}`],
                changed: false,
            };
        }

        let campaignReceipt;
        try {
            campaignReceipt = JSON.parse(campaignReceiptBytes.toString("utf8"));
        } catch (error) {
            return {
                ok: false,
                errors: [`campaign receipt is not valid JSON: ${error.message}`],
                changed: false,
            };
        }

        const canonicalManifestBytes = canonicalJsonBytes(manifest);
        const canonicalCampaignReceiptBytes = canonicalJsonBytes(campaignReceipt);
        const canonicalManifestSha256 = createHash("sha256")
            .update(canonicalManifestBytes)
            .digest("hex");
        const canonicalCampaignReceiptSha256 = createHash("sha256")
            .update(canonicalCampaignReceiptBytes)
            .digest("hex");

        errors.push(...validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory }));
        errors.push(
            ...validateCampaignReceipt(campaignReceipt, {
                manifest,
                manifestSha256: canonicalManifestSha256,
                campaignInputs,
                campaignInputHashes,
                sdkArtifact,
                baseCommitExists,
                ...(nowMs === undefined ? {} : { nowMs }),
            }),
        );
        errors.push(
            ...validateApprovalReceipt(approvalReceipt, {
                manifestSha256: canonicalManifestSha256,
                campaignReceiptSha256: canonicalCampaignReceiptSha256,
                campaignCompletedAt: campaignReceipt.completedAt,
                ...(nowMs === undefined ? {} : { nowMs }),
            }),
        );
        if (errors.length > 0) {
            return { ok: false, errors, changed: false };
        }

        const previousBytes = fs.readFileSync(targetPath);
        const previousReceiptBytes = fs.existsSync(campaignReceiptTargetPath)
            ? fs.readFileSync(campaignReceiptTargetPath)
            : null;
        const previousManifestSha256 = createHash("sha256").update(previousBytes).digest("hex");
        const manifestChanged = !previousBytes.equals(canonicalManifestBytes);
        if (manifestChanged && previousManifestSha256 !== campaignReceipt.previousManifestSha256) {
            return {
                ok: false,
                errors: [
                    "target manifest changed after the campaign; compare-and-swap refused the import",
                ],
                changed: false,
            };
        }
        const receiptChanged =
            previousReceiptBytes === null ||
            !previousReceiptBytes.equals(canonicalCampaignReceiptBytes);
        const changed = manifestChanged || receiptChanged;

        if (!fs.readFileSync(targetPath).equals(previousBytes)) {
            return {
                ok: false,
                errors: [
                    "target manifest changed during import; compare-and-swap refused the write",
                ],
                changed: false,
            };
        }
        if (receiptChanged)
            writeFileAtomic(campaignReceiptTargetPath, canonicalCampaignReceiptBytes);
        if (manifestChanged) writeFileAtomic(targetPath, canonicalManifestBytes);

        return { ok: true, errors: [], changed, counts: deriveHeadlineCounts(manifest) };
    } finally {
        try {
            fs.closeSync(importLock);
        } finally {
            fs.rmSync(importLockPath, { force: true });
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const sourceIndex = args.indexOf("--source");
    const shaIndex = args.indexOf("--sha256");
    const campaignIndex = args.indexOf("--campaign-receipt");
    const campaignShaIndex = args.indexOf("--campaign-sha256");
    const approvalIndex = args.indexOf("--approval");
    if ([sourceIndex, shaIndex, campaignIndex, campaignShaIndex, approvalIndex].includes(-1)) {
        console.error(
            "usage: import-live-evidence-manifest.mjs --source <path> --sha256 <64-hex> --campaign-receipt <path> --campaign-sha256 <64-hex> --approval <path>",
        );
        process.exit(2);
    }
    const sourcePath = args[sourceIndex + 1];
    const expectedSha256 = args[shaIndex + 1];
    const campaignReceiptPath = args[campaignIndex + 1];
    const expectedCampaignReceiptSha256 = args[campaignShaIndex + 1];
    const approvalPath = args[approvalIndex + 1];

    for (const [flag, candidatePath] of [
        ["--source", sourcePath],
        ["--campaign-receipt", campaignReceiptPath],
        ["--approval", approvalPath],
    ]) {
        if (candidatePath && fs.existsSync(candidatePath)) continue;
        console.error(`${flag} path does not exist`);
        process.exit(1);
    }

    const sourceBytes = fs.readFileSync(sourcePath);
    const campaignReceiptBytes = fs.readFileSync(campaignReceiptPath);
    const approvalReceipt = JSON.parse(fs.readFileSync(approvalPath, "utf8"));
    const targetPath = path.join(root, "spec", "evidence", "live-evidence-manifest.json");
    const campaignReceiptTargetPath = path.join(
        root,
        "spec",
        "evidence",
        "live-evidence-campaign-receipt.json",
    );
    const contractRelativePath = "docs/live-evidence-currentness-contract.json";
    const contractBytes = fs.readFileSync(path.join(root, contractRelativePath));
    const contract = JSON.parse(contractBytes.toString("utf8"));
    const currentRead = captureInputSnapshot(contract.campaignInputs, (relativePath) =>
        relativePath === contractRelativePath
            ? contractBytes
            : fs.readFileSync(path.join(root, relativePath)),
    );
    const sourceLock = JSON.parse(currentRead("docs/openapi-source-lock.json").toString("utf8"));
    const operationInventory = JSON.parse(
        currentRead("docs/openapi-operations.json").toString("utf8"),
    ).operations;
    const { hashes: campaignInputHashes } = hashRelativeFiles(
        contract.campaignInputs,
        currentRead,
    );

    const result = importLiveEvidenceManifest({
        sourceBytes,
        expectedSha256,
        targetPath,
        campaignReceiptBytes,
        expectedCampaignReceiptSha256,
        campaignReceiptTargetPath,
        approvalReceipt,
        sourceLock,
        operationInventory,
        campaignInputs: contract.campaignInputs,
        campaignInputHashes,
        sdkArtifact: hashArtifactTree(path.join(root, "wrapper", "dist")),
        baseCommitExists: (commit) =>
            spawnSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
                cwd: root,
                stdio: "ignore",
            }).status === 0,
    });
    if (!result.ok) {
        console.error("import-live-evidence-manifest failed:");
        for (const message of result.errors) console.error(`- ${message}`);
        process.exit(1);
    }
    console.log(
        `import-live-evidence-manifest: ${result.changed ? "wrote" : "no-op (already current)"} ${path.relative(root, targetPath)} (${result.counts.total} operations, live-success=${result.counts["live-success"]})`,
    );
}
