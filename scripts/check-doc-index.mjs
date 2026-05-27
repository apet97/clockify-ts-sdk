#!/usr/bin/env node
// check-doc-index: enforces docs/README.md links and required generated surfaces.
// Required entries include diagnostics-policy.md, diagnostics-contract.json,
// quickstart-receipt.md, and quickstart-receipt-contract.json so the contracts
// stay discoverable from the docs index.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractPath = path.join(root, "docs", "docs-index-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const failures = [];
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

    const invariants = assertStringArray(value.contractInvariants, "contractInvariants");
    for (const requiredInvariant of [
        "safe-docs-index-paths",
        "typed-required-links",
        "all-index-links-resolve",
        "required-link-presence",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(requiredInvariant)) {
            failShape(`contractInvariants must include ${requiredInvariant}`);
        }
    }

    assertSafeRelativePath(value.indexPath, "indexPath");
    if (value.indexPath !== "docs/README.md") {
        failShape(`indexPath must be docs/README.md, got ${value.indexPath ?? "(missing)"}`);
    }

    for (const [index, requiredLink] of assertStringArray(value.requiredLinks, "requiredLinks").entries()) {
        assertSafeRelativePath(requiredLink, `requiredLinks[${index}]`);
    }

    if (!Number.isInteger(value.expectedRequiredLinkCount) || value.expectedRequiredLinkCount <= 0) {
        failShape("expectedRequiredLinkCount must be a positive integer");
    } else if (Array.isArray(value.requiredLinks) && value.expectedRequiredLinkCount !== value.requiredLinks.length) {
        failShape(`expectedRequiredLinkCount ${value.expectedRequiredLinkCount} does not match requiredLinks.length ${value.requiredLinks.length}`);
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "docs-index-drift") {
            failShape(`wiring.makeTarget must be docs-index-drift, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "generated-doc-drift") {
            failShape(`wiring.enterpriseAuditId must be generated-doc-drift, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-doc-index.mjs") {
            failShape(`wiring.checker must be scripts/check-doc-index.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("docs index contract shape failed");
    for (const failure of shapeFailures) console.error(failure);
    process.exit(1);
}

const indexPath = path.join(root, contract.indexPath);
const text = fs.readFileSync(indexPath, "utf8");

for (const match of text.matchAll(/\]\(\.\/([^)#]+)(?:#[^)]+)?\)/g)) {
    const relative = match[1];
    const absolute = path.join(root, "docs", relative);
    if (!fs.existsSync(absolute)) failures.push(`docs/README.md links missing file: docs/${relative}`);
}

for (const required of contract.requiredLinks) {
    if (!text.includes(`./${required}`)) failures.push(`docs/README.md missing ${required}`);
}

const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
const qualityGates = fs.readFileSync(path.join(root, "docs", "quality-gates.md"), "utf8");
const enterpriseAudit = fs.readFileSync(path.join(root, "docs", "enterprise-hardening-audit.json"), "utf8");

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
    failures.push(`Makefile missing target: ${contract.wiring.makeTarget}`);
}
if (!makefile.includes("perfect-fast:") || !makefile.includes("docs-index-drift")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing docs-index-drift");
}
if (!qualityGates.includes("make docs-index-drift")) {
    failures.push("docs/quality-gates.md missing make docs-index-drift");
}
if (!enterpriseAudit.includes('"id": "generated-doc-drift"')) {
    failures.push("docs/enterprise-hardening-audit.json missing generated-doc-drift requirement");
}

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

console.log("docs index links are current");
