#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "docs", "version-policy.json");
const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const failures = [];
const shapeFailures = [];

function failShape(message) {
    shapeFailures.push(`policy: ${message}`);
}

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function assertStringArray(value, field, { allowEmpty = false } = {}) {
    if (!Array.isArray(value)) {
        failShape(`${field} must be an array`);
        return [];
    }

    if (!allowEmpty && value.length === 0) {
        failShape(`${field} must not be empty`);
    }

    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        if (!isNonEmptyString(entry)) {
            failShape(`${field}[${index}] must be a non-empty string`);
            continue;
        }

        if (seen.has(entry)) {
            failShape(`${field} contains duplicate entry ${entry}`);
            continue;
        }

        seen.add(entry);
    }

    return value;
}

function assertSafeRelativePath(value, field) {
    if (!isNonEmptyString(value)) {
        failShape(`${field} must be a non-empty string path`);
        return;
    }

    if (path.isAbsolute(value)) {
        failShape(`${field} must be repo-relative, got ${value}`);
    }

    if (value.includes("\\") || value.includes("//")) {
        failShape(`${field} must use normalized forward-slash paths, got ${value}`);
    }

    if (value.split("/").includes("..")) {
        failShape(`${field} must not escape the repository, got ${value}`);
    }

    if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
        failShape(`${field} contains unsupported path characters, got ${value}`);
    }
}

