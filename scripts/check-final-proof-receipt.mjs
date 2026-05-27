#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { budgetFingerprint } from "./budget-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "docs", "final-proof-receipt-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
let failures = [];

function fail(message) {
    failures.push(message);
}

function manifestRelativePath(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
        return path.join("__invalid_manifest_path__", label.replace(/[^A-Za-z0-9_.-]/g, "_"));
    }
    const normalized = path.normalize(value);
    if (path.isAbsolute(value) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label} must be a repo-relative path without parent traversal`);
        return path.join("__invalid_manifest_path__", label.replace(/[^A-Za-z0-9_.-]/g, "_"));
    }
    return normalized;
}

function readJsonFile(label, absolutePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    } catch {
        fail(`${label} could not be read as JSON`);
        return fallback;
    }
}

const receiptPath = path.join(root, manifestRelativePath("manifest.receiptPath", manifest.receiptPath));
const budgetPath = path.join(root, manifestRelativePath("manifest.budgetPath", manifest.budgetPath));
const riskRegisterPath = path.join(root, manifestRelativePath("manifest.riskRegisterPath", manifest.riskRegisterPath));
const manifestTemporaryContextPath = manifestRelativePath(
    "manifest.temporaryContextPath",
    manifest.temporaryContextPath,
);
const manifestTemporaryRemovalPath = manifestRelativePath(
    "manifest.temporaryContextRemoval.pathPattern",
    manifest.temporaryContextRemoval?.pathPattern,
);

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value)) fail(`${label} contains duplicate entry: ${value}`);
        seen.add(value);
    }
}

function assertNonEmptyStrings(label, values) {
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(`${label} contains non-string or empty entry`);
        }
    }
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertNonEmptyArray(label, values) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(`${label} must be a non-empty array`);
    }
}

function asArray(label, values) {
    assertNonEmptyArray(label, values);
    return Array.isArray(values) ? values : [];
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value < 1) {
        fail(`${label} must be a positive integer`);
    }
}

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(`${label} must be a boolean`);
    }
}

function assertTrue(label, value) {
    assertBoolean(label, value);
    if (value !== true) {
        fail(`${label} must be true`);
    }
}

function assertSuccessfulPerformanceReceipt(label, receipt) {
    if (receipt == null || typeof receipt !== "object" || Array.isArray(receipt)) {
        fail(`${label} must be a JSON object`);
        return;
    }
    const measurements = Array.isArray(receipt.measurements) ? receipt.measurements : [];
    const failures = Array.isArray(receipt.failures) ? receipt.failures : [];
    const failedMeasurements = measurements.filter((measurement) => measurement?.ok !== true);
    if (measurements.length === 0) {
        fail(`${label} must contain at least one measurement`);
    }
    if (failures.length > 0) {
        fail(`${label} must not contain receipt failures`);
    }
    if (failedMeasurements.length > 0) {
        fail(`${label} must not contain failed measurement entries`);
    }
}

function readDottedField(object, dottedPath) {
    if (typeof dottedPath !== "string" || dottedPath.trim().length === 0) return undefined;
    return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function assertRegexPatterns(label, values) {
    assertNonEmptyStrings(label, values);
    for (const value of values) {
        if (typeof value !== "string" || value.trim().length === 0) continue;
        try {
            new RegExp(value);
        } catch {
            fail(`${label} contains invalid regex pattern: ${value}`);
        }
    }
}

if (manifest.schemaVersion !== 1) {
    fail("manifest.schemaVersion must be 1");
}
assertNonEmptyString("manifest.temporaryContextPath", manifest.temporaryContextPath);
if (manifestTemporaryContextPath !== manifestTemporaryRemovalPath) {
    fail("manifest.temporaryContextPath must match manifest.temporaryContextRemoval.pathPattern");
}

// Manifest structural validation runs before the final receipt file
// existence check, so a missing receipt cannot hide a malformed contract.
assertNonEmptyString("manifest.budget.field", manifest.budget?.field);
assertNonEmptyString("manifest.budget.requiredReceiptValue", manifest.budget?.requiredReceiptValue);
assertNonEmptyString("manifest.budget.requiredCalibrationStatus", manifest.budget?.requiredCalibrationStatus);
assertNonEmptyString("manifest.budget.section", manifest.budget?.section);
assertNonEmptyString("manifest.budget.latestReceipt.pathSource", manifest.budget?.latestReceipt?.pathSource);
if (manifest.budget?.latestReceipt?.pathSource !== "calibrationPolicy.receiptPath") {
    fail("manifest.budget.latestReceipt.pathSource must be calibrationPolicy.receiptPath");
}
assertTrue("manifest.budget.latestReceipt.mustBeJsonObject", manifest.budget?.latestReceipt?.mustBeJsonObject);
assertTrue("manifest.budget.latestReceipt.requireMeasurements", manifest.budget?.latestReceipt?.requireMeasurements);
assertTrue("manifest.budget.latestReceipt.forbidFailures", manifest.budget?.latestReceipt?.forbidFailures);
assertTrue("manifest.budget.latestReceipt.forbidFailedMeasurements", manifest.budget?.latestReceipt?.forbidFailedMeasurements);
assertNonEmptyString("manifest.budget.latestReceipt.calibrationStatusPath", manifest.budget?.latestReceipt?.calibrationStatusPath);
if (manifest.budget?.latestReceipt?.calibrationStatusPath !== "calibrationPolicy.status") {
    fail("manifest.budget.latestReceipt.calibrationStatusPath must be calibrationPolicy.status");
}
assertTrue(
    "manifest.budget.latestReceipt.mustMatchBudgetRequiredCalibrationStatus",
    manifest.budget?.latestReceipt?.mustMatchBudgetRequiredCalibrationStatus,
);
assertNonEmptyString("manifest.budget.latestReceipt.budgetSchemaVersionField", manifest.budget?.latestReceipt?.budgetSchemaVersionField);
if (manifest.budget?.latestReceipt?.budgetSchemaVersionField !== "budgetsSchemaVersion") {
    fail("manifest.budget.latestReceipt.budgetSchemaVersionField must be budgetsSchemaVersion");
}
assertTrue(
    "manifest.budget.latestReceipt.mustMatchBudgetSchemaVersion",
    manifest.budget?.latestReceipt?.mustMatchBudgetSchemaVersion,
);
assertNonEmptyString("manifest.budget.latestReceipt.budgetFingerprintField", manifest.budget?.latestReceipt?.budgetFingerprintField);
if (manifest.budget?.latestReceipt?.budgetFingerprintField !== "budgetFingerprint") {
    fail("manifest.budget.latestReceipt.budgetFingerprintField must be budgetFingerprint");
}
assertTrue(
    "manifest.budget.latestReceipt.mustMatchBudgetFingerprint",
    manifest.budget?.latestReceipt?.mustMatchBudgetFingerprint,
);
assertNonEmptyString("manifest.liveProof.field", manifest.liveProof?.field);
assertNonEmptyStrings("manifest.liveProof.allowedStatuses", manifest.liveProof?.allowedStatuses ?? []);
assertUnique("manifest.liveProof.allowedStatuses", manifest.liveProof?.allowedStatuses ?? []);
assertNonEmptyString("manifest.liveProof.finalRequiredStatus", manifest.liveProof?.finalRequiredStatus);
if (!(manifest.liveProof?.allowedStatuses ?? []).includes(manifest.liveProof?.finalRequiredStatus)) {
    fail("manifest.liveProof.finalRequiredStatus must be listed in manifest.liveProof.allowedStatuses");
}
assertNonEmptyString("manifest.liveProof.deferralReasonField", manifest.liveProof?.deferralReasonField);
assertPositiveInteger("manifest.liveProof.minDeferralReasonLength", manifest.liveProof?.minDeferralReasonLength);
assertNonEmptyString("manifest.liveProof.sectionStart", manifest.liveProof?.sectionStart);
assertNonEmptyString("manifest.liveProof.sectionEnd", manifest.liveProof?.sectionEnd);
assertNonEmptyString("manifest.liveProof.cleanupReceiptMarker", manifest.liveProof?.cleanupReceiptMarker);
assertNonEmptyString("manifest.temporaryContextRemoval.section", manifest.temporaryContextRemoval?.section);
assertNonEmptyString("manifest.temporaryContextRemoval.removedMarker", manifest.temporaryContextRemoval?.removedMarker);
assertNonEmptyString("manifest.temporaryContextRemoval.pathPattern", manifest.temporaryContextRemoval?.pathPattern);
assertBoolean("manifest.temporaryContextRemoval.mustBeAbsentOnDisk", manifest.temporaryContextRemoval?.mustBeAbsentOnDisk);
assertNonEmptyString("manifest.residualRisk.section", manifest.residualRisk?.section);
assertNonEmptyString("manifest.residualRisk.statusField", manifest.residualRisk?.statusField);
assertNonEmptyStrings("manifest.residualRisk.allowedStatuses", manifest.residualRisk?.allowedStatuses ?? []);
assertUnique("manifest.residualRisk.allowedStatuses", manifest.residualRisk?.allowedStatuses ?? []);
assertNonEmptyString("manifest.residualRisk.finalRequiredStatus", manifest.residualRisk?.finalRequiredStatus);
if (!(manifest.residualRisk?.allowedStatuses ?? []).includes(manifest.residualRisk?.finalRequiredStatus)) {
    fail("manifest.residualRisk.finalRequiredStatus must be listed in manifest.residualRisk.allowedStatuses");
}
assertNonEmptyString("manifest.residualRisk.noneRequiredMarker", manifest.residualRisk?.noneRequiredMarker);
assertNonEmptyArray("manifest.riskRegister.blockingStatuses", manifest.riskRegister?.blockingStatuses);
assertNonEmptyStrings("manifest.riskRegister.blockingStatuses", manifest.riskRegister?.blockingStatuses ?? []);
assertUnique("manifest.riskRegister.blockingStatuses", manifest.riskRegister?.blockingStatuses ?? []);
assertNonEmptyString("manifest.riskRegister.nonBlockingOverrideField", manifest.riskRegister?.nonBlockingOverrideField);
assertNonEmptyArray(
    "manifest.riskRegister.acceptedNonBlockingStatuses",
    manifest.riskRegister?.acceptedNonBlockingStatuses,
);
assertNonEmptyStrings(
    "manifest.riskRegister.acceptedNonBlockingStatuses",
    manifest.riskRegister?.acceptedNonBlockingStatuses ?? [],
);
assertUnique(
    "manifest.riskRegister.acceptedNonBlockingStatuses",
    manifest.riskRegister?.acceptedNonBlockingStatuses ?? [],
);
assertNonEmptyStrings("manifest.forbiddenPlaceholders", manifest.forbiddenPlaceholders ?? []);
assertUnique("manifest.forbiddenPlaceholders", manifest.forbiddenPlaceholders ?? []);
assertNonEmptyStrings(
    "manifest.liveProof.completedCleanupRequiredPrefixes",
    manifest.liveProof?.completedCleanupRequiredPrefixes ?? [],
);
assertUnique(
    "manifest.liveProof.completedCleanupRequiredPrefixes",
    manifest.liveProof?.completedCleanupRequiredPrefixes ?? [],
);
assertNonEmptyStrings(
    "manifest.liveProof.completedSectionForbiddenMarkers",
    manifest.liveProof?.completedSectionForbiddenMarkers ?? [],
);
assertUnique(
    "manifest.liveProof.completedSectionForbiddenMarkers",
    manifest.liveProof?.completedSectionForbiddenMarkers ?? [],
);
assertNonEmptyStrings(
    "manifest.liveProof.completedCleanupForbiddenMarkers",
    manifest.liveProof?.completedCleanupForbiddenMarkers ?? [],
);
assertUnique(
    "manifest.liveProof.completedCleanupForbiddenMarkers",
    manifest.liveProof?.completedCleanupForbiddenMarkers ?? [],
);
assertNonEmptyStrings("manifest.liveProof.deferredRequiredMarkers", manifest.liveProof?.deferredRequiredMarkers ?? []);
assertUnique("manifest.liveProof.deferredRequiredMarkers", manifest.liveProof?.deferredRequiredMarkers ?? []);
assertNonEmptyStrings(
    "manifest.liveProof.deferredCleanupRequiredMarkers",
    manifest.liveProof?.deferredCleanupRequiredMarkers ?? [],
);
assertUnique(
    "manifest.liveProof.deferredCleanupRequiredMarkers",
    manifest.liveProof?.deferredCleanupRequiredMarkers ?? [],
);
assertRegexPatterns("manifest.residualRisk.noneForbiddenPatterns", manifest.residualRisk?.noneForbiddenPatterns ?? []);
assertRegexPatterns(
    "manifest.residualRisk.carriedRequiredPatterns",
    manifest.residualRisk?.carriedRequiredPatterns ?? [],
);
assertNonEmptyStrings("manifest.residualRisk.forbiddenMarkers", manifest.residualRisk?.forbiddenMarkers ?? []);
assertUnique("manifest.residualRisk.forbiddenMarkers", manifest.residualRisk?.forbiddenMarkers ?? []);
assertNonEmptyStrings("manifest.contractInvariants", manifest.contractInvariants ?? []);
assertUnique("manifest.contractInvariants", manifest.contractInvariants ?? []);
assertNonEmptyString("manifest.wiring.makeTarget", manifest.wiring?.makeTarget);
assertNonEmptyString("manifest.wiring.checker", manifest.wiring?.checker);
assertNonEmptyString("manifest.wiring.enterpriseAuditId", manifest.wiring?.enterpriseAuditId);
if (!manifest.contractInvariants?.includes("safe-final-proof-receipt-paths")) {
    fail("manifest.contractInvariants must include safe-final-proof-receipt-paths");
}
if (!manifest.contractInvariants?.includes("typed-required-receipt-contracts")) {
    fail("manifest.contractInvariants must include typed-required-receipt-contracts");
}
if (!manifest.contractInvariants?.includes("makefile-audit-wiring")) {
    fail("manifest.contractInvariants must include makefile-audit-wiring");
}
if (manifest.wiring?.makeTarget !== "final-proof-receipt-check") {
    fail("manifest.wiring.makeTarget must be final-proof-receipt-check");
}
if (manifest.wiring?.checker !== "scripts/check-final-proof-receipt.mjs") {
    fail("manifest.wiring.checker must be scripts/check-final-proof-receipt.mjs");
}

const shapeRequiredSectionList = asArray("manifest.requiredSections", manifest.requiredSections);
const shapeOrderedSectionList = asArray("manifest.orderedSections", manifest.orderedSections);
assertNonEmptyStrings("manifest.requiredSections", shapeRequiredSectionList);
assertNonEmptyStrings("manifest.orderedSections", shapeOrderedSectionList);
assertUnique("manifest.requiredSections", shapeRequiredSectionList);
assertUnique("manifest.orderedSections", shapeOrderedSectionList);
const shapeRequiredSections = new Set(shapeRequiredSectionList);
const shapeOrderedSections = new Set(shapeOrderedSectionList);
for (const section of shapeRequiredSections) {
    if (!shapeOrderedSections.has(section)) {
        fail(`manifest required section is not assigned to orderedSections: ${section}`);
    }
}
for (const section of shapeOrderedSections) {
    if (!shapeRequiredSections.has(section)) {
        fail(`manifest ordered section is not listed in requiredSections: ${section}`);
    }
}

const shapeSuccessSections = asArray("manifest.successSections", manifest.successSections);
assertNonEmptyStrings("manifest.successSections", shapeSuccessSections);
assertUnique("manifest.successSections", shapeSuccessSections);
for (const section of shapeSuccessSections) {
    if (!shapeRequiredSections.has(section)) {
        fail(`manifest success section is not listed in requiredSections: ${section}`);
    }
}

const shapeRequiredCommandList = asArray("manifest.requiredCommands", manifest.requiredCommands);
assertNonEmptyStrings("manifest.requiredCommands", shapeRequiredCommandList);
assertUnique("manifest.requiredCommands", shapeRequiredCommandList);
const shapeRequiredCommands = new Set(shapeRequiredCommandList);
const shapeCommandSections = asArray("manifest.commandSections", manifest.commandSections);
for (const entry of shapeCommandSections) {
    if (typeof entry.section !== "string" || entry.section.trim().length === 0) {
        fail("manifest command section is missing a section name");
    }
    if (!Array.isArray(entry.commands) || entry.commands.length === 0) {
        fail(`manifest command section has no commands: ${entry.section ?? "(missing)"}`);
    }
}
assertUnique(
    "manifest.commandSections[].section",
    shapeCommandSections.map((entry) => entry.section),
);
const shapeCommandSectionCommands = shapeCommandSections.flatMap((entry) => entry.commands ?? []);
assertNonEmptyStrings("manifest.commandSections[].commands", shapeCommandSectionCommands);
assertUnique("manifest.commandSections[].commands", shapeCommandSectionCommands);
for (const entry of shapeCommandSections) {
    if (!shapeRequiredSections.has(entry.section)) {
        fail(`manifest command section is not listed in requiredSections: ${entry.section}`);
    }
}
const shapeSectionScopedCommands = new Set(shapeCommandSections.flatMap((entry) => entry.commands ?? []));
for (const command of shapeRequiredCommands) {
    if (!shapeSectionScopedCommands.has(command)) {
        fail(`manifest required command is not assigned to a command section: ${command}`);
    }
}
for (const command of shapeSectionScopedCommands) {
    if (!shapeRequiredCommands.has(command)) {
        fail(`manifest command section includes command not listed in requiredCommands: ${command}`);
    }
}

if (failures.length > 0) {
    console.error("final proof receipt manifest shape failed");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

failures = [];

if (!fs.existsSync(receiptPath)) {
    fail("docs/final-proof-receipt.md is missing");
} else {
    const text = fs.readFileSync(receiptPath, "utf8");

    for (const placeholder of manifest.forbiddenPlaceholders ?? []) {
        if (text.includes(placeholder)) fail(`receipt still contains placeholder: ${placeholder}`);
    }

    const requiredSectionList = manifest.requiredSections ?? [];
    const orderedSectionList = manifest.orderedSections ?? [];
    assertNonEmptyStrings("manifest.requiredSections", requiredSectionList);
    assertNonEmptyStrings("manifest.orderedSections", orderedSectionList);
    assertUnique("manifest.requiredSections", requiredSectionList);
    assertUnique("manifest.orderedSections", orderedSectionList);
    const requiredSections = new Set(requiredSectionList);
    const orderedSections = new Set(orderedSectionList);
    for (const section of requiredSections) {
        if (!orderedSections.has(section)) {
            fail(`manifest required section is not assigned to orderedSections: ${section}`);
        }
    }
    for (const section of orderedSections) {
        if (!requiredSections.has(section)) {
            fail(`manifest ordered section is not listed in requiredSections: ${section}`);
        }
    }
    const successSections = manifest.successSections ?? [];
    assertNonEmptyStrings("manifest.successSections", successSections);
    assertUnique("manifest.successSections", successSections);
    for (const section of successSections) {
        if (!requiredSections.has(section)) {
            fail(`manifest success section is not listed in requiredSections: ${section}`);
        }
    }

    const requiredCommandList = manifest.requiredCommands ?? [];
    assertNonEmptyStrings("manifest.requiredCommands", requiredCommandList);
    assertUnique("manifest.requiredCommands", requiredCommandList);
    const requiredCommands = new Set(requiredCommandList);
    const commandSections = manifest.commandSections ?? [];
    for (const entry of commandSections) {
        if (typeof entry.section !== "string" || entry.section.trim().length === 0) {
            fail("manifest command section is missing a section name");
        }
        if (!Array.isArray(entry.commands) || entry.commands.length === 0) {
            fail(`manifest command section has no commands: ${entry.section ?? "(missing)"}`);
        }
    }
    assertUnique("manifest.commandSections[].section", commandSections.map((entry) => entry.section));
    const commandSectionCommands = commandSections.flatMap((entry) => entry.commands ?? []);
    assertNonEmptyStrings("manifest.commandSections[].commands", commandSectionCommands);
    assertUnique("manifest.commandSections[].commands", commandSectionCommands);
    for (const entry of commandSections) {
        if (!requiredSections.has(entry.section)) {
            fail(`manifest command section is not listed in requiredSections: ${entry.section}`);
        }
    }
    const sectionScopedCommands = new Set(commandSections.flatMap((entry) => entry.commands ?? []));
    for (const command of requiredCommands) {
        if (!sectionScopedCommands.has(command)) {
            fail(`manifest required command is not assigned to a command section: ${command}`);
        }
    }
    for (const command of sectionScopedCommands) {
        if (!requiredCommands.has(command)) {
            fail(`manifest command section includes command not listed in requiredCommands: ${command}`);
        }
    }

    for (const entry of commandSections) {
        const sectionText = readReceiptSection(text, entry.section);
        if (sectionText.length === 0) {
            fail(`receipt missing command section: ${entry.section}`);
            continue;
        }
        for (const command of entry.commands ?? []) {
            if (!sectionText.includes(command)) {
                fail(`receipt section ${entry.section} missing command: ${command}`);
            }
        }
    }

    for (const section of successSections) {
        const sectionText = readReceiptSection(text, section);
        if (sectionText.length === 0) {
            fail(`receipt missing success section: ${section}`);
        }
        for (const patternSource of manifest.successSectionRequiredPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (!pattern.test(sectionText)) {
                fail(`receipt section is missing required success pattern ${patternSource}: ${section}`);
            }
        }
        for (const patternSource of manifest.successSectionFailureForbiddenPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (pattern.test(sectionText)) {
                fail(`receipt section contains failure pattern ${patternSource}: ${section}`);
            }
        }
    }

    for (const section of manifest.requiredSections ?? []) {
        if (!text.includes(section)) fail(`receipt missing section: ${section}`);
    }

    let previousSectionIndex = -1;
    for (const section of manifest.orderedSections ?? []) {
        const sectionIndex = text.indexOf(section);
        if (sectionIndex === -1) {
            fail(`receipt missing ordered section: ${section}`);
            continue;
        }
        if (sectionIndex < previousSectionIndex) {
            fail(`receipt section is out of order: ${section}`);
        }
        previousSectionIndex = sectionIndex;
    }

    for (const field of manifest.summaryFields ?? []) {
        const line = text.split("\n").find((candidate) => candidate.startsWith(field));
        if (!line || line.trim() === field) fail(`receipt summary field is empty: ${field}`);
    }

    assertRegexPatterns("manifest.successSectionRequiredPatterns", manifest.successSectionRequiredPatterns ?? []);
    assertRegexPatterns(
        "manifest.successSectionFailureForbiddenPatterns",
        manifest.successSectionFailureForbiddenPatterns ?? [],
    );
    assertRegexPatterns("manifest.budget receipt patterns", [
        manifest.budget.receiptHeadingPattern,
        manifest.budget.receiptPassPattern,
        manifest.budget.receiptExitZeroPattern,
        ...(manifest.budget.receiptFailureForbiddenPatterns ?? []),
    ]);
    assertRegexPatterns("manifest.liveProof completed patterns", [
        ...(manifest.liveProof.completedSuccessRequiredPatterns ?? []),
        ...(manifest.liveProof.completedCleanupRequiredPatterns ?? []),
        ...(manifest.liveProof.completedFailureForbiddenPatterns ?? []),
    ]);

    const performanceSection = readReceiptSection(text, manifest.budget.section);
    const budgetStatus = readListField(performanceSection, manifest.budget.field);
    if (budgetStatus == null) {
        fail("receipt missing budget status");
    } else if (budgetStatus !== manifest.budget.requiredReceiptValue) {
        fail(`budget status must be \`${manifest.budget.requiredReceiptValue}\` before final completion`);
    }

    const budgetConfig = readJsonFile("manifest.budgetPath", budgetPath, {});
    if (budgetConfig.calibrationPolicy?.status !== manifest.budget.requiredCalibrationStatus) {
        fail(
            `${manifest.budgetPath} calibrationPolicy.status must be \`${manifest.budget.requiredCalibrationStatus}\` before final completion`,
        );
    }
    const requiredPerformanceRuns = budgetConfig.calibrationPolicy?.requiredSuccessfulRuns;
    if (!Number.isInteger(requiredPerformanceRuns) || requiredPerformanceRuns < 1) {
        fail(`${manifest.budgetPath} calibrationPolicy.requiredSuccessfulRuns must be a positive integer`);
    } else {
        const headingCount = countPattern(performanceSection, manifest.budget.receiptHeadingPattern);
        const passCount = countPattern(performanceSection, manifest.budget.receiptPassPattern);
        const exitZeroCount = countPattern(performanceSection, manifest.budget.receiptExitZeroPattern);
        if (headingCount < requiredPerformanceRuns) {
            fail(`performance section must contain at least ${requiredPerformanceRuns} receipt headings`);
        }
        if (passCount < requiredPerformanceRuns) {
            fail(`performance section must contain at least ${requiredPerformanceRuns} passed receipt results`);
        }
        if (exitZeroCount < requiredPerformanceRuns) {
            fail(`performance section must contain at least ${requiredPerformanceRuns} zero exit statuses`);
        }
    }
    for (const patternSource of manifest.budget.receiptFailureForbiddenPatterns ?? []) {
        const pattern = new RegExp(patternSource, "i");
        if (pattern.test(performanceSection)) {
            fail(`performance section contains failure pattern: ${patternSource}`);
        }
    }
    const latestPerformanceReceiptPath = budgetConfig.calibrationPolicy?.receiptPath;
    assertNonEmptyString("budget.calibrationPolicy.receiptPath", latestPerformanceReceiptPath);
    if (typeof latestPerformanceReceiptPath === "string" && latestPerformanceReceiptPath.trim().length > 0) {
        const latestPerformanceReceipt = readJsonFile(
            "budget.calibrationPolicy.receiptPath",
            path.join(root, manifestRelativePath("budget.calibrationPolicy.receiptPath", latestPerformanceReceiptPath)),
            null,
        );
        assertSuccessfulPerformanceReceipt("latest performance receipt", latestPerformanceReceipt);
        const latestReceiptCalibrationStatus = readDottedField(
            latestPerformanceReceipt,
            manifest.budget.latestReceipt.calibrationStatusPath,
        );
        if (latestReceiptCalibrationStatus !== manifest.budget.requiredCalibrationStatus) {
            fail(
                `latest performance receipt calibrationPolicy.status must be \`${manifest.budget.requiredCalibrationStatus}\` before final completion`,
            );
        }
        const latestReceiptBudgetSchemaVersion = readDottedField(
            latestPerformanceReceipt,
            manifest.budget.latestReceipt.budgetSchemaVersionField,
        );
        if (latestReceiptBudgetSchemaVersion !== budgetConfig.schemaVersion) {
            fail(
                `latest performance receipt budgetsSchemaVersion must match ${manifest.budgetPath} schemaVersion before final completion`,
            );
        }
        const latestReceiptBudgetFingerprint = readDottedField(
            latestPerformanceReceipt,
            manifest.budget.latestReceipt.budgetFingerprintField,
        );
        if (latestReceiptBudgetFingerprint !== budgetFingerprint(budgetConfig)) {
            fail(
                `latest performance receipt budgetFingerprint must match current ${manifest.budgetPath} before final completion`,
            );
        }
    }

    const riskRegister = readJsonFile("manifest.riskRegisterPath", riskRegisterPath, { risks: [] });
    const blockingRiskIds = (riskRegister.risks ?? [])
        .filter((risk) => (manifest.riskRegister.blockingStatuses ?? []).includes(risk.status))
        .filter((risk) => risk[manifest.riskRegister.nonBlockingOverrideField] !== false)
        .map((risk) => risk.id);
    if (blockingRiskIds.length > 0) {
        fail(`risk register has final-readiness blocking risks: ${blockingRiskIds.join(", ")}`);
    }

    const liveSection = readSection(text, manifest.liveProof.sectionStart, manifest.liveProof.sectionEnd);
    const liveProofStatus = readListField(liveSection, manifest.liveProof.field);
    if (liveProofStatus == null) {
        fail("receipt missing live proof status");
    } else if (!manifest.liveProof.allowedStatuses.includes(liveProofStatus)) {
        fail(`live proof status must be one of: ${manifest.liveProof.allowedStatuses.join(", ")}`);
    } else if (liveProofStatus === "completed") {
        const cleanupReceipt = readFirstFencedBlockAfter(liveSection, manifest.liveProof.cleanupReceiptMarker);
        const parsedCleanupReceipt = parseJsonObject(cleanupReceipt);
        if (!liveSection.includes(manifest.liveProof.cleanupReceiptMarker)) {
            fail("live proof is marked completed but no sandbox cleanup receipt marker is present");
        }
        if (cleanupReceipt.length === 0) {
            fail("live proof is marked completed but no fenced sandbox cleanup receipt is present");
        }
        if (parsedCleanupReceipt == null) {
            fail("live proof is marked completed but sandbox cleanup receipt is not valid JSON");
        } else {
            if (!Array.isArray(parsedCleanupReceipt.prefixes)) {
                fail("live proof cleanup receipt JSON must contain a prefixes array");
            }
            if (parsedCleanupReceipt.total !== 0) {
                fail("live proof cleanup receipt JSON must contain numeric total: 0");
            }
            if (
                parsedCleanupReceipt.leftovers == null ||
                Array.isArray(parsedCleanupReceipt.leftovers) ||
                typeof parsedCleanupReceipt.leftovers !== "object"
            ) {
                fail("live proof cleanup receipt JSON must contain a leftovers object");
            }
        }
        if (!/\bmake perfect-live\b/.test(liveSection)) {
            fail("live proof is marked completed but no live proof command is present in the live proof section");
        }
        for (const patternSource of manifest.liveProof.completedSuccessRequiredPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (!pattern.test(liveSection)) {
                fail(`live proof is marked completed but live section is missing required success pattern: ${patternSource}`);
            }
        }
        for (const marker of manifest.liveProof.completedSectionForbiddenMarkers ?? []) {
            if (liveSection.includes(marker)) {
                fail(`live proof is marked completed but live section contains forbidden marker: ${marker}`);
            }
        }
        for (const marker of manifest.liveProof.completedCleanupForbiddenMarkers ?? []) {
            if (cleanupReceipt.includes(marker)) {
                fail(`live proof is marked completed but live cleanup section contains forbidden marker: ${marker}`);
            }
        }
        for (const patternSource of manifest.liveProof.completedCleanupRequiredPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (!pattern.test(cleanupReceipt)) {
                fail(`live proof is marked completed but cleanup receipt is missing pattern: ${patternSource}`);
            }
        }
        for (const prefix of manifest.liveProof.completedCleanupRequiredPrefixes ?? []) {
            if (!cleanupReceipt.includes(prefix)) {
                fail(`live proof is marked completed but cleanup receipt is missing prefix: ${prefix}`);
            }
            if (
                parsedCleanupReceipt != null &&
                Array.isArray(parsedCleanupReceipt.prefixes) &&
                !parsedCleanupReceipt.prefixes.includes(prefix)
            ) {
                fail(`live proof cleanup receipt JSON prefixes array is missing prefix: ${prefix}`);
            }
        }
        for (const patternSource of manifest.liveProof.completedFailureForbiddenPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (pattern.test(liveSection)) {
                fail(`live proof is marked completed but live section contains failure pattern: ${patternSource}`);
            }
        }
    } else if (liveProofStatus === "failed") {
        for (const patternSource of manifest.liveProof.failedRequiredPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (!pattern.test(liveSection)) {
                fail(`live proof is marked failed but live section is missing failure pattern: ${patternSource}`);
            }
        }
    } else if (liveProofStatus === "deferred") {
        const reason = readListField(liveSection, manifest.liveProof.deferralReasonField);
        if (reason == null || reason.length < manifest.liveProof.minDeferralReasonLength) {
            fail("live proof is deferred but Live deferral reason is missing or too short");
        }
        if (!liveSection.includes(manifest.liveProof.cleanupReceiptMarker)) {
            fail("live proof is deferred but no sandbox cleanup receipt marker is present");
        }
        for (const marker of manifest.liveProof.deferredRequiredMarkers ?? []) {
            if (!liveSection.includes(marker)) {
                fail(`live proof is deferred but live section is missing marker: ${marker}`);
            }
        }
        for (const marker of manifest.liveProof.deferredCleanupRequiredMarkers ?? []) {
            if (!liveSection.includes(marker)) {
                fail(`live proof is deferred but live cleanup section is missing marker: ${marker}`);
            }
        }
    }
    if (
        liveProofStatus != null &&
        manifest.liveProof.allowedStatuses.includes(liveProofStatus) &&
        liveProofStatus !== manifest.liveProof.finalRequiredStatus
    ) {
        fail(`live proof status must be ${manifest.liveProof.finalRequiredStatus} before final completion`);
    }

    const temporaryContextPath = manifestTemporaryRemovalPath;
    const temporaryContextSection = readReceiptSection(text, manifest.temporaryContextRemoval.section);
    if (
        manifest.temporaryContextRemoval.mustBeAbsentOnDisk === true &&
        fs.existsSync(path.join(root, temporaryContextPath))
    ) {
        fail(`${temporaryContextPath} still exists on disk`);
    }
    if (
        !temporaryContextSection.includes(manifest.temporaryContextRemoval.removedMarker) ||
        !temporaryContextSection.includes(temporaryContextPath)
    ) {
        fail("temporary context removal section must record the removed temporary context path");
    }
    if (text.replace(temporaryContextSection, "").includes(temporaryContextPath)) {
        fail("temporary context path appears outside the removal receipt section");
    }

    const residualRiskSection = readReceiptSection(text, manifest.residualRisk.section);
    const residualRiskStatus = readListField(residualRiskSection, manifest.residualRisk.statusField);
    if (residualRiskStatus == null) {
        fail("receipt missing residual risk status");
    } else if (!manifest.residualRisk.allowedStatuses.includes(residualRiskStatus)) {
        fail(`residual risk status must be one of: ${manifest.residualRisk.allowedStatuses.join(", ")}`);
    } else if (residualRiskStatus === "none") {
        if (!residualRiskSection.includes(manifest.residualRisk.noneRequiredMarker)) {
            fail(`residual risk status is none but section is missing: ${manifest.residualRisk.noneRequiredMarker}`);
        }
        for (const patternSource of manifest.residualRisk.noneForbiddenPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (pattern.test(residualRiskSection)) {
                fail(`residual risk status is none but section contains carried-risk pattern: ${patternSource}`);
            }
        }
    } else if (residualRiskStatus === "carried") {
        for (const patternSource of manifest.residualRisk.carriedRequiredPatterns ?? []) {
            const pattern = new RegExp(patternSource, "i");
            if (!pattern.test(residualRiskSection)) {
                fail(`residual risk status is carried but section is missing pattern: ${patternSource}`);
            }
        }
    }
    if (
        residualRiskStatus != null &&
        manifest.residualRisk.allowedStatuses.includes(residualRiskStatus) &&
        residualRiskStatus !== manifest.residualRisk.finalRequiredStatus
    ) {
        fail(`residual risk status must be ${manifest.residualRisk.finalRequiredStatus} before final completion`);
    }
    for (const marker of manifest.residualRisk.forbiddenMarkers ?? []) {
        if (residualRiskSection.includes(marker)) {
            fail(`residual risk section contains forbidden marker: ${marker}`);
        }
    }
}

