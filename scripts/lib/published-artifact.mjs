// published-artifact: shared fetch+verify+unpack lib for published npm
// artifacts. Feeds the P1a/P1b/P1c published-vs-candidate surface diff:
// fetch the last-published tarball for a package, verify it against the
// registry's own sha512 (Subresource-Integrity) claim, then unpack it so a
// diff can compare surfaces against a local candidate build.
//
//   npm view <spec> dist.tarball dist.integrity
//     --> download tarball
//     --> verify sha512(bytes) == dist.integrity
//     --> unpack (tar) to a scratch dir
//
// Fails closed: a registry/network problem, missing dist metadata, or an
// integrity mismatch throws PublishedArtifactError with an explicit,
// operator-facing message -- this never falls back to a stale, cached, or
// unverified artifact, and it never unpacks bytes that failed verification.
//
// `npmViewImpl` / `fetchImpl` / `unpackImpl` are always injectable so tests
// exercise the fail-closed paths without touching the real registry or
// filesystem tar (mirrors scripts/lib/openapi-source-lock-verify.mjs's
// fetcher-injection convention).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

export class PublishedArtifactError extends Error {
    constructor(message, { code } = {}) {
        super(message);
        this.name = "PublishedArtifactError";
        this.code = code;
    }
}

function failClosed(code, message) {
    throw new PublishedArtifactError(
        `published-artifact: ${message} This fails closed rather than falling back to a stale or unverified artifact.`,
        { code },
    );
}

/** Real `npm view <spec> dist.tarball dist.integrity --json`. Multi-field
 *  `npm view --json` returns an object keyed by the literal dotted field
 *  names requested (not nested under "dist"). */
function defaultNpmView(spec) {
    const result = spawnSync("npm", ["view", spec, "dist.tarball", "dist.integrity", "--json"], {
        encoding: "utf8",
    });
    if (result.error) {
        return { ok: false, detail: result.error.message };
    }
    if (result.status !== 0) {
        const detail = (result.stderr ?? "").trim() || `npm view exited with status ${result.status}`;
        return { ok: false, detail };
    }
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch (err) {
        return { ok: false, detail: `could not parse npm view output as JSON: ${err.message}` };
    }
    return { ok: true, tarball: parsed["dist.tarball"], integrity: parsed["dist.integrity"] };
}

/** Real unpack: shell out to the system `tar` binary. Deliberately not an
 *  npm dependency -- adding one would touch the governed root package.json
 *  (and package-lock.json), forcing a live-evidence re-campaign for a
 *  tooling-only change. `tar` is present on every runner this repo uses
 *  (ubuntu-latest CI, macOS/Linux dev laptops). */
function defaultUnpack(tarballPath, destDir) {
    const result = spawnSync("tar", ["xzf", tarballPath, "-C", destDir], { encoding: "utf8" });
    if (result.error) return { ok: false, detail: result.error.message };
    if (result.status !== 0) {
        const detail = (result.stderr ?? "").trim() || `tar exited with status ${result.status}`;
        return { ok: false, detail };
    }
    return { ok: true };
}

const INTEGRITY_ALGOS = new Set(["sha512", "sha256", "sha1"]);

/** Verify `bytes` against an npm Subresource-Integrity string
 *  ("<algo>-<base64digest>", e.g. dist.integrity). */
function integrityDigestMatches(bytes, integrity) {
    const match = /^([a-z0-9]+)-([A-Za-z0-9+/=]+)$/.exec(integrity ?? "");
    if (!match) {
        return { ok: false, reason: `unrecognized integrity format ${JSON.stringify(integrity)}` };
    }
    const [, algo, expectedBase64] = match;
    if (!INTEGRITY_ALGOS.has(algo)) {
        return { ok: false, reason: `unsupported integrity algorithm "${algo}"` };
    }
    const actualBase64 = createHash(algo).update(bytes).digest("base64");
    if (actualBase64 !== expectedBase64) {
        return { ok: false, reason: `${algo} digest mismatch` };
    }
    return { ok: true, reason: null };
}

/**
 * Fetch, verify, and unpack the published tarball for `spec` (e.g.
 * "clockify-sdk-ts-115@3.0.0" or "@apet97/clockify-cli-115@latest").
 *
 * Resolves to { unpackedDir, packageDir, tarballPath, integrity, tarballUrl }
 * on success. `unpackedDir` is a fresh `fs.mkdtempSync` directory;
 * `packageDir` is `unpackedDir/package` (npm tarballs always nest their
 * contents under a top-level `package/` directory). The caller owns
 * cleanup: `fs.rmSync(unpackedDir, { recursive: true, force: true })`.
 *
 * Throws PublishedArtifactError (never resolves to a partial/best-effort
 * result) when the registry is unreachable, dist metadata is incomplete,
 * the download fails, the downloaded bytes fail integrity verification, or
 * unpacking fails.
 */
export async function fetchPublishedArtifact(spec, options = {}) {
    const npmView = options.npmViewImpl ?? defaultNpmView;
    const fetcher = options.fetchImpl ?? globalThis.fetch;
    const unpack = options.unpackImpl ?? defaultUnpack;

    if (typeof spec !== "string" || spec.trim().length === 0) {
        failClosed("invalid-spec", `spec must be a non-empty string, got ${JSON.stringify(spec)}.`);
    }

    const view = await npmView(spec);
    if (!view.ok) {
        failClosed(
            "registry-unreachable",
            `"npm view ${spec}" failed (${view.detail}). Check registry access and retry.`,
        );
    }
    if (!view.tarball || !view.integrity) {
        failClosed(
            "missing-dist-metadata",
            `"npm view ${spec}" did not return both dist.tarball and dist.integrity.`,
        );
    }

    let response;
    try {
        response = await fetcher(view.tarball);
    } catch (err) {
        failClosed(
            "download-failed",
            `download of ${view.tarball} failed (${err instanceof Error ? err.message : String(err)}).`,
        );
    }
    if (!response.ok) {
        failClosed("download-failed", `download of ${view.tarball} returned HTTP ${response.status}.`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());

    const digestCheck = integrityDigestMatches(bytes, view.integrity);
    if (!digestCheck.ok) {
        failClosed(
            "integrity-mismatch",
            `downloaded tarball for ${spec} does not match the registry's dist.integrity ` +
                `(${digestCheck.reason}). Refusing to unpack a tarball that does not match ` +
                `the registry's own signature.`,
        );
    }

    const unpackedDir = fs.mkdtempSync(path.join(os.tmpdir(), "published-artifact-"));
    const tarballPath = path.join(unpackedDir, "artifact.tgz");
    fs.writeFileSync(tarballPath, bytes);
    const unpackResult = unpack(tarballPath, unpackedDir);
    if (!unpackResult.ok) {
        failClosed("unpack-failed", `unpacking ${tarballPath} failed (${unpackResult.detail}).`);
    }

    return {
        unpackedDir,
        packageDir: path.join(unpackedDir, "package"),
        tarballPath,
        integrity: view.integrity,
        tarballUrl: view.tarball,
    };
}
