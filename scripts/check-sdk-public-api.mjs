#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/sdk-public-api.json", "contract") ?? {};

function fail(message) {
    failures.push(message);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(`${label}: must be a non-empty repo-relative path`);
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(`${label}: must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function safePackageRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(`${label}: must be a non-empty package-relative path`);
        return "";
    }
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
        fail(`${label}: must not escape the package root: ${relativePath}`);
        return "";
    }
    return path.normalize(relativePath).replace(/\\/g, "/");
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${label}: missing`);
        return "";
    }

    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(`${label}: invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(`${label}: must be an object`);
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${label}: must be a non-empty string`);
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(`${label}: must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { min = 0 } = {}) {
    if (!Array.isArray(values)) {
        fail(`${label}: must be an array`);
        return [];
    }
    if (values.length < min) fail(`${label}: must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]: must be a non-empty string`);
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateStringArrayMap(label, value, { packageRelativeValues = false } = {}) {
    if (!assertObject(label, value)) return;
    for (const [key, values] of Object.entries(value)) {
        assertNonEmptyString(`${label}.${key}.key`, key);
        const strings = assertStringArray(`${label}.${key}`, values, { min: 1 });
        if (packageRelativeValues) {
            for (const [index, target] of strings.entries()) {
                safePackageRelativePath(`${label}.${key}[${index}]`, target);
            }
        }
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("packageName", contract.packageName);
    assertNonEmptyString("purpose", contract.purpose);


    if (assertObject("files", contract.files)) {
        for (const key of ["wrapperPackage", "wrapperTsconfig", "dualBuildSmoke"]) {
            safeRelativePath(`files.${key}`, contract.files[key]);
        }
    }

    assertStringArray("rootSymbols", contract.rootSymbols, { min: 1 });
    validateStringArrayMap("subpaths", contract.subpaths);
    validateStringArrayMap("tsconfigAliases", contract.tsconfigAliases, {
        packageRelativeValues: true,
    });

    if (assertObject("packageMarkerScan", contract.packageMarkerScan)) {
        assertNonEmptyString("packageMarkerScan.forbiddenRegex", contract.packageMarkerScan.forbiddenRegex);
        try {
            new RegExp(contract.packageMarkerScan.forbiddenRegex, "g");
        } catch (error) {
            fail(`packageMarkerScan.forbiddenRegex: invalid regex: ${error.message}`);
        }
        for (const [index, scanPath] of assertStringArray("packageMarkerScan.paths", contract.packageMarkerScan.paths, {
            min: 1,
        }).entries()) {
            safeRelativePath(`packageMarkerScan.paths[${index}]`, scanPath);
        }
    }

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

function sorted(value) {
    return [...value].sort((a, b) => a.localeCompare(b));
}

function sameArray(left, right) {
    return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

validateContractShape();

if (failures.length > 0) {
    console.error("SDK public API contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const pkg = readJson(contract.files.wrapperPackage, "files.wrapperPackage") ?? {};
const tsconfig = readJson(contract.files.wrapperTsconfig, "files.wrapperTsconfig") ?? {};
const smoke = readRelative(contract.files.dualBuildSmoke, "files.dualBuildSmoke");

if (pkg.name !== contract.packageName) {
    fail(`expected wrapper package ${contract.packageName}, got ${pkg.name}`);
}

const rootSymbols = contract.rootSymbols ?? [];
const duplicateRootSymbols = rootSymbols.filter((symbol, index) => rootSymbols.indexOf(symbol) !== index);
if (duplicateRootSymbols.length > 0) {
    fail(`duplicate root symbols: ${sorted(new Set(duplicateRootSymbols)).join(", ")}`);
}

for (const symbol of rootSymbols) {
    if (!smoke.includes(symbol)) {
        fail(`dual-build smoke is missing root symbol ${symbol}`);
    }
}

if (!smoke.includes(`surface.length`) || !smoke.includes(String(rootSymbols.length))) {
    fail(`dual-build smoke should report the expected ${rootSymbols.length} root symbols`);
}

const expectedSubpaths = sorted(Object.keys(contract.subpaths ?? {}));
const actualSubpaths = sorted(Object.keys(pkg.exports ?? {}));
if (!sameArray(expectedSubpaths, actualSubpaths)) {
    fail(`package exports drift: expected ${expectedSubpaths.join(", ")}, got ${actualSubpaths.join(", ")}`);
}

for (const [subpath, symbols] of Object.entries(contract.subpaths ?? {})) {
    const exportEntry = pkg.exports?.[subpath];
    if (exportEntry == null) {
        fail(`package.json exports missing ${subpath}`);
        continue;
    }

    for (const symbol of symbols) {
        if (!smoke.includes(symbol)) {
            fail(`dual-build smoke missing ${symbol} for ${subpath}`);
        }
    }
}

const expectedAliases = Object.entries(contract.tsconfigAliases ?? {});
const actualAliases = tsconfig.compilerOptions?.paths ?? {};
const expectedAliasNames = sorted(expectedAliases.map(([alias]) => alias));
const actualAliasNames = sorted(Object.keys(actualAliases));

if (!sameArray(expectedAliasNames, actualAliasNames)) {
    fail(`tsconfig package aliases drift: expected ${expectedAliasNames.join(", ")}, got ${actualAliasNames.join(", ")}`);
}

for (const [alias, expectedTargets] of expectedAliases) {
    const actualTargets = actualAliases[alias] ?? [];
    if (!sameArray(expectedTargets, actualTargets)) {
        fail(`${alias} path alias drift: expected ${expectedTargets.join(", ")}, got ${actualTargets.join(", ")}`);
    }
}

const markerScan = contract.packageMarkerScan;
if (markerScan?.forbiddenRegex) {
    const forbidden = new RegExp(markerScan.forbiddenRegex, "g");
    for (const relativePath of markerScan.paths ?? []) {
        const text = readRelative(relativePath);
        const matches = [...text.matchAll(forbidden)];
        for (const match of matches) {
            const line = text.slice(0, match.index).split("\n").length;
            fail(`${relativePath}:${line} contains stale SDK package marker ${match[0]}`);
        }
    }
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail(`Makefile missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail(`Makefile missing ${contract.wiring.checker} invocation`);
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail(`Makefile ${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("SDK public API contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `SDK public API contract passed (${rootSymbols.length} root symbols, ${expectedSubpaths.length} subpaths, ${expectedAliasNames.length} aliases)`,
);
