#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "runtime-support.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];
const shapeFailures = [];

function failShape(message) {
    shapeFailures.push(`contract: ${message}`);
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

    if (!isNonEmptyString(value.nodeFloor) || !/^>=\d+$/.test(value.nodeFloor)) {
        failShape(`nodeFloor must use a >=N engine floor, got ${value.nodeFloor ?? "(missing)"}`);
    }

    if (value.moduleType !== "module") {
        failShape(`moduleType must be module, got ${value.moduleType ?? "(missing)"}`);
    }

    const invariants = assertStringArray(value.contractInvariants, "contractInvariants");
    for (const requiredInvariant of [
        "safe-runtime-support-paths",
        "typed-runtime-package-entries",
        "package-engines-match-node-floor",
        "runtime-docs-mention-node-floor",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    const requiredDocsMarkers = assertStringArray(value.requiredDocsMarkers, "requiredDocsMarkers");
    if (isNonEmptyString(value.nodeFloor) && !requiredDocsMarkers.includes(value.nodeFloor)) {
        failShape(`requiredDocsMarkers must include nodeFloor ${value.nodeFloor}`);
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
    for (const [index, pkg] of (Array.isArray(value.packages) ? value.packages : []).entries()) {
        const prefix = `packages[${index}]`;
        if (!isPlainObject(pkg)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        for (const field of ["id", "manifest", "name", "engine"]) {
            if (!isNonEmptyString(pkg[field])) {
                failShape(`${prefix}.${field} must be a non-empty string`);
            }
        }

        if (isNonEmptyString(pkg.id)) {
            if (packageIds.has(pkg.id)) {
                failShape(`${prefix}.id duplicates ${pkg.id}`);
            }
            packageIds.add(pkg.id);
        }

        assertSafeRelativePath(pkg.manifest, `${prefix}.manifest`);
        if (isNonEmptyString(pkg.manifest) && !pkg.manifest.endsWith("/package.json")) {
            failShape(`${prefix}.manifest must point at a package.json file`);
        }

        if (isNonEmptyString(value.nodeFloor) && isNonEmptyString(pkg.engine) && pkg.engine !== value.nodeFloor) {
            failShape(`${prefix}.engine ${pkg.engine} must match nodeFloor ${value.nodeFloor}`);
        }

        const docs = assertStringArray(pkg.docs, `${prefix}.docs`);
        for (const [docIndex, docPath] of docs.entries()) {
            assertSafeRelativePath(docPath, `${prefix}.docs[${docIndex}]`);
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
        if (value.wiring.makeTarget !== "runtime-support") {
            failShape(`wiring.makeTarget must be runtime-support, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "runtime-support") {
            failShape(`wiring.enterpriseAuditId must be runtime-support, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-runtime-support.mjs") {
            failShape(`wiring.checker must be scripts/check-runtime-support.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("runtime support contract shape failed");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const pkg of contract.packages ?? []) {
    const manifestPath = path.join(root, pkg.manifest);
    if (!fs.existsSync(manifestPath)) {
        fail(pkg.id, `${pkg.manifest} is missing`);
        continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.name !== pkg.name) {
        fail(pkg.id, `expected package name ${pkg.name}, got ${manifest.name}`);
    }

    if (manifest.type !== contract.moduleType) {
        fail(pkg.id, `expected package type ${contract.moduleType}, got ${manifest.type ?? "(missing)"}`);
    }

    if (manifest.engines?.node !== pkg.engine) {
        fail(pkg.id, `expected engines.node ${pkg.engine}, got ${manifest.engines?.node ?? "(missing)"}`);
    }

    for (const docPath of pkg.docs ?? []) {
        const absoluteDocPath = path.join(root, docPath);
        if (!fs.existsSync(absoluteDocPath)) {
            fail(pkg.id, `${docPath} is missing`);
            continue;
        }

        const doc = fs.readFileSync(absoluteDocPath, "utf8");
        const runtimeMarkers = new Set([
            pkg.engine,
            `Node ${pkg.engine.replace(">=", "")}`,
            ...contract.requiredDocsMarkers,
        ]);
        if (![...runtimeMarkers].some((marker) => doc.includes(marker))) {
            fail(pkg.id, `${docPath} does not mention one of: ${[...runtimeMarkers].join(", ")}`);
        }
    }
}

if (failures.length > 0) {
    console.error("runtime support check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`runtime support contract passed (${contract.packages.length} packages, Node ${contract.nodeFloor})`);
