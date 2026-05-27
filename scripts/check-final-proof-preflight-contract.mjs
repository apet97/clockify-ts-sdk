#!/usr/bin/env node
// check-final-proof-preflight-contract: validates the no-network final-proof
// preflight contract. The axiomsContract evidence and axioms-contract gate are
// required, along with blockingSignalIds and finalBlockingSignalIds in the
// generated reports.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport as buildEnterpriseGoalStatusReport } from "./enterprise-goal-status.mjs";
import { buildReport as buildReleaseReadinessReport } from "./release-readiness-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "final-proof-preflight-contract.json"), "utf8"),
);
let failures = [];

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function preflightRelativePath(label, relativePath) {
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

function assertUnique(items, label) {
    const seen = new Set();
    for (const item of items ?? []) {
        if (seen.has(item)) fail(label, `duplicate ${item}`);
        seen.add(item);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = preflightRelativePath(label, relativePath);
    if (safePath == null) return "";
    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
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

function assertExactFields(report, fields, label) {
    for (const [field, expected] of Object.entries(fields ?? {})) {
        const actual = report[field];
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            fail(
                label,
                `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`,
            );
        }
    }
}

function assertIds(items, ids, label) {
    const actual = new Set((items ?? []).map((item) => item.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing id ${id}`);
    }
}

function assertOrderedArrays(report, orderedArrays, label) {
    for (const [field, expected] of Object.entries(orderedArrays ?? {})) {
        if (JSON.stringify(report[field]) !== JSON.stringify(expected)) {
            fail(label, `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(report[field])}`);
        }
    }
}

function makeTargetBlock(makefile, target) {
    const lines = makefile.split("\n");
    const start = lines.findIndex((line) => line === `${target}:`);
    if (start === -1) {
        fail("Makefile", `missing target ${target}`);
        return "";
    }
    const block = [];
    for (let index = start; index < lines.length; index += 1) {
        const line = lines[index];
        if (index !== start && /^[A-Za-z0-9_.-]+:/.test(line)) break;
        block.push(line);
    }
    return block.join("\n");
}

function validateGeneratedReportContract(label, generatedContract) {
    if (generatedContract == null || typeof generatedContract !== "object" || Array.isArray(generatedContract)) {
        fail(label, "must be an object");
        return;
    }
    assertNonEmptyString(`${label}.id`, generatedContract.id);
    if (
        generatedContract.exactFields == null ||
        typeof generatedContract.exactFields !== "object" ||
        Array.isArray(generatedContract.exactFields)
    ) {
        fail(`${label}.exactFields`, "must be an object");
    }
    const signalIds = assertStringArray(`${label}.requiredSignalIds`, generatedContract.requiredSignalIds, {
        allowEmpty: false,
    });
    assertUnique(signalIds, `${label}.requiredSignalIds`);
    const blockingFields = assertStringArray(
        `${label}.requiredBlockingFields`,
        generatedContract.requiredBlockingFields,
        { allowEmpty: false },
    );
    assertUnique(blockingFields, `${label}.requiredBlockingFields`);
    if (generatedContract.requiredOrderedArrays != null) {
        if (
            typeof generatedContract.requiredOrderedArrays !== "object" ||
            Array.isArray(generatedContract.requiredOrderedArrays)
        ) {
            fail(`${label}.requiredOrderedArrays`, "must be an object");
        } else {
            for (const [field, expected] of Object.entries(generatedContract.requiredOrderedArrays)) {
                const values = assertStringArray(`${label}.requiredOrderedArrays.${field}`, expected, {
                    allowEmpty: false,
                });
                assertUnique(values, `${label}.requiredOrderedArrays.${field}`);
            }
        }
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);
    const contractInvariants = assertStringArray("contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique(contractInvariants, "contractInvariants");
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-final-proof-preflight-paths",
        "typed-makefile-contract",
        "typed-doc-marker-contracts",
        "typed-generated-report-contracts",
        "typed-runner-and-support-contracts",
        "makefile-audit-wiring",
    ]) {
        if (!contractInvariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "final-proof-preflight-contract") {
            fail("wiring.makeTarget", `must be final-proof-preflight-contract, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "final-proof-preflight-contract") {
            fail("wiring.enterpriseAuditId", `must be final-proof-preflight-contract, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = preflightRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-final-proof-preflight-contract.mjs") {
            fail(
                "wiring.checker",
                `must be scripts/check-final-proof-preflight-contract.mjs, got ${contract.wiring.checker ?? "(missing)"}`,
            );
        }
    }

    preflightRelativePath("makefile.path", contract.makefile?.path);
    assertNonEmptyString("makefile.target", contract.makefile?.target);
    assertNonEmptyString("makefile.contractTarget", contract.makefile?.contractTarget);
    for (const field of ["requiredCommands", "forbiddenInTarget"]) {
        const values = assertStringArray(`makefile.${field}`, contract.makefile?.[field], { allowEmpty: false });
        assertUnique(values, `makefile.${field}`);
    }

    if (!Array.isArray(contract.docs) || contract.docs.length === 0) {
        fail("docs", "must be a non-empty array");
    }
    assertUnique(
        (contract.docs ?? []).map((doc) => doc?.path).filter((docPath) => typeof docPath === "string"),
        "docs.path",
    );
    for (const [index, doc] of (contract.docs ?? []).entries()) {
        const label = `docs[${index}]`;
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail(label, "must be an object");
            continue;
        }
        preflightRelativePath(`${label}.path`, doc.path);
        const markers = assertStringArray(`${label}.mustContain`, doc.mustContain, { allowEmpty: false });
        assertUnique(markers, `${label}.mustContain`);
    }

    if (contract.runner == null || typeof contract.runner !== "object" || Array.isArray(contract.runner)) {
        fail("runner", "must be an object");
    } else {
        preflightRelativePath("runner.path", contract.runner.path);
        const markers = assertStringArray("runner.mustContain", contract.runner.mustContain, { allowEmpty: false });
        assertUnique(markers, "runner.mustContain");
    }

    if (!Array.isArray(contract.supportingContracts) || contract.supportingContracts.length === 0) {
        fail("supportingContracts", "must be a non-empty array");
    }
    assertUnique(
        (contract.supportingContracts ?? [])
            .map((item) => item?.path)
            .filter((supportingPath) => typeof supportingPath === "string"),
        "supportingContracts.path",
    );
    for (const [index, item] of (contract.supportingContracts ?? []).entries()) {
        const label = `supportingContracts[${index}]`;
        if (item == null || typeof item !== "object" || Array.isArray(item)) {
            fail(label, "must be an object");
            continue;
        }
        preflightRelativePath(`${label}.path`, item.path);
        const markers = assertStringArray(`${label}.mustContain`, item.mustContain, { allowEmpty: false });
        assertUnique(markers, `${label}.mustContain`);
    }

    if (!Array.isArray(contract.generatedReports) || contract.generatedReports.length === 0) {
        fail("generatedReports", "must be a non-empty array");
    }
    assertUnique(
        (contract.generatedReports ?? [])
            .map((generatedContract) => generatedContract?.id)
            .filter((id) => typeof id === "string"),
        "generatedReports.id",
    );
    for (const [index, generatedContract] of (contract.generatedReports ?? []).entries()) {
        validateGeneratedReportContract(`generatedReports[${index}]`, generatedContract);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Final proof preflight contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = readRelative(contract.makefile.path, "makefile.path");
includesAll(makefile, [`${contract.makefile.contractTarget}:`], contract.makefile.path);

const preflightBlock = makeTargetBlock(makefile, contract.makefile.target);
includesAll(preflightBlock, contract.makefile.requiredCommands, contract.makefile.target);
excludesAll(preflightBlock, contract.makefile.forbiddenInTarget, contract.makefile.target);

for (const doc of contract.docs ?? []) {
    includesAll(readRelative(doc.path, doc.path), doc.mustContain, doc.path);
}

if (contract.runner) {
    includesAll(readRelative(contract.runner.path, "runner.path"), contract.runner.mustContain, contract.runner.path);
}

for (const item of contract.supportingContracts ?? []) {
    includesAll(readRelative(item.path, item.path), item.mustContain, item.path);
}

const generatedReports = {
    "enterprise-goal-status": await buildEnterpriseGoalStatusReport(),
    "release-readiness-report": await buildReleaseReadinessReport(),
};
for (const generatedContract of contract.generatedReports ?? []) {
    const report = generatedReports[generatedContract.id];
    if (!report) {
        fail("generatedReports", `unknown report id ${generatedContract.id}`);
        continue;
    }
    assertExactFields(report, generatedContract.exactFields, `${generatedContract.id}.generatedReport`);
    assertIds(report.signals, generatedContract.requiredSignalIds, `${generatedContract.id}.signals`);
    assertOrderedArrays(
        report,
        generatedContract.requiredOrderedArrays,
        `${generatedContract.id}.generatedReport`,
    );
    for (const field of generatedContract.requiredBlockingFields ?? []) {
        if (!Array.isArray(report[field])) {
            fail(`${generatedContract.id}.generatedReport`, `${field} must be an array`);
        }
    }
}

if (failures.length > 0) {
    console.error("Final proof preflight contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Final proof preflight contract passed");