if (failures.length > 0) {
    console.error("final proof receipt check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    printSuggestedNextActions(failures);
    process.exit(1);
}

console.log("final proof receipt is complete");

function printSuggestedNextActions(failures) {
    const suggestions = [];
    const rules = [
        {
            match: /final-proof-receipt\.md is missing/,
            suggestion: "Create docs/final-proof-receipt.md from docs/final-proof-receipt.template.md, or run LIVE=1 make final-proof-draft after proof gates are allowed.",
        },
        {
            match: /placeholder|PASTE|NOT COMPLETE|summary field is empty/i,
            suggestion: "Replace every template or runner placeholder with exact command output and completed summary fields.",
        },
        {
            match: /budget|performance|requiredSuccessfulRuns|calibrationPolicy/i,
            suggestion: "Run the required performance receipts on a built tree, tighten docs/performance-budgets.json to calibrated, and paste successful receipt output.",
        },
        {
            match: /live proof|sandbox cleanup|perfect-live|cleanup receipt|prefixes|leftovers/i,
            suggestion: "Run make perfect-live only against the sacrificial sandbox and paste completed cleanup JSON with prefixes, total: 0, and leftovers.",
        },
        {
            match: /residual risk/i,
            suggestion: "Resolve carried risks before final acceptance; final receipts must end with Residual risk status: none.",
        },
        {
            match: /risk register|blocking risks|open|provisional/i,
            suggestion: "Close open/provisional risk-register entries only through their closure gates before final acceptance.",
        },
        {
            match: /TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL|still exists on disk|temporary context/i,
            suggestion: "Remove docs/TEMP_CONTEXT_REMOVE_AFTER_ENTERPRISE_SDK_GOAL.md only after all receipt evidence is final, then rerun final receipt checking.",
        },
        {
            match: /failure pattern|Result:\\s\*failed|Result: failed|Exit status/i,
            suggestion: "Replace failed command sections with successful rerun output; final receipts cannot contain failed results or non-zero exit statuses.",
        },
        {
            match: /section|command section|out of order/i,
            suggestion: "Use docs/final-proof-receipt.template.md section order and keep each required command in its own required section.",
        },
    ];
    for (const failure of failures) {
        for (const rule of rules) {
            if (rule.match.test(failure)) suggestions.push(rule.suggestion);
        }
    }
    const uniqueSuggestions = [...new Set(suggestions)];
    if (uniqueSuggestions.length === 0) return;
    console.error("");
    console.error("Suggested next actions:");
    for (const suggestion of uniqueSuggestions) console.error(`- ${suggestion}`);
}

function readListField(text, prefix) {
    const line = text.split("\n").find((candidate) => candidate.startsWith(prefix));
    if (!line) return undefined;
    const value = line.slice(prefix.length).trim();
    return value.length > 0 ? value : undefined;
}

function readSection(text, startMarker, endMarker) {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start + startMarker.length);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

function readReceiptSection(text, sectionMarker) {
    const start = text.indexOf(sectionMarker);
    if (start === -1) return "";
    const nextStarts = (manifest.orderedSections ?? [])
        .filter((candidate) => candidate !== sectionMarker)
        .map((candidate) => text.indexOf(candidate, start + sectionMarker.length))
        .filter((index) => index > start)
        .sort((left, right) => left - right);
    const end = nextStarts[0] ?? text.length;
    return text.slice(start, end);
}

function countPattern(text, patternSource) {
    if (!patternSource) return 0;
    return [...text.matchAll(new RegExp(patternSource, "gi"))].length;
}

function readFirstFencedBlockAfter(text, marker) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex === -1) return "";
    const afterMarker = text.slice(markerIndex + marker.length);
    const fenceStart = afterMarker.indexOf("```");
    if (fenceStart === -1) return "";
    const contentStart = afterMarker.indexOf("\n", fenceStart);
    if (contentStart === -1) return "";
    const fenceEnd = afterMarker.indexOf("```", contentStart + 1);
    if (fenceEnd === -1) return "";
    return afterMarker.slice(contentStart + 1, fenceEnd);
}

function parseJsonObject(text) {
    try {
        const parsed = JSON.parse(text.trim());
        if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") return undefined;
        return parsed;
    } catch {
        return undefined;
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
