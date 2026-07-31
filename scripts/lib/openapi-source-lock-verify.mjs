// Networked verification for the immutable OpenAPI source lock
// (docs/openapi-source-lock.json / docs/openapi-source-lock.schema.json).
//
// This module never trusts the lock's own claims: it fetches the exact
// locked commit through immutable GitHub URLs (raw content addressed by
// full commit SHA, never a branch/tag) and an explicit repository/commit
// existence check, then compares byte counts and SHA-256 digests against
// what the lock claims. A fetcher is always injected so offline tests never
// touch the network; production wiring passes the real global fetch.
import { createHash } from "node:crypto";

import { ownerRepoFromUrl, validateOpenApiSourceLockShape } from "./openapi-source-lock.mjs";

async function fetchExactBytes(fetcher, label, url, errors) {
    let response;
    try {
        response = await fetcher(url);
    } catch (err) {
        errors.push(`${label}: fetch failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
    if (response.redirected) {
        errors.push(`${label}: request was redirected (immutable commit-addressed URLs must not redirect)`);
        return null;
    }
    if (!response.ok) {
        errors.push(`${label}: fetch returned HTTP ${response.status}`);
        return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
}

/**
 * Verify a shape-valid OpenAPI source lock against the real, publicly
 * hosted upstream commit. Returns { ok, errors, checks } where checks is a
 * list of { label, ok, bytes? } entries safe to print (byte counts and
 * pass/fail only -- never raw file contents or credentials).
 */
export async function verifyOpenApiSourceLock(lock, { fetchImpl } = {}) {
    const fetcher = fetchImpl ?? globalThis.fetch;
    const errors = [];
    const checks = [];

    const shapeErrors = validateOpenApiSourceLockShape(lock);
    if (shapeErrors.length > 0) {
        return { ok: false, errors: shapeErrors, checks: [] };
    }

    const ownerRepo = ownerRepoFromUrl(lock.repositoryUrl);
    if (!ownerRepo) {
        return { ok: false, errors: [`repositoryUrl: could not derive owner/repo from ${lock.repositoryUrl}`], checks: [] };
    }

    // 1. The commit must exist and belong to this exact repository.
    const commitApiUrl = `https://api.github.com/repos/${ownerRepo}/commits/${lock.commit}`;
    let commitResponse;
    try {
        commitResponse = await fetcher(commitApiUrl, {
            headers: { Accept: "application/vnd.github+json" },
        });
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
            if (body?.sha !== lock.commit) {
                errors.push("commit: API response sha does not match the locked commit");
            }
        }
    }
    checks.push({ label: "commit-exists", ok: !errors.some((message) => message.startsWith("commit:")) });

    // 2. Source file: exact byte count and SHA-256.
    const rawBase = `https://raw.githubusercontent.com/${ownerRepo}/${lock.commit}`;
    const sourceUrl = `${rawBase}/${lock.sourcePath}`;
    const sourceBytes = await fetchExactBytes(fetcher, "source", sourceUrl, errors);
    if (sourceBytes) {
        const byteCountOk = sourceBytes.length === lock.sourceBytes;
        if (!byteCountOk) {
            errors.push(`source: byte count mismatch (locked ${lock.sourceBytes}, fetched ${sourceBytes.length})`);
        }
        const digest = createHash("sha256").update(sourceBytes).digest("hex");
        const hashOk = digest === lock.sourceSha256;
        if (!hashOk) {
            errors.push(`source: sha256 mismatch (locked ${lock.sourceSha256}, fetched ${digest})`);
        }
        checks.push({ label: "source-bytes", ok: byteCountOk && hashOk, bytes: sourceBytes.length });
    } else {
        checks.push({ label: "source-bytes", ok: false });
    }

    // 3. Composer identity: always fetched (composerPath is always present);
    //    hash-compared only when composerSha256 was the pinning form.
    const composerUrl = `${rawBase}/${lock.composerPath}`;
    const composerBytes = await fetchExactBytes(fetcher, "composer", composerUrl, errors);
    if (composerBytes) {
        let composerOk = true;
        if (lock.composerSha256) {
            const digest = createHash("sha256").update(composerBytes).digest("hex");
            composerOk = digest === lock.composerSha256;
            if (!composerOk) {
                errors.push(`composer: sha256 mismatch (locked ${lock.composerSha256}, fetched ${digest})`);
            }
        }
        checks.push({ label: "composer-identity", ok: composerOk, bytes: composerBytes.length });
    } else {
        checks.push({ label: "composer-identity", ok: false });
    }

    return { ok: errors.length === 0, errors, checks };
}
