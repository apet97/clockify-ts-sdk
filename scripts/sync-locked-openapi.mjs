#!/usr/bin/env node
// Synchronize the downstream OpenAPI snapshot (spec/corrected/clockify.corrected.openapi.yaml)
// from the immutable, network-verified upstream lock (docs/openapi-source-lock.json).
//
// The only input to what gets written is the real public upstream, fetched
// through an immutable commit-addressed URL -- never an ambient sibling
// checkout (e.g. ../GOCLMCP). A sibling comparison is available only as an
// explicit, separately labeled developer convenience (--dev-compare-sibling)
// that never influences what gets written.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateOpenApiSourceLockShape } from "./lib/openapi-source-lock.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ownerRepoFromUrl(repositoryUrl) {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/.exec(repositoryUrl);
    if (!match) return null;
    return `${match[1]}/${match[2]}`;
}

/**
 * Download the exact locked source, verify it against the lock's claims,
 * and atomically replace targetPath if (and only if) verification passes.
 * Never reads targetPath's sibling directories or any ambient checkout --
 * the written bytes come solely from fetchImpl's response to the exact,
 * commit-addressed immutable URL. Returns
 * { ok, errors, changed, bytes?, sha256? } and never touches targetPath on
 * a verification failure.
 */
export async function syncLockedOpenApi({ lock, targetPath, fetchImpl } = {}) {
    const fetcher = fetchImpl ?? globalThis.fetch;

    const shapeErrors = validateOpenApiSourceLockShape(lock);
    if (shapeErrors.length > 0) {
        return { ok: false, errors: shapeErrors, changed: false };
    }

    const ownerRepo = ownerRepoFromUrl(lock.repositoryUrl);
    if (!ownerRepo) {
        return {
            ok: false,
            errors: [`repositoryUrl: could not derive owner/repo from ${lock.repositoryUrl}`],
            changed: false,
        };
    }

    const errors = [];

    const commitApiUrl = `https://api.github.com/repos/${ownerRepo}/commits/${lock.commit}`;
    let commitResponse;
    try {
        commitResponse = await fetcher(commitApiUrl, { headers: { Accept: "application/vnd.github+json" } });
    } catch (err) {
        errors.push(`commit: fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        commitResponse = null;
    }
    if (commitResponse) {
        if (commitResponse.redirected) {
            errors.push("commit: repository/commit lookup was redirected");
        } else if (!commitResponse.ok) {
            errors.push(`commit: repository/commit lookup returned HTTP ${commitResponse.status}`);
        } else {
            const body = await commitResponse.json();
            if (body?.sha !== lock.commit) errors.push("commit: API response sha does not match the locked commit");
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors, changed: false };
    }

    const rawUrl = `https://raw.githubusercontent.com/${ownerRepo}/${lock.commit}/${lock.sourcePath}`;
    let sourceResponse;
    try {
        sourceResponse = await fetcher(rawUrl);
    } catch (err) {
        return {
            ok: false,
            errors: [`source: fetch failed: ${err instanceof Error ? err.message : String(err)}`],
            changed: false,
        };
    }
    if (sourceResponse.redirected) {
        return {
            ok: false,
            errors: ["source: request was redirected (immutable commit-addressed URLs must not redirect)"],
            changed: false,
        };
    }
    if (!sourceResponse.ok) {
        return { ok: false, errors: [`source: fetch returned HTTP ${sourceResponse.status}`], changed: false };
    }

    const bytes = Buffer.from(await sourceResponse.arrayBuffer());

    if (bytes.length !== lock.sourceBytes) {
        errors.push(`source: byte count mismatch (locked ${lock.sourceBytes}, fetched ${bytes.length})`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== lock.sourceSha256) {
        errors.push(`source: sha256 mismatch (locked ${lock.sourceSha256}, fetched ${digest})`);
    }

    if (errors.length > 0) {
        return { ok: false, errors, changed: false };
    }

    const previousBytes = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
    const changed = previousBytes === null || !previousBytes.equals(bytes);

    if (changed) {
        const dir = path.dirname(targetPath);
        const tmpPath = path.join(dir, `.${path.basename(targetPath)}.sync-tmp-${process.pid}`);
        fs.writeFileSync(tmpPath, bytes);
        fs.renameSync(tmpPath, targetPath);
    }

    return { ok: true, errors: [], changed, bytes: bytes.length, sha256: digest };
}

/**
 * Developer convenience only, NOT release proof: compares an ambient sibling
 * checkout's file against the same locked path, purely for local debugging
 * before a real upstream fix lands. Never called by syncLockedOpenApi and
 * never influences what gets written.
 */
export function compareSiblingDeveloperConvenienceOnly(lock, siblingRepoRoot) {
    const siblingPath = path.join(siblingRepoRoot, lock.sourcePath);
    if (!fs.existsSync(siblingPath)) {
        return { ok: false, note: "developer convenience; not release proof", message: `sibling path not found: ${siblingPath}` };
    }
    const siblingBytes = fs.readFileSync(siblingPath);
    const siblingSha256 = createHash("sha256").update(siblingBytes).digest("hex");
    const matches = siblingSha256 === lock.sourceSha256 && siblingBytes.length === lock.sourceBytes;
    return {
        ok: matches,
        note: "developer convenience; not release proof",
        siblingBytes: siblingBytes.length,
        siblingSha256,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const lockPath = path.join(root, "docs", "openapi-source-lock.json");
    const targetPath = path.join(root, "spec", "corrected", "clockify.corrected.openapi.yaml");

    if (!fs.existsSync(lockPath)) {
        console.error(
            "docs/openapi-source-lock.json does not exist yet -- it is created only once a human has supplied and approved real upstream values (H01-LOCK).",
        );
        process.exit(1);
    }
    const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

    const devCompareIndex = process.argv.indexOf("--dev-compare-sibling");
    if (devCompareIndex !== -1) {
        const siblingRoot = process.argv[devCompareIndex + 1] ?? path.join(root, "..", "GOCLMCP");
        const comparison = compareSiblingDeveloperConvenienceOnly(lock, siblingRoot);
        console.log(`[${comparison.note}] ${comparison.ok ? "MATCH" : "DIFFERS"}: ${comparison.message ?? `${siblingRoot} (${comparison.siblingBytes} bytes, sha256:${comparison.siblingSha256})`}`);
        process.exit(comparison.ok ? 0 : 1);
    }

    const result = await syncLockedOpenApi({ lock, targetPath });
    if (!result.ok) {
        console.error("sync-locked-openapi failed:");
        for (const message of result.errors) console.error(`- ${message}`);
        process.exit(1);
    }
    console.log(
        `sync-locked-openapi: ${result.changed ? "wrote" : "no-op (already current)"} ${path.relative(root, targetPath)} from ${lock.repositoryUrl}@${lock.commit} (${result.bytes} bytes, sha256:${result.sha256})`,
    );
}
