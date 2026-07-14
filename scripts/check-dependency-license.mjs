#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "dependency-license-contract.json"), "utf8"));
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

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function checkEntry(entry) {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return;

    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }
}

function sorted(value) {
    return [...(Array.isArray(value) ? value : [])].sort((a, b) => a.localeCompare(b));
}

function markdownTableCells(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) return null;
    const cells = trimmed.split("|").slice(1);
    if (cells.at(-1) === "") cells.pop();
    return cells.map((cell) => cell.trim());
}

function dependencyPolicyRows(text, header) {
    const lines = text.split("\n");
    const normalizedHeader = typeof header === "string" ? header.trim() : "";
    const headerIndexes = normalizedHeader
        ? lines
              .map((line, index) => (line.trim() === normalizedHeader ? index : -1))
              .filter((index) => index >= 0)
        : [];
    const rows = new Map();
    const duplicates = new Set();
    const headerIndex = headerIndexes[0];
    if (headerIndex == null) return { rows, duplicates, headerCount: 0 };

    for (let index = headerIndex + 1; index < lines.length; index += 1) {
        const cells = markdownTableCells(lines[index]);
        if (cells == null) break;
        if (cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
        const packageName = cells[0]?.match(/^`([^`]+)`$/)?.[1];
        if (!packageName || cells.length < 2) continue;
        const dependencies = /^none$/i.test(cells[1])
            ? []
            : [...cells[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
        if (rows.has(packageName)) {
            duplicates.add(packageName);
            continue;
        }
        rows.set(packageName, sorted(dependencies));
    }
    return { rows, duplicates, headerCount: headerIndexes.length };
}

function dependencyPolicyRowKeyDifference(rows, expectedPackageNames) {
    const actual = sorted([...rows.keys()]);
    const expected = sorted(expectedPackageNames);
    const actualSet = new Set(actual);
    const expectedSet = new Set(expected);
    return {
        actual,
        expected,
        missing: expected.filter((packageName) => !actualSet.has(packageName)),
        unexpected: actual.filter((packageName) => !expectedSet.has(packageName)),
    };
}

const policyTableHeader = "| Package | Runtime dependencies | SDK relationship |";
const policyRowProbe = dependencyPolicyRows(
    `${policyTableHeader}\n|---|---|---|\n| \`cli\` | \`commander\` | CLI |\n| \`mcp\` | \`commander\`, \`zod\` | MCP |`,
    policyTableHeader,
).rows;
if (
    JSON.stringify(policyRowProbe.get("cli")) !== JSON.stringify(["commander"]) ||
    JSON.stringify(policyRowProbe.get("mcp")) !== JSON.stringify(["commander", "zod"])
) {
    failures.push("dependency policy row self-test regressed: package rows must be validated independently");
}

const outsideTableProbe = dependencyPolicyRows(
    `${policyTableHeader}\n|---|---|---|\n| \`mcp\` | \`commander\` | governed |\n\n| Package | Runtime dependencies | Notes |\n|---|---|---|\n| \`cli\` | \`commander\`, \`zod\` | unrelated |`,
    policyTableHeader,
);
if (outsideTableProbe.rows.has("cli")) {
    failures.push("dependency policy table self-test regressed: rows outside the configured table must be ignored");
}

const duplicateRowProbe = dependencyPolicyRows(
    `${policyTableHeader}\n|---|---|---|\n| \`cli\` | \`commander\` | first |\n| \`cli\` | \`commander\`, \`zod\` | duplicate |`,
    policyTableHeader,
);
if (!duplicateRowProbe.duplicates?.has("cli")) {
    failures.push("dependency policy table self-test regressed: duplicate package rows must be rejected");
}

const surplusRowProbe = dependencyPolicyRows(
    `${policyTableHeader}\n|---|---|---|\n| \`sdk\` | None | SDK |\n| \`cli\` | \`commander\` | CLI |\n| \`mcp\` | \`zod\` | MCP |\n| \`fictitious\` | None | surplus |`,
    policyTableHeader,
);
const surplusRowDifference = dependencyPolicyRowKeyDifference(surplusRowProbe.rows, [
    "sdk",
    "cli",
    "mcp",
]);
if (
    surplusRowDifference.missing.length !== 0 ||
    JSON.stringify(surplusRowDifference.unexpected) !== JSON.stringify(["fictitious"])
) {
    failures.push("dependency policy table self-test regressed: surplus package rows must be rejected");
}

function validateEvidenceEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const mustContain = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, mustContain);
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEvidenceEntry("policyDocument", contract.policyDocument);

    if (assertObject("dependencyPolicyTable", contract.dependencyPolicyTable)) {
        safeRelativePath("dependencyPolicyTable.path", contract.dependencyPolicyTable.path);
        assertNonEmptyString("dependencyPolicyTable.header", contract.dependencyPolicyTable.header);
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
    assertUnique(
        "packages.packageName",
        (contract.packages ?? [])
            .map((pkg) => pkg?.packageName)
            .filter((packageName) => typeof packageName === "string"),
    );
    for (const [index, pkg] of (contract.packages ?? []).entries()) {
        const label = pkg?.id ?? `packages[${index}]`;
        if (!assertObject(label, pkg)) continue;
        assertNonEmptyString(`${label}.id`, pkg.id);
        assertNonEmptyString(`${label}.packageName`, pkg.packageName);
        const manifest = safeRelativePath(`${label}.manifest`, pkg.manifest);
        if (manifest != null && path.basename(manifest) !== "package.json") {
            fail(`${label}.manifest`, "must point to a package.json manifest");
        }
        if (!Array.isArray(pkg.runtimeDependencies)) {
            fail(`${label}.runtimeDependencies`, "must be an array");
            continue;
        }
        assertUnique(
            `${label}.runtimeDependencies.name`,
            pkg.runtimeDependencies.map((dependency) => dependency?.name).filter((name) => typeof name === "string"),
        );
        for (const [dependencyIndex, dependency] of pkg.runtimeDependencies.entries()) {
            const dependencyLabel = `${label}.runtimeDependencies[${dependencyIndex}]`;
            if (!assertObject(dependencyLabel, dependency)) continue;
            assertNonEmptyString(`${dependencyLabel}.name`, dependency.name);
            assertNonEmptyString(`${dependencyLabel}.range`, dependency.range);
            assertNonEmptyString(`${dependencyLabel}.license`, dependency.license);
            assertNonEmptyString(`${dependencyLabel}.purpose`, dependency.purpose);
        }
    }

    for (const field of ["allowedLicenses", "forbiddenRuntimeDependencies"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    assertUnique(
        "supportingEvidence.path",
        (contract.supportingEvidence ?? [])
            .map((entry) => entry?.path)
            .filter((entryPath) => typeof entryPath === "string"),
    );
    for (const [index, entry] of (contract.supportingEvidence ?? []).entries()) {
        validateEvidenceEntry(`supportingEvidence[${index}]`, entry);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        const docsIndex = assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, {
            allowEmpty: false,
        });
        assertUnique("wiring.docsIndex", docsIndex);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Dependency license contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const entry of contract.supportingEvidence ?? []) checkEntry(entry);

const allowedLicenses = new Set(contract.allowedLicenses ?? []);
for (const pkg of contract.packages ?? []) {
    if (pkg == null || typeof pkg !== "object" || Array.isArray(pkg)) continue;

    const manifestText = readRelative(pkg.manifest, `${pkg.id}.manifest`);
    if (!manifestText) continue;
    const manifest = JSON.parse(manifestText);
    if (manifest.name !== pkg.packageName) fail(pkg.id, `expected package name ${pkg.packageName}, got ${manifest.name}`);

    const expectedDeps = sorted((pkg.runtimeDependencies ?? []).map((dep) => dep.name));
    const actualDeps = sorted(Object.keys(manifest.dependencies ?? {}));
    if (JSON.stringify(expectedDeps) !== JSON.stringify(actualDeps)) {
        fail(pkg.id, `runtime dependency ledger drift: expected ${expectedDeps.join(",") || "(none)"}, got ${actualDeps.join(",") || "(none)"}`);
    }

    for (const dependency of pkg.runtimeDependencies ?? []) {
        if (!allowedLicenses.has(dependency.license)) fail(pkg.id, `${dependency.name} uses unapproved license ${dependency.license}`);
        if (!dependency.purpose || dependency.purpose.length < 12) fail(pkg.id, `${dependency.name} missing useful purpose`);
        if (manifest.dependencies?.[dependency.name] !== dependency.range) {
            fail(
                pkg.id,
                `${dependency.name} range drift: expected ${dependency.range}, got ${manifest.dependencies?.[dependency.name]}`,
            );
        }
    }

    for (const forbidden of contract.forbiddenRuntimeDependencies ?? []) {
        if (actualDeps.includes(forbidden)) fail(pkg.id, `forbidden runtime dependency ${forbidden}`);
    }
}

const policyPath = contract.policyDocument?.path;
const policyText = readRelative(policyPath, "policyDocument.path");
const dependencyPolicyPath = contract.dependencyPolicyTable?.path;
const dependencyPolicyText = readRelative(dependencyPolicyPath, "dependencyPolicyTable.path");
const policyTable = dependencyPolicyRows(dependencyPolicyText, contract.dependencyPolicyTable?.header);
if (policyTable.headerCount === 0) {
    fail(
        dependencyPolicyPath,
        `missing dependency policy table header ${JSON.stringify(contract.dependencyPolicyTable?.header)}`,
    );
} else if (policyTable.headerCount > 1) {
    fail(
        dependencyPolicyPath,
        `dependency policy table header appears ${policyTable.headerCount} times; expected exactly once`,
    );
}
for (const packageName of sorted([...policyTable.duplicates])) {
    fail(dependencyPolicyPath, `duplicate runtime dependency Markdown ledger row for ${packageName}`);
}
const policyRows = policyTable.rows;
const policyRowKeyDifference = dependencyPolicyRowKeyDifference(
    policyRows,
    (contract.packages ?? []).map((pkg) => pkg?.packageName),
);
for (const packageName of policyRowKeyDifference.missing) {
    fail(dependencyPolicyPath, `missing runtime dependency Markdown ledger row for ${packageName}`);
}
for (const packageName of policyRowKeyDifference.unexpected) {
    fail(dependencyPolicyPath, `unexpected runtime dependency Markdown ledger row for ${packageName}`);
}
for (const pkg of contract.packages ?? []) {
    if (pkg == null || typeof pkg !== "object" || Array.isArray(pkg)) continue;

    if (!policyText.includes(pkg.packageName)) fail(policyPath, `missing package ${pkg.packageName}`);
    const expectedDeps = sorted((pkg.runtimeDependencies ?? []).map((dependency) => dependency.name));
    const documentedDeps = policyRows.get(pkg.packageName);
    if (documentedDeps != null && JSON.stringify(documentedDeps) !== JSON.stringify(expectedDeps)) {
        fail(
            dependencyPolicyPath,
            `${pkg.packageName} runtime dependency Markdown ledger drift: expected ${expectedDeps.join(",") || "(none)"}, got ${documentedDeps.join(",") || "(none)"}`,
        );
    }
    for (const dependency of pkg.runtimeDependencies ?? []) {
        if (dependency == null || typeof dependency !== "object" || Array.isArray(dependency)) continue;

        if (!policyText.includes(dependency.name)) fail(policyPath, `missing dependency ${dependency.name}`);
        if (!policyText.includes(dependency.license)) fail(policyPath, `missing license ${dependency.license}`);
    }
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(wiring.makeTarget)) fail("Makefile", `contract-gates missing ${wiring.makeTarget}`);

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Dependency license contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Dependency license contract passed");
