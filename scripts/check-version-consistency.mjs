#!/usr/bin/env node
// Reconcile package versions with docs/version-policy.json#versionConsistency
// and .release-please-manifest.json. release-please tracks wrapper today;
// cli/mcp are hand-reconciled but still checked for clean semver.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+.][0-9A-Za-z-]+)*$/;

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function readJson(relativePath, id) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        fail(id, `${relativePath} is missing`);
        return null;
    }
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

const versionPolicy = readJson("docs/version-policy.json", "version-policy") ?? {};
const policy = versionPolicy.versionConsistency;
if (policy == null || typeof policy !== "object" || Array.isArray(policy)) {
    console.error("version-consistency: docs/version-policy.json missing versionConsistency block");
    process.exit(1);
}

if (!Array.isArray(policy.packages) || policy.packages.length === 0) {
    fail("version-policy", "versionConsistency.packages must be non-empty");
}
if (typeof policy.releasePleaseManifest !== "string") {
    fail("version-policy", "versionConsistency.releasePleaseManifest must be set");
}
if (typeof policy.manifestKeyForReleasePlease !== "string") {
    fail("version-policy", "versionConsistency.manifestKeyForReleasePlease must be set");
}

const versions = {};
for (const pkg of policy.packages ?? []) {
    if (typeof pkg?.id !== "string" || typeof pkg?.manifest !== "string") {
        fail("version-policy", "each versionConsistency package needs id and manifest");
        continue;
    }
    const manifest = readJson(pkg.manifest, pkg.id);
    if (!manifest) continue;
    if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
        fail(pkg.id, `version ${JSON.stringify(manifest.version)} is not a clean semver string`);
        continue;
    }
    versions[pkg.id] = manifest.version;
}

const releaseManifest = readJson(
    policy.releasePleaseManifest ?? ".release-please-manifest.json",
    "release-please-manifest",
);
if (releaseManifest) {
    const key = policy.manifestKeyForReleasePlease;
    const tracked = releaseManifest[key];
    const expected = versions[key];
    if (typeof tracked !== "string") {
        fail("release-please-manifest", `missing tracked key ${JSON.stringify(key)}`);
    } else if (expected !== undefined && tracked !== expected) {
        fail(
            "release-please-manifest",
            `${policy.releasePleaseManifest} tracks ${key}=${tracked} ` +
                `but ${key}/package.json is ${expected}`,
        );
    }
}

if (failures.length > 0) {
    console.error("version-consistency check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const summary = Object.entries(versions)
    .map(([id, version]) => `${id}=${version}`)
    .join(", ");
console.log(`version-consistency passed (${summary}; release-please manifest in sync)`);
