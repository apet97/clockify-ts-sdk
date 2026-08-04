#!/usr/bin/env node
// Record currentness only after the imported manifest, campaign receipt, and
// exact human approval all validate against the bytes that actually ran.
// baseCommit is intentionally descriptive: content hashes bind uncommitted
// governed bytes without pretending they already exist in that commit.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    captureInputSnapshot,
    checkLiveEvidenceCurrentness,
    computeInputFingerprint,
    hashGovernedInputs,
} from "./check-live-evidence-currentness.mjs";
import { sha256Hex, writeFileAtomic } from "./live/live-evidence-attestation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function buildCurrentnessRecord({
    governedInputs,
    inputHashes,
    baseCommit,
    verifiedAt,
    manifestBytes,
    campaignReceiptBytes,
    approvalReceiptBytes,
}) {
    return {
        schemaVersion: 2,
        attestationMode: "base-commit-plus-content-hashes",
        baseCommit,
        verifiedAt,
        manifestSha256: sha256Hex(manifestBytes),
        campaignReceiptSha256: sha256Hex(campaignReceiptBytes),
        approvalReceiptSha256: sha256Hex(approvalReceiptBytes),
        inputFingerprint: computeInputFingerprint(governedInputs, inputHashes),
        inputHashes,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const contractRelativePath = "docs/live-evidence-currentness-contract.json";
    const contractBytes = fs.readFileSync(path.join(root, contractRelativePath));
    const contract = JSON.parse(contractBytes.toString("utf8"));
    const read = captureInputSnapshot(contract.governedInputs, (relativePath) =>
        relativePath === contractRelativePath
            ? contractBytes
            : fs.readFileSync(path.join(root, relativePath)),
    );
    const { hashes: inputHashes, missing } = hashGovernedInputs(contract.governedInputs, read);
    if (missing.length > 0) {
        console.error(`cannot record currentness; missing ${missing.length} governed input(s)`);
        process.exit(1);
    }
    const manifestBytes = read(contract.manifestPath);
    const campaignReceiptBytes = read(contract.campaignReceiptPath);
    const approvalReceiptBytes = read(contract.approvalReceiptPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const campaignReceipt = JSON.parse(campaignReceiptBytes.toString("utf8"));
    const approvalReceipt = JSON.parse(approvalReceiptBytes.toString("utf8"));
    const sourceLock = JSON.parse(read("docs/openapi-source-lock.json").toString("utf8"));
    const operationInventory = JSON.parse(
        read("docs/openapi-operations.json").toString("utf8"),
    ).operations;
    const record = buildCurrentnessRecord({
        governedInputs: contract.governedInputs,
        inputHashes,
        baseCommit: campaignReceipt.baseCommit,
        verifiedAt: new Date().toISOString(),
        manifestBytes,
        campaignReceiptBytes,
        approvalReceiptBytes,
    });
    const result = checkLiveEvidenceCurrentness({
        governedInputs: contract.governedInputs,
        campaignInputs: contract.campaignInputs,
        readFileBytes: read,
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
        console.error("refusing to record invalid live-evidence currentness");
        for (const error of result.errors) console.error(`- ${error}`);
        process.exit(1);
    }
    const recordBytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    writeFileAtomic(path.join(root, contract.wiring.recordPath), recordBytes);
    console.log(
        `recorded live-evidence currentness for ${contract.governedInputs.length} exact inputs at baseCommit ${record.baseCommit}`,
    );
}
