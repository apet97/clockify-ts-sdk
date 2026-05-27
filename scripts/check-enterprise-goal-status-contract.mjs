#!/usr/bin/env node
// check-enterprise-goal-status-contract: validates the no-network active-goal
// status report contract against the actual enterprise-goal-status output,
// including generatedReport.finalBlockingSignalIds and the no-command posture.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./enterprise-goal-status.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(
    fs.readFileSync(path.join(root, "docs", "enterprise-goal-status-contract.json"), "utf8"),
);
let failures = [];

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function goalStatusRelativePath(label, relativePath) {
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
    const safePath = goalStatusRelativePath(label, relativePath);
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
            fail(label, `${field} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertIds(items, ids, label) {
    const actual = new Set((items ?? []).map((item) => item.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing id ${id}`);
    }
}

function assertCommands(commands, expectedCommands, label) {
    for (const [key, expected] of Object.entries(expectedCommands ?? {})) {
        if (commands?.[key] !== expected) {
            fail(
                label,
                `${key} expected ${JSON.stringify(expected)} but got ${JSON.stringify(commands?.[key])}`,
            );
        }
    }
}

function assertTextMarkers(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing generated marker ${JSON.stringify(marker)}`);
    }
}

function validateGeneratedReportContract(label, generatedReport) {
    if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
        fail(label, "must be an object");
        return;
    }
    if (
        generatedReport.exactFields == null ||
        typeof generatedReport.exactFields !== "object" ||
        Array.isArray(generatedReport.exactFields)
    ) {
        fail(`${label}.exactFields`, "must be an object");
    }
    const signalIds = assertStringArray(`${label}.requiredSignalIds`, generatedReport.requiredSignalIds, {
        allowEmpty: false,
    });
    assertUnique(signalIds, `${label}.requiredSignalIds`);
    const warningMarkers = assertStringArray(`${label}.warningMustContain`, generatedReport.warningMustContain, {
        allowEmpty: false,
    });
    assertUnique(warningMarkers, `${label}.warningMustContain`);
    const remainingMarkers = assertStringArray(`${label}.remainingMustContain`, generatedReport.remainingMustContain, {
        allowEmpty: false,
    });
    assertUnique(remainingMarkers, `${label}.remainingMustContain`);
    const blockingFields = assertStringArray(
        `${label}.requiredFinalBlockingFields`,
        generatedReport.requiredFinalBlockingFields,
        { allowEmpty: false },
    );
    assertUnique(blockingFields, `${label}.requiredFinalBlockingFields`);
    const commandOrder = assertStringArray(
        `${label}.requiredFinalProofCommandOrder`,
        generatedReport.requiredFinalProofCommandOrder,
        { allowEmpty: false },
    );
    assertUnique(commandOrder, `${label}.requiredFinalProofCommandOrder`);
    if (
        generatedReport.requiredFinalProofCommands == null ||
        typeof generatedReport.requiredFinalProofCommands !== "object" ||
        Array.isArray(generatedReport.requiredFinalProofCommands)
    ) {
        fail(`${label}.requiredFinalProofCommands`, "must be an object");
    } else {
        for (const [key, command] of Object.entries(generatedReport.requiredFinalProofCommands)) {
            assertNonEmptyString(`${label}.requiredFinalProofCommands.${key}`, command);
        }
        for (const key of commandOrder) {
            if (!(key in generatedReport.requiredFinalProofCommands)) {
                fail(`${label}.requiredFinalProofCommandOrder`, `unknown command key ${key}`);
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
        "safe-enterprise-goal-status-paths",
        "typed-status-script-contract",
        "typed-generated-report-contract",
        "typed-doc-marker-contracts",
        "makefile-audit-wiring",
    ]) {
        if (!contractInvariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "enterprise-goal-status-contract") {
            fail("wiring.makeTarget", `must be enterprise-goal-status-contract, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "enterprise-goal-status-contract") {
            fail("wiring.enterpriseAuditId", `must be enterprise-goal-status-contract, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = goalStatusRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-enterprise-goal-status-contract.mjs") {
            fail(
                "wiring.checker",
                `must be scripts/check-enterprise-goal-status-contract.mjs, got ${contract.wiring.checker ?? "(missing)"}`,
            );
        }
    }

    goalStatusRelativePath("statusScript.path", contract.statusScript?.path);
    for (const field of ["formatModes", "mustContain", "mustNotContain"]) {
        const values = assertStringArray(`statusScript.${field}`, contract.statusScript?.[field], {
            allowEmpty: field === "mustNotContain",
        });
        assertUnique(values, `statusScript.${field}`);
    }

    goalStatusRelativePath("makefile.path", contract.makefile?.path);
    assertNonEmptyString("makefile.target", contract.makefile?.target);
    const makefileMarkers = assertStringArray("makefile.mustContain", contract.makefile?.mustContain, {
        allowEmpty: false,
    });
    assertUnique(makefileMarkers, "makefile.mustContain");

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
        goalStatusRelativePath(`${label}.path`, doc.path);
        const markers = assertStringArray(`${label}.mustContain`, doc.mustContain, { allowEmpty: false });
        assertUnique(markers, `${label}.mustContain`);
    }
    validateGeneratedReportContract("generatedReport", contract.generatedReport);
}

validateContractShape();

if (failures.length > 0) {
    console.error("Enterprise goal status contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const statusScript = readRelative(contract.statusScript.path, "statusScript.path");
includesAll(statusScript, contract.statusScript.mustContain, contract.statusScript.path);
excludesAll(statusScript, contract.statusScript.mustNotContain, contract.statusScript.path);
for (const format of contract.statusScript.formatModes ?? []) {
    if (!statusScript.includes(`"${format}"`)) {
        fail(contract.statusScript.path, `missing format mode ${format}`);
    }
}
includesAll(readRelative(contract.makefile.path, "makefile.path"), contract.makefile.mustContain, contract.makefile.path);

for (const doc of contract.docs ?? []) {
    includesAll(readRelative(doc.path, doc.path), doc.mustContain, doc.path);
}

const generatedReport = await buildReport();
const generatedContract = contract.generatedReport ?? {};
assertExactFields(generatedReport, generatedContract.exactFields, "generatedReport");
assertIds(generatedReport.signals, generatedContract.requiredSignalIds, "generatedReport.signals");
assertCommands(
    generatedReport.finalProofCommands,
    generatedContract.requiredFinalProofCommands,
    "generatedReport.finalProofCommands",
);
if (
    JSON.stringify(generatedReport.finalProofCommandOrder) !==
    JSON.stringify(generatedContract.requiredFinalProofCommandOrder)
) {
    fail(
        "generatedReport.finalProofCommandOrder",
        `expected ${JSON.stringify(generatedContract.requiredFinalProofCommandOrder)} but got ${JSON.stringify(generatedReport.finalProofCommandOrder)}`,
    );
}
assertTextMarkers(generatedReport.warning ?? "", generatedContract.warningMustContain, "generatedReport.warning");
assertTextMarkers(
    (generatedReport.remaining ?? []).join("\n"),
    generatedContract.remainingMustContain,
    "generatedReport.remaining",
);
for (const field of generatedContract.requiredFinalBlockingFields ?? []) {
    if (!Array.isArray(generatedReport[field])) {
        fail("generatedReport", `${field} must be an array`);
    }
}

if (failures.length > 0) {
    console.error("Enterprise goal status contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Enterprise goal status contract passed");