function assertPolicyShape(value) {
    if (!isPlainObject(value)) {
        failShape("root must be a JSON object");
        return;
    }

    if (value.schemaVersion !== 1) {
        failShape(`schemaVersion must be 1, got ${value.schemaVersion ?? "(missing)"}`);
    }

    if (!isNonEmptyString(value.purpose)) {
        failShape("purpose must be a non-empty string");
    }


    assertSafeRelativePath(value.productSurfacePath, "productSurfacePath");
    if (value.productSurfacePath !== "docs/product-surface.json") {
        failShape(`productSurfacePath must be docs/product-surface.json, got ${value.productSurfacePath ?? "(missing)"}`);
    }

    const productSurfaceFields = assertStringArray(value.productSurfaceMustMatchManifest, "productSurfaceMustMatchManifest");
    for (const requiredField of ["package", "version", "prepublishOnly"]) {
        if (!productSurfaceFields.includes(requiredField)) {
            failShape(`productSurfaceMustMatchManifest must include ${requiredField}`);
        }
    }

    const allowedProductSurfaceFields = new Set(["package", "version", "prepublishOnly"]);
    for (const field of productSurfaceFields) {
        if (!allowedProductSurfaceFields.has(field)) {
            failShape(`productSurfaceMustMatchManifest contains unsupported field ${field}`);
        }
    }

    const requiredPackageIds = assertStringArray(value.requiredPackageIds, "requiredPackageIds");
    if (!Array.isArray(value.packages) || value.packages.length === 0) {
        failShape("packages must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedPackageCount) || value.expectedPackageCount <= 0) {
        failShape("expectedPackageCount must be a positive integer");
    } else if (Array.isArray(value.packages) && value.expectedPackageCount !== value.packages.length) {
        failShape(`expectedPackageCount ${value.expectedPackageCount} does not match packages.length ${value.packages.length}`);
    }

    const packageIds = new Set();
    for (const [index, pkgPolicy] of (Array.isArray(value.packages) ? value.packages : []).entries()) {
        const prefix = `packages[${index}]`;
        if (!isPlainObject(pkgPolicy)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        for (const field of ["id", "manifest", "changelog", "productSurfaceId"]) {
            if (!isNonEmptyString(pkgPolicy[field])) {
                failShape(`${prefix}.${field} must be a non-empty string`);
            }
        }

        if (isNonEmptyString(pkgPolicy.id)) {
            if (packageIds.has(pkgPolicy.id)) {
                failShape(`${prefix}.id duplicates ${pkgPolicy.id}`);
            }
            packageIds.add(pkgPolicy.id);
        }

        assertSafeRelativePath(pkgPolicy.manifest, `${prefix}.manifest`);
        if (isNonEmptyString(pkgPolicy.manifest) && !pkgPolicy.manifest.endsWith("/package.json")) {
            failShape(`${prefix}.manifest must point at a package.json file`);
        }

        assertSafeRelativePath(pkgPolicy.changelog, `${prefix}.changelog`);
        if (isNonEmptyString(pkgPolicy.changelog) && !pkgPolicy.changelog.endsWith("/CHANGELOG.md")) {
            failShape(`${prefix}.changelog must point at a package changelog`);
        }

        if ("readme" in pkgPolicy) {
            assertSafeRelativePath(pkgPolicy.readme, `${prefix}.readme`);
        }

        if ("installExampleMustContain" in pkgPolicy && !isNonEmptyString(pkgPolicy.installExampleMustContain)) {
            failShape(`${prefix}.installExampleMustContain must be a non-empty string when present`);
        }

        if ("installExampleMustContain" in pkgPolicy && !isNonEmptyString(pkgPolicy.readme)) {
            failShape(`${prefix}.installExampleMustContain requires ${prefix}.readme`);
        }

        if (typeof pkgPolicy.requireCurrentVersionHeading !== "boolean") {
            failShape(`${prefix}.requireCurrentVersionHeading must be boolean`);
        }
    }

    for (const requiredPackageId of requiredPackageIds) {
        if (!packageIds.has(requiredPackageId)) {
            failShape(`packages must include requiredPackageId ${requiredPackageId}`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "version-policy") {
            failShape(`wiring.makeTarget must be version-policy, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "version-policy") {
            failShape(`wiring.enterpriseAuditId must be version-policy, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-version-policy.mjs") {
            failShape(`wiring.checker must be scripts/check-version-policy.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

function manifestValue(manifest, productSurfaceField) {
    if (productSurfaceField === "package") return manifest.name;
    if (productSurfaceField === "prepublishOnly") return manifest.scripts?.prepublishOnly;
    return manifest[productSurfaceField];
}

assertPolicyShape(policy);

if (shapeFailures.length > 0) {
    console.error("version policy contract shape failed");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const productSurface = JSON.parse(fs.readFileSync(path.join(root, policy.productSurfacePath), "utf8"));

function productSurfacePackage(id) {
    const packages = productSurface.packages ?? {};
    if (Array.isArray(packages)) {
        return packages.find((entry) => entry.id === id);
    }
    return packages[id];
}

function versionHeadingRegex(version) {
    // Accept both the hand-written `## [x.y.z] - date` form and release-please's
    // `## [x.y.z](compare-url) (date)` form (a markdown link, so `(` follows `]`).
    return new RegExp(`^## \\[${escapeRegExp(version)}\\](?:[\\s(]|$)`, "m");
}

for (const pkgPolicy of policy.packages ?? []) {
    const manifestPath = path.join(root, pkgPolicy.manifest);
    if (!fs.existsSync(manifestPath)) {
        fail(pkgPolicy.id, `${pkgPolicy.manifest} is missing`);
        continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const productEntry = productSurfacePackage(pkgPolicy.productSurfaceId);
    if (!productEntry) {
        fail(pkgPolicy.id, `docs/product-surface.json missing package id ${pkgPolicy.productSurfaceId}`);
    } else {
        for (const field of policy.productSurfaceMustMatchManifest ?? ["version"]) {
            const expected = manifestValue(manifest, field);
            const actual = productEntry[field];
            if (actual !== expected) {
                fail(pkgPolicy.id, `product surface ${field} ${JSON.stringify(actual)} does not match package ${JSON.stringify(expected)}`);
            }
        }
    }

    const changelogPath = path.join(root, pkgPolicy.changelog);
    if (!fs.existsSync(changelogPath)) {
        fail(pkgPolicy.id, `${pkgPolicy.changelog} is missing`);
    } else {
        const changelog = fs.readFileSync(changelogPath, "utf8");
        if (!changelog.includes("## [Unreleased]")) {
            fail(pkgPolicy.id, `${pkgPolicy.changelog} missing [Unreleased] heading`);
        }
        if (pkgPolicy.requireCurrentVersionHeading && !versionHeadingRegex(manifest.version).test(changelog)) {
            fail(pkgPolicy.id, `${pkgPolicy.changelog} missing [${manifest.version}] heading`);
        }
    }

    if (pkgPolicy.readme) {
        const readmePath = path.join(root, pkgPolicy.readme);
        if (!fs.existsSync(readmePath)) {
            fail(pkgPolicy.id, `${pkgPolicy.readme} is missing`);
        } else if (pkgPolicy.installExampleMustContain) {
            const readme = fs.readFileSync(readmePath, "utf8");
            if (!readme.includes(pkgPolicy.installExampleMustContain)) {
                fail(pkgPolicy.id, `${pkgPolicy.readme} missing ${pkgPolicy.installExampleMustContain}`);
            }
        }
    }
}

if (failures.length > 0) {
    console.error("version policy check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`version policy passed (${policy.packages.length} packages)`);

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
