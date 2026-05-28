#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const contract = JSON.parse(await readRel("docs/decision-records-contract.json"));
const failures = [];
const shapeFailures = [];

async function readRel(relPath) {
    return readFile(path.join(root, relPath), "utf8");
}

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


    if (!isPlainObject(value.policyDocument)) {
        failShape("policyDocument must be an object");
    } else {
        assertSafeRelativePath(value.policyDocument.path, "policyDocument.path");
        if (value.policyDocument.path !== "docs/decision-records-policy.md") {
            failShape(`policyDocument.path must be docs/decision-records-policy.md, got ${value.policyDocument.path ?? "(missing)"}`);
        }
        assertStringArray(value.policyDocument.contains, "policyDocument.contains");
        assertStringArray(value.policyDocument.forbiddenMarkers, "policyDocument.forbiddenMarkers");
    }

    const requiredHeadings = assertStringArray(value.requiredHeadings, "requiredHeadings");
    for (const heading of ["Status", "Context", "Decision", "Consequences", "Proof"]) {
        if (!requiredHeadings.includes(heading)) {
            failShape(`requiredHeadings must include ${heading}`);
        }
    }

    const requiredRecordIds = assertStringArray(value.requiredRecordIds, "requiredRecordIds");
    if (!Array.isArray(value.records) || value.records.length === 0) {
        failShape("records must be a non-empty array");
    }

    if (!Number.isInteger(value.expectedRecordCount) || value.expectedRecordCount <= 0) {
        failShape("expectedRecordCount must be a positive integer");
    } else if (Array.isArray(value.records) && value.expectedRecordCount !== value.records.length) {
        failShape(`expectedRecordCount ${value.expectedRecordCount} does not match records.length ${value.records.length}`);
    }

    const recordIds = new Set();
    for (const [index, record] of (Array.isArray(value.records) ? value.records : []).entries()) {
        const prefix = `records[${index}]`;
        if (!isPlainObject(record)) {
            failShape(`${prefix} must be an object`);
            continue;
        }

        if (!isNonEmptyString(record.id)) {
            failShape(`${prefix}.id must be a non-empty string`);
        } else {
            if (recordIds.has(record.id)) {
                failShape(`${prefix}.id duplicates ${record.id}`);
            }
            recordIds.add(record.id);
        }

        assertSafeRelativePath(record.path, `${prefix}.path`);
        if (isNonEmptyString(record.path) && !/^docs\/decisions\/\d{4}-[a-z0-9-]+\.md$/.test(record.path)) {
            failShape(`${prefix}.path must use docs/decisions/NNNN-slug.md format`);
        }
        assertStringArray(record.contains, `${prefix}.contains`);
    }

    for (const requiredRecordId of requiredRecordIds) {
        if (!recordIds.has(requiredRecordId)) {
            failShape(`records must include requiredRecordId ${requiredRecordId}`);
        }
    }

    if (!isPlainObject(value.wiring)) {
        failShape("wiring must be an object");
    } else {
        if (value.wiring.makeTarget !== "decision-records") {
            failShape(`wiring.makeTarget must be decision-records, got ${value.wiring.makeTarget ?? "(missing)"}`);
        }
        if (value.wiring.enterpriseAuditId !== "decision-records") {
            failShape(`wiring.enterpriseAuditId must be decision-records, got ${value.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        assertSafeRelativePath(value.wiring.checker, "wiring.checker");
        if (value.wiring.checker !== "scripts/check-decision-records.mjs") {
            failShape(`wiring.checker must be scripts/check-decision-records.mjs, got ${value.wiring.checker ?? "(missing)"}`);
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers) {
        if (!text.includes(marker)) failures.push(`${label} missing marker: ${marker}`);
    }
}

assertContractShape(contract);

if (shapeFailures.length > 0) {
    console.error("Decision records contract shape failed:");
    for (const failure of shapeFailures) console.error(`- ${failure}`);
    process.exit(1);
}

const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const policy = await readRel(contract.policyDocument.path);
includesAll(policy, contract.policyDocument.contains, contract.policyDocument.path);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) failures.push(`${contract.policyDocument.path} contains forbidden marker: ${marker}`);
}

for (const record of contract.records ?? []) {
    const text = await readRel(record.path);
    includesAll(text, record.contains, record.id);
    for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
        if (text.includes(marker)) failures.push(`${record.path} contains forbidden marker: ${marker}`);
    }
    for (const heading of contract.requiredHeadings ?? []) {
        if (!text.includes(`## ${heading}`)) failures.push(`${record.path} missing heading: ${heading}`);
    }
    if (!/^# \d{4}: /m.test(text)) failures.push(`${record.path} title must start with a zero-padded decision number`);
}

if (!makefile.includes(`${contract.wiring.makeTarget}:`)) {
    failures.push(`Makefile missing target: ${contract.wiring.makeTarget}`);
}
if (!makefile.includes("perfect-fast:") || !makefile.includes("decision-records")) {
    failures.push("Makefile perfect-fast/perfect-full wiring missing decision-records");
}
if (!qualityGates.includes("make decision-records")) {
    failures.push("docs/quality-gates.md missing make decision-records");
}
if (!docsIndex.includes("./decision-records-policy.md")) {
    failures.push("docs/README.md missing decision records policy link");
}
if (!docsIndex.includes("./decision-records-contract.json")) {
    failures.push("docs/README.md missing decision records contract link");
}
if (!contractInventory.includes('"id": "decision-records"')) {
    failures.push("docs/contract-inventory.json missing decision-records entry");
}
if (!enterpriseAudit.includes('"id": "decision-records"')) {
    failures.push("docs/enterprise-hardening-audit.json missing decision-records requirement");
}

if (failures.length > 0) {
    console.error("Decision records contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Decision records contract passed (${contract.records.length} records checked).`);
