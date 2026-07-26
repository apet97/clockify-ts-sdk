#!/usr/bin/env node
// Import an upstream-generated, upstream-approved live-evidence manifest
// (H01-LIVE) into spec/evidence/live-evidence-manifest.json. This repo
// validates and imports; it does not generate the manifest or run its own
// duplicate probe campaign -- apet97/go-clockify owns canonical API truth
// and live discrepancy evidence.
//
// Requires the exact expected SHA-256 of the source artifact bytes (H01-LIVE
// must supply this) so a swapped or tampered file cannot be imported
// silently. Refuses to write when hash verification, shape validation,
// source-lock fingerprint currency, or exact operation-set coverage fails.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deriveHeadlineCounts, validateLiveEvidenceManifest } from "./check-live-evidence-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Verify an upstream manifest artifact's bytes against an expected SHA-256,
 * validate it, and atomically write it to targetPath only on success.
 * Never accepts a headline count as input -- counts are always derived
 * from validated operation rows after the fact. Returns
 * { ok, errors, changed, counts? } and never touches targetPath on failure.
 */
export function importLiveEvidenceManifest({ sourceBytes, expectedSha256, targetPath, sourceLock, operationInventory }) {
    const errors = [];

    if (!Buffer.isBuffer(sourceBytes)) {
        return { ok: false, errors: ["sourceBytes must be a Buffer"], changed: false };
    }
    if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
        return { ok: false, errors: ["expectedSha256 must be a 64-character lowercase hex SHA-256 digest"], changed: false };
    }

    const actualSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    if (actualSha256 !== expectedSha256) {
        return {
            ok: false,
            errors: [`artifact hash mismatch: expected ${expectedSha256}, got ${actualSha256}`],
            changed: false,
        };
    }

    let manifest;
    try {
        manifest = JSON.parse(sourceBytes.toString("utf8"));
    } catch (error) {
        return { ok: false, errors: [`artifact is not valid JSON: ${error.message}`], changed: false };
    }

    errors.push(...validateLiveEvidenceManifest(manifest, { sourceLock, operationInventory }));
    if (errors.length > 0) {
        return { ok: false, errors, changed: false };
    }

    const previousBytes = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
    const changed = previousBytes === null || !previousBytes.equals(sourceBytes);

    if (changed) {
        const dir = path.dirname(targetPath);
        fs.mkdirSync(dir, { recursive: true });
        const tmpPath = path.join(dir, `.${path.basename(targetPath)}.import-tmp-${process.pid}`);
        fs.writeFileSync(tmpPath, sourceBytes);
        fs.renameSync(tmpPath, targetPath);
    }

    return { ok: true, errors: [], changed, counts: deriveHeadlineCounts(manifest) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const sourceIndex = args.indexOf("--source");
    const shaIndex = args.indexOf("--sha256");
    if (sourceIndex === -1 || shaIndex === -1) {
        console.error("usage: import-live-evidence-manifest.mjs --source <path> --sha256 <64-hex>");
        process.exit(2);
    }
    const sourcePath = args[sourceIndex + 1];
    const expectedSha256 = args[shaIndex + 1];

    if (!sourcePath || !fs.existsSync(sourcePath)) {
        console.error(`--source path does not exist: ${sourcePath}`);
        process.exit(1);
    }

    const sourceBytes = fs.readFileSync(sourcePath);
    const targetPath = path.join(root, "spec", "evidence", "live-evidence-manifest.json");
    const sourceLockPath = path.join(root, "docs", "openapi-source-lock.json");
    const operationInventoryPath = path.join(root, "docs", "openapi-operations.json");

    const sourceLock = fs.existsSync(sourceLockPath) ? JSON.parse(fs.readFileSync(sourceLockPath, "utf8")) : null;
    const operationInventory = fs.existsSync(operationInventoryPath)
        ? JSON.parse(fs.readFileSync(operationInventoryPath, "utf8")).operations
        : null;

    const result = importLiveEvidenceManifest({ sourceBytes, expectedSha256, targetPath, sourceLock, operationInventory });
    if (!result.ok) {
        console.error("import-live-evidence-manifest failed:");
        for (const message of result.errors) console.error(`- ${message}`);
        process.exit(1);
    }
    console.log(
        `import-live-evidence-manifest: ${result.changed ? "wrote" : "no-op (already current)"} ${path.relative(root, targetPath)} (${result.counts.total} operations, live-success=${result.counts["live-success"]})`,
    );
}
