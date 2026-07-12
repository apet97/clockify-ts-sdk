#!/usr/bin/env node
// Reconcile package identities and versions with the generated runtime constants,
// secondary manifests, peer ranges, and both release-please sources of truth.
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

function readText(relativePath, id) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        fail(id, `${relativePath} is missing`);
        return null;
    }
    return fs.readFileSync(absolutePath, "utf8");
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
if (typeof policy.releasePleaseConfig !== "string") {
    fail("version-policy", "versionConsistency.releasePleaseConfig must be set");
}

const versions = {};
const packageContracts = [];
for (const pkg of policy.packages ?? []) {
    if (
        typeof pkg?.id !== "string" ||
        typeof pkg?.manifest !== "string" ||
        typeof pkg?.packageName !== "string" ||
        typeof pkg?.runtimeVersionFile !== "string"
    ) {
        fail(
            "version-policy",
            "each versionConsistency package needs id, manifest, packageName, and runtimeVersionFile",
        );
        continue;
    }
    const manifest = readJson(pkg.manifest, pkg.id);
    if (!manifest) continue;
    if (manifest.name !== pkg.packageName) {
        fail(
            pkg.id,
            `${pkg.manifest} name ${JSON.stringify(manifest.name)} does not match policy ${JSON.stringify(pkg.packageName)}`,
        );
    }
    if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
        fail(pkg.id, `version ${JSON.stringify(manifest.version)} is not a clean semver string`);
        continue;
    }
    versions[pkg.id] = manifest.version;

    const expectedPeers = pkg.peerDependencies ?? {};
    if (
        typeof expectedPeers !== "object" ||
        expectedPeers === null ||
        Array.isArray(expectedPeers)
    ) {
        fail("version-policy", `${pkg.id}.peerDependencies must be an object when set`);
    } else {
        for (const [name, expectedRange] of Object.entries(expectedPeers)) {
            const actualRange = manifest.peerDependencies?.[name];
            if (typeof actualRange !== "string") {
                fail(
                    pkg.id,
                    `peer dependency ${JSON.stringify(name)} is missing; policy requires ${expectedRange}`,
                );
            } else if (actualRange !== expectedRange) {
                fail(
                    pkg.id,
                    `peer dependency ${JSON.stringify(name)} is ${actualRange} but policy requires ${expectedRange}`,
                );
            }
        }
    }

    const runtimeVersion = readText(pkg.runtimeVersionFile, `${pkg.id}-runtime-version`);
    if (runtimeVersion !== null) {
        const match = runtimeVersion.match(/export const PACKAGE_VERSION = "([^"]+)" as const;/);
        const generatedVersion = match?.[1];
        if (generatedVersion !== manifest.version) {
            fail(
                `${pkg.id}-runtime-version`,
                `${pkg.runtimeVersionFile} declares ${JSON.stringify(generatedVersion)} but ${pkg.manifest} is ${manifest.version}`,
            );
        }
    }

    if (
        pkg.additionalVersionManifests !== undefined &&
        !Array.isArray(pkg.additionalVersionManifests)
    ) {
        fail("version-policy", `${pkg.id}.additionalVersionManifests must be an array when set`);
    } else {
        for (const versionManifestPath of pkg.additionalVersionManifests ?? []) {
            if (typeof versionManifestPath !== "string") {
                fail(
                    "version-policy",
                    `${pkg.id}.additionalVersionManifests entries must be strings`,
                );
                continue;
            }
            const versionManifest = readJson(versionManifestPath, `${pkg.id}-version-manifest`);
            if (!versionManifest) continue;
            if (typeof versionManifest.version !== "string") {
                fail(pkg.id, `${versionManifestPath} version is missing`);
            } else if (versionManifest.version !== manifest.version) {
                fail(
                    pkg.id,
                    `${versionManifestPath} version ${versionManifest.version} does not match ${pkg.manifest} ${manifest.version}`,
                );
            }
        }
    }

    packageContracts.push({ pkg, manifest });
}

const releaseManifest = readJson(
    policy.releasePleaseManifest ?? ".release-please-manifest.json",
    "release-please-manifest",
);
const releaseConfig = readJson(
    policy.releasePleaseConfig ?? "release-please-config.json",
    "release-please-config",
);
for (const { pkg, manifest } of packageContracts) {
    if (releaseManifest) {
        const tracked = releaseManifest[pkg.id];
        if (typeof tracked !== "string") {
            fail("release-please-manifest", `missing tracked key ${JSON.stringify(pkg.id)}`);
        } else if (tracked !== manifest.version) {
            fail(
                "release-please-manifest",
                `${policy.releasePleaseManifest} tracks ${pkg.id}=${tracked} ` +
                    `but ${pkg.manifest} is ${manifest.version}`,
            );
        }
    }

    if (releaseConfig) {
        const releasePackageName = releaseConfig.packages?.[pkg.id]?.["package-name"];
        if (typeof releasePackageName !== "string") {
            fail(
                "release-please-config",
                `release-please package ${pkg.id} package-name is missing; expected ${pkg.packageName}`,
            );
        } else if (releasePackageName !== pkg.packageName) {
            fail(
                "release-please-config",
                `release-please package ${pkg.id} package-name ${releasePackageName} does not match ${pkg.packageName}`,
            );
        }
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
console.log(
    `version-consistency passed (${summary}; release-please manifest and config in sync)`,
);
