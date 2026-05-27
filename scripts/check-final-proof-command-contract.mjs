#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs", "final-proof-command-contract.json"), "utf8"));
let failures = [];

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function contractRelativePath(label, relativePath) {
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

function assertStringArray(label, values, { allowEmpty = true } = {}) {
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && values.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return values.filter((value) => typeof value === "string" && value.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) fail(label, `contains duplicate entry: ${value}`);
        seen.add(value);
    }
}

function assertMarkerList(label, values, { required = true } = {}) {
    const markers = assertStringArray(label, values, { allowEmpty: !required });
    assertUnique(label, markers);
    return markers;
}

function validatePathEntries(label, entries) {
    if (!Array.isArray(entries)) {
        fail(label, "must be an array");
        return;
    }
    if (entries.length === 0) {
        fail(label, "must be a non-empty array");
    }
    assertUnique(
        `${label}.path`,
        entries.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
    entries.forEach((entry, index) => {
        const entryLabel = `${label}[${index}]`;
        contractRelativePath(`${entryLabel}.path`, entry?.path);
        assertMarkerList(`${entryLabel}.mustContain`, entry?.mustContain, { required: true });
        assertMarkerList(`${entryLabel}.mustNotContain`, entry?.mustNotContain ?? [], { required: false });
    });
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("contract.schemaVersion", "must be 1");
    assertNonEmptyString("contract.purpose", contract.purpose);
    const invariants = assertStringArray("contract.contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contract.contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-final-proof-command-paths",
        "typed-final-proof-targets",
        "typed-required-docs",
        "typed-required-scripts",
        "typed-required-receipt-contracts",
        "typed-ambiguous-reference-policy",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("contract.contractInvariants", `missing invariant ${invariant}`);
    }

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("contract.wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "final-proof-command-contract") {
            fail("contract.wiring.makeTarget", `must be final-proof-command-contract, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "final-proof-command-contract") {
            fail("contract.wiring.enterpriseAuditId", `must be final-proof-command-contract, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = contractRelativePath("contract.wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-final-proof-command-contract.mjs") {
            fail(
                "contract.wiring.checker",
                `must be scripts/check-final-proof-command-contract.mjs, got ${contract.wiring.checker ?? "(missing)"}`,
            );
        }
    }

    if (contract.targets == null || typeof contract.targets !== "object" || Array.isArray(contract.targets)) {
        fail("contract.targets", "must be an object");
    } else {
        const targetValues = Object.values(contract.targets);
        assertStringArray("contract.targets values", targetValues, { allowEmpty: false });
        assertUnique("contract.targets values", targetValues);
    }

    contractRelativePath("contract.makefile.path", contract.makefile?.path);
    assertMarkerList("contract.makefile.mustContain", contract.makefile?.mustContain, { required: true });
    assertMarkerList("contract.makefile.mustNotContain", contract.makefile?.mustNotContain ?? [], { required: false });
    validatePathEntries("contract.requiredDocs", contract.requiredDocs);
    validatePathEntries("contract.requiredScripts", contract.requiredScripts);
    validatePathEntries("contract.requiredReceiptContracts", contract.requiredReceiptContracts);

    const ambiguous = contract.ambiguousReferencePolicy ?? {};
    const scanRoots = assertStringArray("contract.ambiguousReferencePolicy.scanRoots", ambiguous.scanRoots, {
        allowEmpty: false,
    });
    assertUnique("contract.ambiguousReferencePolicy.scanRoots", scanRoots);
    for (const scanRoot of scanRoots) {
        contractRelativePath("contract.ambiguousReferencePolicy.scanRoots", scanRoot);
    }
    assertMarkerList("contract.ambiguousReferencePolicy.allowedLineMarkers", ambiguous.allowedLineMarkers, {
        required: true,
    });
}

function readRelative(relativePath, label = relativePath) {
    const normalizedPath = contractRelativePath(label, relativePath);
    if (normalizedPath == null) return "";
    const absolutePath = path.join(root, normalizedPath);
    if (!fs.existsSync(absolutePath)) {
        fail(normalizedPath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${JSON.stringify(marker)}`);
    }
}

function excludesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (text.includes(marker)) fail(label, `forbidden marker ${JSON.stringify(marker)}`);
    }
}

function listFiles(relativePath, label = relativePath) {
    const normalizedPath = contractRelativePath(label, relativePath);
    if (normalizedPath == null) return [];
    return listFilesUnchecked(normalizedPath);
}

function listFilesUnchecked(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) return [];
    if (fs.statSync(absolutePath).isFile()) return [relativePath];
    const entries = [];
    for (const name of fs.readdirSync(absolutePath)) {
        const child = path.join(relativePath, name);
        const childAbsolute = path.join(root, child);
        if (fs.statSync(childAbsolute).isDirectory()) {
            entries.push(...listFilesUnchecked(child));
        } else {
            entries.push(child);
        }
    }
    return entries;
}

validateContractShape();

if (failures.length > 0) {
    console.error("Final proof command contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = readRelative(contract.makefile.path, "contract.makefile.path");
includesAll(makefile, contract.makefile.mustContain, contract.makefile.path);
excludesAll(makefile, contract.makefile.mustNotContain, contract.makefile.path);

for (const [index, doc] of (contract.requiredDocs ?? []).entries()) {
    includesAll(readRelative(doc.path, `contract.requiredDocs[${index}].path`), doc.mustContain, doc.path);
}

for (const [index, script] of (contract.requiredScripts ?? []).entries()) {
    const text = readRelative(script.path, `contract.requiredScripts[${index}].path`);
    includesAll(text, script.mustContain, script.path);
    excludesAll(text, script.mustNotContain, script.path);
}

for (const [index, receiptContract] of (contract.requiredReceiptContracts ?? []).entries()) {
    const text = readRelative(receiptContract.path, `contract.requiredReceiptContracts[${index}].path`);
    includesAll(text, receiptContract.mustContain, receiptContract.path);
    excludesAll(text, receiptContract.mustNotContain, receiptContract.path);
}

const ambiguous = contract.ambiguousReferencePolicy;
const ambiguousRegex = /(^|[^A-Za-z0-9_-])make final-proof(?![-A-Za-z0-9_])/g;
for (const [index, scanRoot] of (ambiguous.scanRoots ?? []).entries()) {
    for (const relativePath of listFiles(scanRoot, `contract.ambiguousReferencePolicy.scanRoots[${index}]`)) {
        if (relativePath.includes("node_modules") || relativePath.includes("dist/")) continue;
        const text = readRelative(relativePath, relativePath);
        const lines = text.split("\n");
        lines.forEach((line, index) => {
            if (!ambiguousRegex.test(line)) {
                ambiguousRegex.lastIndex = 0;
                return;
            }
            ambiguousRegex.lastIndex = 0;
            const allowed = (ambiguous.allowedLineMarkers ?? []).some((marker) => line.includes(marker));
            if (!allowed) {
                fail(relativePath, `ambiguous make final-proof reference on line ${index + 1}: ${line.trim()}`);
            }
        });
    }
}

if (failures.length > 0) {
    console.error("Final proof command contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Final proof command contract passed");
