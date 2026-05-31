#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "dependency-boundary.json"), "utf8"));
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

function assertStringMap(label, value) {
    if (value == null) return;
    if (!assertObject(label, value)) return;
    for (const [name, range] of Object.entries(value)) {
        assertNonEmptyString(`${label}.${name}`, range);
    }
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
    return Object.keys(value ?? {}).sort((a, b) => a.localeCompare(b));
}

function sortedArray(value) {
    return [...(Array.isArray(value) ? value : [])].sort((a, b) => a.localeCompare(b));
}

function sameArray(left, right) {
    return JSON.stringify(sortedArray(left)) === JSON.stringify(sortedArray(right));
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.enterpriseAuditId", contract.wiring.enterpriseAuditId);
        if (contract.wiring.makeTarget !== "dependency-boundary") {
            fail("wiring.makeTarget", "must be dependency-boundary");
        }
        if (contract.wiring.checker !== "scripts/check-dependency-boundary.mjs") {
            fail("wiring.checker", "must be scripts/check-dependency-boundary.mjs");
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
        const manifest = safeRelativePath(`${label}.manifest`, pkgContract.manifest);
        if (manifest != null && path.basename(manifest) !== "package.json") {
            fail(`${label}.manifest`, "must point to a package.json manifest");
        }
        const lockfile = safeRelativePath(`${label}.lockfile`, pkgContract.lockfile);
        if (lockfile != null && path.basename(lockfile) !== "package-lock.json") {
            fail(`${label}.lockfile`, "must point to a package-lock.json lockfile");
        }
        if (!Number.isInteger(pkgContract.lockfileVersion) || pkgContract.lockfileVersion < 3) {
            fail(`${label}.lockfileVersion`, "must be an integer >= 3");
        }

        for (const field of ["runtimeDependencies", "requiredDevDependencies"]) {
            const values = assertStringArray(`${label}.${field}`, pkgContract[field]);
            assertUnique(`${label}.${field}`, values);
        }
        assertStringMap(`${label}.peerDependencies`, pkgContract.peerDependencies ?? {});
        assertStringMap(`${label}.devDependencies`, pkgContract.devDependencies ?? {});
    }

    for (const field of ["forbiddenRuntimeDependencies", "forbiddenDependencyNames", "forbiddenImportMarkers", "sourceRoots"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }
    const forbiddenDependencyManifestPaths = assertStringArray(
        "forbiddenDependencyManifestPaths",
        contract.forbiddenDependencyManifestPaths,
        { allowEmpty: false },
    );
    assertUnique("forbiddenDependencyManifestPaths", forbiddenDependencyManifestPaths);
    for (const [index, manifestPath] of forbiddenDependencyManifestPaths.entries()) {
        safeRelativePath(`forbiddenDependencyManifestPaths[${index}]`, manifestPath);
    }
    for (const [index, sourceRoot] of (contract.sourceRoots ?? []).entries()) {
        safeRelativePath(`sourceRoots[${index}]`, sourceRoot);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("dependency boundary contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

for (const pkgContract of contract.packages ?? []) {
    if (pkgContract == null || typeof pkgContract !== "object" || Array.isArray(pkgContract)) continue;

    const safeManifest = safeRelativePath(`${pkgContract.id}.manifest`, pkgContract.manifest);
    if (safeManifest == null) continue;

    const manifestPath = path.join(root, safeManifest);
    if (!fs.existsSync(manifestPath)) {
        fail(pkgContract.id, `${pkgContract.manifest} is missing`);
        continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const safeLockfile = safeRelativePath(`${pkgContract.id}.lockfile`, pkgContract.lockfile);
    if (safeLockfile == null) continue;

    const lockfilePath = path.join(root, safeLockfile);
    if (!fs.existsSync(lockfilePath)) {
        fail(pkgContract.id, `${pkgContract.lockfile} is missing`);
        continue;
    }

    const lockfile = JSON.parse(fs.readFileSync(lockfilePath, "utf8"));
    // With npm workspaces, lockfile.packages[""] is the root and each
    // workspace lives under its repo-relative directory key (e.g., "wrapper").
    const workspaceKey = path.dirname(safeManifest);
    const workspaceEntry = lockfile.packages?.[workspaceKey] ?? lockfile.packages?.[""] ?? {};
    if (lockfile.lockfileVersion !== pkgContract.lockfileVersion) {
        fail(
            pkgContract.id,
            `expected ${pkgContract.lockfile} lockfileVersion ${pkgContract.lockfileVersion}, got ${lockfile.lockfileVersion}`,
        );
    }
    if (workspaceEntry.name !== manifest.name) {
        fail(pkgContract.id, `${pkgContract.lockfile} entry ${workspaceKey} name ${workspaceEntry.name} does not match manifest ${manifest.name}`);
    }
    if (workspaceEntry.version !== manifest.version) {
        fail(
            pkgContract.id,
            `${pkgContract.lockfile} entry ${workspaceKey} version ${workspaceEntry.version} does not match manifest ${manifest.version}`,
        );
    }

    const actualRuntimeDeps = sortedKeys(manifest.dependencies);
    if (!sameArray(actualRuntimeDeps, pkgContract.runtimeDependencies)) {
        fail(
            pkgContract.id,
            `runtime dependency drift: expected ${sortedArray(pkgContract.runtimeDependencies).join(",") || "(none)"}, got ${actualRuntimeDeps.join(",") || "(none)"}`,
        );
    }

    for (const forbidden of contract.forbiddenRuntimeDependencies ?? []) {
        if (actualRuntimeDeps.includes(forbidden)) fail(pkgContract.id, `forbidden runtime dependency ${forbidden}`);
    }

    for (const [name, range] of Object.entries(pkgContract.peerDependencies ?? {})) {
        if (manifest.peerDependencies?.[name] !== range) {
            fail(pkgContract.id, `expected peer dependency ${name}@${range}`);
        }
    }

    for (const [name, range] of Object.entries(pkgContract.devDependencies ?? {})) {
        if (manifest.devDependencies?.[name] !== range) {
            fail(pkgContract.id, `expected dev dependency ${name}@${range}`);
        }
    }

    for (const name of pkgContract.requiredDevDependencies ?? []) {
        if (typeof manifest.devDependencies?.[name] !== "string") {
            fail(pkgContract.id, `missing required dev dependency ${name}`);
        }
    }
}

for (const manifestPath of contract.forbiddenDependencyManifestPaths ?? []) {
    const safeManifest = safeRelativePath("forbiddenDependencyManifestPaths", manifestPath);
    if (safeManifest == null) continue;
    const absoluteManifest = path.join(root, safeManifest);
    if (!fs.existsSync(absoluteManifest)) {
        fail(manifestPath, "manifest is missing");
        continue;
    }
    const manifest = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
    const dependencyBuckets = {
        dependencies: manifest.dependencies ?? {},
        devDependencies: manifest.devDependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        optionalDependencies: manifest.optionalDependencies ?? {},
    };
    for (const [bucketName, bucket] of Object.entries(dependencyBuckets)) {
        for (const forbidden of contract.forbiddenDependencyNames ?? []) {
            if (Object.hasOwn(bucket, forbidden)) {
                fail(manifestPath, `${bucketName} must not include hosted generator dependency ${forbidden}`);
            }
        }
    }
}

for (const marker of contract.forbiddenImportMarkers ?? []) {
    if (typeof marker !== "string") continue;

    for (const relativePath of sourceFiles(contract.sourceRoots ?? [])) {
        const text = fs.readFileSync(path.join(root, relativePath), "utf8");
        if (text.includes(marker)) fail(relativePath, `contains forbidden import marker ${marker}`);
    }
}

if (failures.length > 0) {
    console.error("dependency boundary check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const packageCount = Array.isArray(contract.packages) ? contract.packages.length : 0;
console.log(`dependency boundary passed (${packageCount} packages)`);

function sourceFiles(relativeRoots) {
    const files = [];
    for (const relativeRoot of relativeRoots) {
        const safeRoot = safeRelativePath("sourceRoots", relativeRoot);
        if (safeRoot == null) continue;

        const absoluteRoot = path.join(root, safeRoot);
        if (!fs.existsSync(absoluteRoot)) continue;
        walk(absoluteRoot, files);
    }
    return files;
}

function walk(directory, files) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            if (["node_modules", "dist"].includes(entry.name)) continue;
            if (path.relative(root, absolutePath) === path.join("wrapper", "src")) continue;
            walk(absolutePath, files);
            continue;
        }
        if (!entry.isFile()) continue;
        if (![".ts", ".tsx", ".js", ".mjs"].includes(path.extname(entry.name))) continue;
        files.push(path.relative(root, absolutePath));
    }
}
