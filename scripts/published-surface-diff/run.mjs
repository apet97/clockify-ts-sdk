#!/usr/bin/env node
// P1: published-vs-candidate surface differ. For each of the 3 packages,
// fetches the last-published tarball (H4: scripts/lib/published-artifact.mjs
// -- npm view -> download -> verify sha512 -> unpack, fails closed on any
// registry/network/integrity problem), extracts its surface, extracts the
// local candidate build's surface with the SAME extractor pointed at a
// different root, diffs, derives a bump class from the two package.json
// `version` fields, and BLOCKS (non-zero exit) on a policy violation --
// see diff-engine.mjs's evaluatePolicy() for the exact rule.
//
// release-proof tier only (not contract-gates/perfect-fast): this dials
// out to the real npm registry, which is a different axis than the repo's
// Clockify-creds offline convention (`npm audit` already lives in
// perfect-fast on the same premise -- registry reachability is expected).
// `make release-proof` is proven solo, blank-Clockify-creds, with real
// network access; this gate follows that same precedent.
//
// Fails closed, explicitly, when the published baseline cannot be
// established (registry unreachable, integrity mismatch, etc.) -- never
// silently skips and never falls back to a stale/cached artifact. This
// satisfies the campaign card's "offline -> explicit fail-closed message"
// doneCheck.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { fetchPublishedArtifact, PublishedArtifactError } from "../lib/published-artifact.mjs";
import { PACKAGES } from "./packages.mjs";
import { buildDeltas } from "./compare-package.mjs";
import { deriveBumpClass, evaluatePolicy } from "./diff-engine.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));

// The unpacked published tarball has no node_modules of its own -- CLI/MCP
// import real runtime dependencies (clockify-sdk-ts-115, commander, zod,
// @modelcontextprotocol/sdk), and without this, importing their compiled
// dist/index.js throws ERR_MODULE_NOT_FOUND immediately (proven live against
// the real registry while building this differ: the SDK's OWN self-import
// resolves fine standalone via Node's package self-reference algorithm, but
// CLI/MCP's dependency on clockify-sdk-ts-115 -- a REAL dependency, not a
// self-reference -- has nothing to resolve against in an isolated tmpdir).
// A single directory symlink to this repo's own root node_modules (already
// populated via `npm ci`, with clockify-sdk-ts-115 itself a workspace
// symlink to wrapper/) resolves the whole class cheaply and offline --
// cheaper than a second `npm install`, consistent with the scopeStop's
// "reuse repo artifacts before api-extractor." Safe to clean up: `fs.rmSync`
// unlinks a symlink entry rather than recursing into its target, so this
// never touches the repo's real node_modules.
//
// Documented scope boundary: this means the published CLI/MCP's registered
// surface is computed by running its (older) buildProgram()/buildServer()
// against the CANDIDATE's currently-installed commander/@modelcontextprotocol/sdk
// versions, not whatever version range the published package.json declared
// at publish time. A registration-affecting behavior change in one of those
// libraries between the published version and now could in principle cause
// this differ to under- or over-report -- e.g. silently agree the surface
// is unchanged when the true as-published behavior differed. This is the
// same class of scope boundary as the SDK extractor's value-exports-only
// limitation (extract-sdk-surface.mjs); it is accepted here because both
// sides being evaluated under one consistent, current toolchain is what
// makes the comparison meaningful for THIS repo's own regressions (did the
// candidate change?), and a full historical-toolchain replay is out of
// scope per the card's "reuse repo artifacts before api-extractor."
function linkNodeModules(packageDir) {
    fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(packageDir, "node_modules"), "dir");
}
const DIST_MARKERS = {
    sdk: "dist/esm/index.js",
    cli: "dist/index.js",
    mcp: "dist/server.js",
};
const BUILD_COMMANDS = {
    sdk: ["run", "build", "-w", "clockify-sdk-ts-115"],
    cli: ["run", "build", "-w", "@apet97/clockify-cli-115"],
    mcp: ["run", "build", "-w", "@apet97/clockify-mcp-115"],
};

// Cold-start self-heal, mirroring E1/Q3's ensureWrapperBuilt() pattern:
// each candidate root needs its OWN dist built before extraction, and this
// is not added as a new sdk-wrapper-build Make prerequisite for the same
// topology-drift reason recorded there.
function ensureBuilt(pkg) {
    const marker = `${pkg.candidateRoot}/${DIST_MARKERS[pkg.id]}`;
    if (fs.existsSync(marker)) return;
    const result = spawnSync("npm", BUILD_COMMANDS[pkg.id], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "inherit",
    });
    if (result.status !== 0) {
        throw new Error(`published-surface-diff: failed to build ${pkg.id} candidate (npm ${BUILD_COMMANDS[pkg.id].join(" ")}).`);
    }
}

/**
 * Runs the full differ for one package. `deps` are injectable for tests
 * (fetchImpl/extractCandidate/extractPublished) so no real registry,
 * filesystem tar, or dist build is touched offline.
 */
export async function evaluatePackage(pkg, deps = {}) {
    const fetchArtifact = deps.fetchPublishedArtifact ?? fetchPublishedArtifact;
    const extract = deps.extract ?? (await import(pkg.extractorModule))[pkg.extractorExport];
    const ensure = deps.ensureBuilt ?? ensureBuilt;

    ensure(pkg);

    let artifact;
    try {
        artifact = await fetchArtifact(pkg.registrySpec);
    } catch (err) {
        if (err instanceof PublishedArtifactError) {
            return {
                id: pkg.id,
                ok: false,
                fetchError: err.message,
            };
        }
        throw err;
    }

    try {
        const link = deps.linkNodeModules ?? linkNodeModules;
        link(artifact.packageDir);
        const [published, candidate] = await Promise.all([
            extract(artifact.packageDir),
            extract(pkg.candidateRoot),
        ]);
        const bumpClass = deriveBumpClass(published.version, candidate.version);
        const deltas = buildDeltas(pkg.id, published, candidate);
        const verdict = evaluatePolicy({ bumpClass, deltas });
        return {
            id: pkg.id,
            ok: true,
            publishedVersion: published.version,
            candidateVersion: candidate.version,
            ...verdict,
        };
    } finally {
        fs.rmSync(artifact.unpackedDir, { recursive: true, force: true });
    }
}

export async function runAll(deps = {}) {
    const results = [];
    for (const pkg of PACKAGES) {
        results.push(await evaluatePackage(pkg, deps));
    }
    return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const results = await runAll();
    let blocked = false;
    for (const result of results) {
        if (!result.ok) {
            blocked = true;
            console.error(`FAIL: ${result.id}: could not establish a published baseline -- ${result.fetchError}`);
            continue;
        }
        console.log(
            `${result.id}: published=${result.publishedVersion} candidate=${result.candidateVersion} ` +
                `bump=${result.bumpClass} ${result.blocked ? "BLOCKED" : "ok"}`,
        );
        for (const violation of result.violations) {
            console.error(`  - ${violation}`);
            blocked = true;
        }
    }
    if (args.has("--json")) {
        console.log(JSON.stringify(results, null, 2));
    }
    process.exit(blocked ? 1 : 0);
}
