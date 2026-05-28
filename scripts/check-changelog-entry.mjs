#!/usr/bin/env node
// check-changelog-entry: confirms wrapper/CHANGELOG.md, cli/CHANGELOG.md, and
// mcp/CHANGELOG.md each carry an Unreleased entry covering the touched scope.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "changelog-coverage-contract.json"), "utf8"));
const shapeFailures = [];

function failShape(message) {
    shapeFailures.push(`contract: ${message}`);
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

function assertContractShape(value) {
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


    if (!isNonEmptyString(value.requiredHeading)) {
        failShape("requiredHeading must be a non-empty string");
    }

    const requiredPackageIds = assertStringArray(value.requiredPackageIds, "requiredPackageIds");
    if (!Array.isArray(value.packageScopes) || value.packageScopes.length === 0) {
        failShape("packageScopes must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedPackageScopeCount) || value.expectedPackageScopeCount <= 0) {
        failShape("expectedPackageScopeCount must be a positive integer");
    } else if (Array.isArray(value.packageScopes) && value.expectedPackageScopeCount !== value.packageScopes.length) {
        failShape(`expectedPackageScopeCount ${value.expectedPackageScopeCount} does not match packageScopes.length ${value.packageScopes.length}`);
    }

    const packageIds = new Set();
    for (const [index, scope] of (Array.isArray(value.packageScopes) ? value.packageScopes : []).entries()) {
        const prefix = `packageScopes[${index}]`;
        if (!isPlainObject(scope)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(scope.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (packageIds.has(scope.id)) {
                failShape(`${prefix}.id duplicates ${scope.id}`);
            }
            packageIds.add(scope.id);
        }

        for (const [pathIndex, scopePath] of assertStringArray(scope.paths, `${prefix}.paths`).entries()) {
            assertSafeRelativePath(scopePath, `${prefix}.paths[${pathIndex}]`);
            if (!scopePath.endsWith("/")) {
                failShape(`${prefix}.paths[${pathIndex}] must be a directory prefix ending in /`);
            }
        }

        assertSafeRelativePath(scope.changelog, `${prefix}.changelog`);
        if (isNonEmptyString(scope.changelog) && !scope.changelog.endsWith("/CHANGELOG.md")) {
            failShape(`${prefix}.changelog must point at a package CHANGELOG.md`);
        }
    }

    for (const requiredPackageId of requiredPackageIds) {
        if (!packageIds.has(requiredPackageId)) {
            failShape(`packageScopes must include requiredPackageId ${requiredPackageId}`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "changelog-drift") {
            failShape(`wiring.makeTarget must be changelog-drift, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "changelog-coverage") {
            failShape(`wiring.enterpriseAuditId must be changelog-coverage, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-changelog-entry.mjs") {
            failShape(`wiring.checker must be scripts/check-changelog-entry.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("changelog coverage contract shape failed");
    for (const failure of shapeFailures) console.error(failure);
    process.exit(1);
}

function git(args) {
    const result = spawnSync("git", args, { encoding: "utf8" });
    if (result.status !== 0) return [];
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

const changed = new Set([
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--name-only", "--cached"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
]);
const failures = [];

for (const scope of contract.packageScopes) {
    const touched = [...changed].some((file) =>
        scope.paths.some((prefix) => file.startsWith(prefix)) && file !== scope.changelog,
    );
    if (touched && !changed.has(scope.changelog)) {
        failures.push(`${scope.id}: user-visible package files changed but ${scope.changelog} did not`);
    }
    const changelog = fs.readFileSync(path.join(root, scope.changelog), "utf8");
    if (!changelog.includes(contract.requiredHeading)) {
        failures.push(`${scope.id}: ${scope.changelog} missing ${contract.requiredHeading}`);
    }
}

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}
console.log("changelog coverage is current for touched package scopes");
