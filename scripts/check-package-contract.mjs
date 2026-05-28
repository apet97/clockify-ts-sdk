#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "package-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(label, "must be a boolean");
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function sortedKeys(value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.keys(value).sort((a, b) => a.localeCompare(b));
}

function sortedArray(value) {
    return [...(Array.isArray(value) ? value : [])].sort((a, b) => a.localeCompare(b));
}

function sameArray(a, b) {
    return JSON.stringify(sortedArray(a)) === JSON.stringify(sortedArray(b));
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "package-contract") {
            fail("wiring.makeTarget", "must be package-contract");
        }
        if (contract.wiring.checker !== "scripts/check-package-contract.mjs") {
            fail("wiring.checker", "must be scripts/check-package-contract.mjs");
        }
    }

    if (!Array.isArray(contract.packages) || contract.packages.length === 0) {
        fail("packages", "must be a non-empty array");
    }
    assertUnique(
        "packages.id",
        (contract.packages ?? []).map((pkg) => pkg?.id).filter((id) => typeof id === "string"),
    );
    assertUnique(
        "packages.manifest",
        (contract.packages ?? []).map((pkg) => pkg?.manifest).filter((manifest) => typeof manifest === "string"),
    );

    for (const [index, pkgContract] of (contract.packages ?? []).entries()) {
        const label = pkgContract?.id ?? `packages[${index}]`;
        if (!assertObject(label, pkgContract)) continue;

        assertNonEmptyString(`${label}.id`, pkgContract.id);
        assertNonEmptyString(`${label}.name`, pkgContract.name);
        const manifest = safeRelativePath(`${label}.manifest`, pkgContract.manifest);
        if (manifest != null && path.basename(manifest) !== "package.json") {
            fail(`${label}.manifest`, "must point to a package.json manifest");
        }

        for (const field of ["requiredFiles", "forbiddenFiles", "binKeys", "exportKeys"]) {
            const values = assertStringArray(`${label}.${field}`, pkgContract[field]);
            assertUnique(`${label}.${field}`, values);
        }

        if (assertObject(`${label}.requiredScripts`, pkgContract.requiredScripts)) {
            for (const [scriptName, expectedCommand] of Object.entries(pkgContract.requiredScripts)) {
                assertNonEmptyString(`${label}.requiredScripts.${scriptName}`, expectedCommand);
            }
        }

        for (const metadataField of [
            "expectedType",
            "expectedLicense",
            "expectedNodeEngine",
            "expectedRepositoryUrl",
            "expectedBugsUrl",
            "expectedHomepage",
        ]) {
            assertNonEmptyString(`${label}.${metadataField}`, pkgContract[metadataField]);
        }
        if ("expectedRepositoryDirectory" in pkgContract) {
            assertNonEmptyString(`${label}.expectedRepositoryDirectory`, pkgContract.expectedRepositoryDirectory);
        }
        if ("expectedSideEffects" in pkgContract) {
            assertBoolean(`${label}.expectedSideEffects`, pkgContract.expectedSideEffects);
        }
        if (assertObject(`${label}.expectedPublishConfig`, pkgContract.expectedPublishConfig)) {
            assertNonEmptyString(`${label}.expectedPublishConfig.access`, pkgContract.expectedPublishConfig.access);
            assertBoolean(`${label}.expectedPublishConfig.provenance`, pkgContract.expectedPublishConfig.provenance);
        }
        assertBoolean(`${label}.requireDescription`, pkgContract.requireDescription);
        assertBoolean(`${label}.requirePublishConfig`, pkgContract.requirePublishConfig);
        assertBoolean(`${label}.requirePrepublishOnly`, pkgContract.requirePrepublishOnly);
        assertBoolean(`${label}.disallowPrivate`, pkgContract.disallowPrivate);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("package contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const pkgContract of contract.packages ?? []) {
    if (pkgContract == null || typeof pkgContract !== "object" || Array.isArray(pkgContract)) continue;

    const id = pkgContract.id ?? pkgContract.manifest ?? "unknown";
    const safeManifest = safeRelativePath(`${id}.manifest`, pkgContract.manifest);
    if (safeManifest == null) continue;

    const manifestPath = path.join(root, safeManifest);
    if (!fs.existsSync(manifestPath)) {
        fail(id, `${pkgContract.manifest} does not exist`);
        continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    if (manifest.name !== pkgContract.name) {
        fail(id, `expected package name ${pkgContract.name}, got ${manifest.name}`);
    }

    if (manifest.type !== pkgContract.expectedType) {
        fail(id, `expected package type ${pkgContract.expectedType}, got ${manifest.type}`);
    }

    if (manifest.license !== pkgContract.expectedLicense) {
        fail(id, `expected license ${pkgContract.expectedLicense}, got ${manifest.license}`);
    }

    if (manifest.engines?.node !== pkgContract.expectedNodeEngine) {
        fail(id, `expected engines.node ${pkgContract.expectedNodeEngine}, got ${manifest.engines?.node}`);
    }

    if (pkgContract.requireDescription && typeof manifest.description !== "string") {
        fail(id, "description is required");
    } else if (pkgContract.requireDescription && manifest.description.trim().length < 20) {
        fail(id, "description must be specific enough for package consumers");
    }

    if (manifest.repository?.type !== "git") {
        fail(id, "repository.type must be git");
    }
    if (manifest.repository?.url !== pkgContract.expectedRepositoryUrl) {
        fail(id, `expected repository.url ${pkgContract.expectedRepositoryUrl}, got ${manifest.repository?.url}`);
    }
    if (pkgContract.expectedRepositoryDirectory && manifest.repository?.directory !== pkgContract.expectedRepositoryDirectory) {
        fail(
            id,
            `expected repository.directory ${pkgContract.expectedRepositoryDirectory}, got ${manifest.repository?.directory}`,
        );
    }
    if (!pkgContract.expectedRepositoryDirectory && "directory" in (manifest.repository ?? {})) {
        fail(id, "repository.directory must be omitted for the root wrapper package");
    }

    if (manifest.bugs?.url !== pkgContract.expectedBugsUrl) {
        fail(id, `expected bugs.url ${pkgContract.expectedBugsUrl}, got ${manifest.bugs?.url}`);
    }

    if (manifest.homepage !== pkgContract.expectedHomepage) {
        fail(id, `expected homepage ${pkgContract.expectedHomepage}, got ${manifest.homepage}`);
    }

    if ("expectedSideEffects" in pkgContract && manifest.sideEffects !== pkgContract.expectedSideEffects) {
        fail(id, `expected sideEffects ${pkgContract.expectedSideEffects}, got ${manifest.sideEffects}`);
    }

    if (pkgContract.disallowPrivate && manifest.private === true) {
        fail(id, "package is private; this repo expects packable manifests");
    }

    const actualFiles = manifest.files ?? [];
    for (const requiredFile of pkgContract.requiredFiles ?? []) {
        if (!actualFiles.includes(requiredFile)) {
            fail(id, `package files missing ${requiredFile}`);
        }
    }
    for (const forbiddenFile of pkgContract.forbiddenFiles ?? []) {
        if (actualFiles.includes(forbiddenFile)) {
            fail(id, `package files must not include ${forbiddenFile}`);
        }
    }

    const expectedBinKeys = sortedArray(pkgContract.binKeys);
    const actualBinKeys = sortedKeys(manifest.bin);
    if (!sameArray(actualBinKeys, expectedBinKeys)) {
        fail(id, `expected bin keys ${expectedBinKeys.join(",") || "(none)"}, got ${actualBinKeys.join(",") || "(none)"}`);
    }

    const expectedExportKeys = sortedArray(pkgContract.exportKeys);
    const actualExportKeys = sortedKeys(manifest.exports);
    if (!sameArray(actualExportKeys, expectedExportKeys)) {
        fail(id, `expected export keys ${expectedExportKeys.join(",")}, got ${actualExportKeys.join(",")}`);
    }

    if (pkgContract.requirePublishConfig && manifest.publishConfig == null) {
        fail(id, "publishConfig is required so future publishing inherits explicit behavior");
    }
    if (pkgContract.expectedPublishConfig?.access !== manifest.publishConfig?.access) {
        fail(
            id,
            `expected publishConfig.access ${pkgContract.expectedPublishConfig?.access}, got ${manifest.publishConfig?.access}`,
        );
    }
    if (pkgContract.expectedPublishConfig?.provenance !== manifest.publishConfig?.provenance) {
        fail(
            id,
            `expected publishConfig.provenance ${pkgContract.expectedPublishConfig?.provenance}, got ${manifest.publishConfig?.provenance}`,
        );
    }

    if (pkgContract.requirePrepublishOnly && manifest.scripts?.prepublishOnly == null) {
        fail(id, "scripts.prepublishOnly is required as the package gate of last resort");
    }

    for (const [scriptName, expectedCommand] of Object.entries(pkgContract.requiredScripts ?? {})) {
        const actualCommand = manifest.scripts?.[scriptName];
        if (actualCommand !== expectedCommand) {
            fail(id, `scripts.${scriptName} must be ${JSON.stringify(expectedCommand)}, got ${JSON.stringify(actualCommand)}`);
        }
    }
}

if (failures.length > 0) {
    console.error("package contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const packageCount = Array.isArray(contract.packages) ? contract.packages.length : 0;
console.log(`package contract passed (${packageCount} packages)`);
