#!/usr/bin/env node
// check-risk-register: validates docs/risk-register.json shape, evidence,
// reportGenerator.generatedReport.requiredRiskIds, and the no-network shape of
// the risk-status-report so final acceptance trusts the risk surface.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "./risk-status-report.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registerPath = path.join(root, "docs", "risk-register.json");
const markdownPath = path.join(root, "docs", "risk-register.md");
const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
let failures = [];

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function riskRelativePath(label, relativePath) {
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

function assertNonEmptyArray(label, values) {
    if (!Array.isArray(values) || values.length === 0) {
        fail(label, "must be a non-empty array");
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
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
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

function assertKeys(object, keys, label) {
    for (const key of keys ?? []) {
        if (!Object.prototype.hasOwnProperty.call(object ?? {}, key)) {
            fail(label, `missing key ${key}`);
        }
    }
}

function assertNonEmptyDetailValues(object, keys, label) {
    for (const key of keys ?? []) {
        const value = object?.[key];
        if (typeof value !== "string" || value.trim().length === 0) {
            fail(label, `${key} must be a non-empty detail string`);
        }
    }
}

function assertRiskIds(risks, ids, label) {
    const actual = new Set((risks ?? []).map((risk) => risk.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing risk ${id}`);
    }
}

function assertExactArray(actualItems, expectedItems, label) {
    const actual = [...(actualItems ?? [])].sort();
    const expected = [...(expectedItems ?? [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(label, `expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}

function validateReportGeneratorShape() {
    if (register.reportGenerator == null || typeof register.reportGenerator !== "object" || Array.isArray(register.reportGenerator)) {
        fail("reportGenerator", "must be an object");
        return;
    }
    riskRelativePath("reportGenerator.path", register.reportGenerator.path);
    assertNonEmptyString("reportGenerator.makeTarget", register.reportGenerator.makeTarget);
    const markers = assertStringArray("reportGenerator.contains", register.reportGenerator.contains, {
        allowEmpty: false,
    });
    assertUnique("reportGenerator.contains", markers);

    const generatedReport = register.reportGenerator.generatedReport;
    if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
        fail("reportGenerator.generatedReport", "must be an object");
        return;
    }
    if (
        generatedReport.exactFields == null ||
        typeof generatedReport.exactFields !== "object" ||
        Array.isArray(generatedReport.exactFields)
    ) {
        fail("reportGenerator.generatedReport.exactFields", "must be an object");
    }
    for (const field of [
        "requiredCountKeys",
        "requiredFileSignalKeys",
        "requiredFileSignalDetailKeys",
        "requiredRiskIds",
        "requiredReadinessBlockingRiskIds",
        "requiredNonBlockingOpenOrProvisionalRiskIds",
        "requiredRiskRoutingSummaryKeys",
    ]) {
        const values = assertStringArray(`reportGenerator.generatedReport.${field}`, generatedReport[field], {
            allowEmpty: field !== "requiredNonBlockingOpenOrProvisionalRiskIds",
        });
        assertUnique(`reportGenerator.generatedReport.${field}`, values);
    }
    if (generatedReport.requiredFileSignalDetailKeysAreNonEmpty !== true) {
        fail("reportGenerator.generatedReport.requiredFileSignalDetailKeysAreNonEmpty", "must be true");
    }
}

function validateRegisterShape() {
    if (register.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", register.purpose);
    const invariants = assertStringArray("contractInvariants", register.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "typed-risk-entries",
        "safe-risk-evidence-paths",
        "typed-risk-report-generator",
        "typed-generated-risk-report-contract",
        "typed-allowed-risk-statuses",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    const allowedStatuses = assertStringArray("allowedStatuses", register.allowedStatuses, { allowEmpty: false });
    assertUnique("allowedStatuses", allowedStatuses);
    for (const requiredStatus of ["open", "provisional", "blocked-upstream", "accepted"]) {
        if (!allowedStatuses.includes(requiredStatus)) fail("allowedStatuses", `missing ${requiredStatus}`);
    }

    if (register.wiring == null || typeof register.wiring !== "object" || Array.isArray(register.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (register.wiring.makeTarget !== "risk-register") {
            fail("wiring.makeTarget", `must be risk-register, got ${register.wiring.makeTarget ?? "(missing)"}`);
        }
        if (register.wiring.enterpriseAuditId !== "risk-register") {
            fail("wiring.enterpriseAuditId", `must be risk-register, got ${register.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = riskRelativePath("wiring.checker", register.wiring.checker);
        if (checker !== "scripts/check-risk-register.mjs") {
            fail("wiring.checker", `must be scripts/check-risk-register.mjs, got ${register.wiring.checker ?? "(missing)"}`);
        }
    }

    validateReportGeneratorShape();
    assertNonEmptyArray("risks", register.risks);
    assertUnique(
        "risks.id",
        (register.risks ?? []).map((risk) => risk?.id).filter((id) => typeof id === "string"),
    );
    for (const [index, risk] of (register.risks ?? []).entries()) {
        const id = risk?.id ?? `risks[${index}]`;
        if (risk == null || typeof risk !== "object" || Array.isArray(risk)) {
            fail(id, "risk entry must be an object");
            continue;
        }
        if (
            Object.prototype.hasOwnProperty.call(risk, "finalReadinessBlocking") &&
            typeof risk.finalReadinessBlocking !== "boolean"
        ) {
            fail(id, "finalReadinessBlocking must be boolean when present");
        }
        assertNonEmptyArray(`${id}.evidence`, risk.evidence);
        for (const [evidenceIndex, evidence] of (risk.evidence ?? []).entries()) {
            const label = `${id}.evidence[${evidenceIndex}]`;
            if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
                fail(label, "must be an object");
                continue;
            }
            riskRelativePath(`${label}.path`, evidence.path);
            assertNonEmptyString(`${label}.contains`, evidence.contains);
        }
    }
}

validateRegisterShape();

if (failures.length > 0) {
    console.error("risk register contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const markdown = fs.readFileSync(markdownPath, "utf8");
const allowedStatuses = new Set(register.allowedStatuses);

for (const risk of register.risks ?? []) {
    const id = risk.id ?? "unknown";
    for (const field of ["id", "status", "surface", "summary", "impact", "mitigation", "closureGate"]) {
        if (typeof risk[field] !== "string" || risk[field].trim().length === 0) {
            fail(id, `missing ${field}`);
        }
    }

    if (!allowedStatuses.has(risk.status)) {
        fail(id, `invalid status ${JSON.stringify(risk.status)}`);
    }
    if (
        Object.prototype.hasOwnProperty.call(risk, "finalReadinessBlocking") &&
        typeof risk.finalReadinessBlocking !== "boolean"
    ) {
        fail(id, "finalReadinessBlocking must be boolean when present");
    }

    if (!markdown.includes(`\`${id}\``)) {
        fail(id, "docs/risk-register.md missing risk id");
    }
    if (!markdown.includes(risk.closureGate)) {
        fail(id, "docs/risk-register.md missing closure gate");
    }

    if (!Array.isArray(risk.evidence) || risk.evidence.length === 0) {
        fail(id, "missing evidence");
        continue;
    }

    for (const evidence of risk.evidence) {
        if (typeof evidence.path !== "string" || evidence.path.length === 0) {
            fail(id, "evidence missing path");
            continue;
        }
        const safeEvidencePath = riskRelativePath(`${id}.evidence.path`, evidence.path);
        if (safeEvidencePath == null) continue;
        const absolutePath = path.join(root, safeEvidencePath);
        if (!fs.existsSync(absolutePath)) {
            fail(id, `evidence path missing: ${evidence.path}`);
            continue;
        }
        const text = fs.readFileSync(absolutePath, "utf8");
        if (typeof evidence.contains === "string" && !text.includes(evidence.contains)) {
            fail(id, `${evidence.path} missing marker ${JSON.stringify(evidence.contains)}`);
        }
    }
}

const ids = (register.risks ?? []).map((risk) => risk.id);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
for (const id of new Set(duplicateIds)) {
    fail(id, "duplicate risk id");
}

if (register.reportGenerator) {
    const generatorPath = path.join(root, register.reportGenerator.path);
    if (!fs.existsSync(generatorPath)) {
        fail("reportGenerator", `missing ${register.reportGenerator.path}`);
    } else {
        const generator = fs.readFileSync(generatorPath, "utf8");
        for (const marker of register.reportGenerator.contains ?? []) {
            if (!generator.includes(marker)) fail("reportGenerator", `missing marker ${marker}`);
        }
    }
    if (!markdown.includes("node scripts/plan.mjs risk-status")) {
        fail("docs/risk-register.md", "missing risk status report command");
    }

    const generatedReport = await buildReport({ status: "all" });
    const generatedContract = register.reportGenerator.generatedReport ?? {};
    assertExactFields(generatedReport, generatedContract.exactFields, "reportGenerator.generatedReport");
    assertKeys(generatedReport.counts, generatedContract.requiredCountKeys, "reportGenerator.generatedReport.counts");
    assertKeys(
        generatedReport.fileSignals,
        generatedContract.requiredFileSignalKeys,
        "reportGenerator.generatedReport.fileSignals",
    );
    assertKeys(
        generatedReport.fileSignalDetails,
        generatedContract.requiredFileSignalDetailKeys,
        "reportGenerator.generatedReport.fileSignalDetails",
    );
    assertKeys(
        generatedReport.riskRoutingSummary,
        generatedContract.requiredRiskRoutingSummaryKeys,
        "reportGenerator.generatedReport.riskRoutingSummary",
    );
    assertNonEmptyDetailValues(
        generatedReport.fileSignalDetails,
        generatedContract.requiredFileSignalDetailKeys,
        "reportGenerator.generatedReport.fileSignalDetails",
    );
    assertRiskIds(generatedReport.risks, generatedContract.requiredRiskIds, "reportGenerator.generatedReport.risks");
    assertExactArray(
        generatedReport.readinessBlockingRiskIds,
        generatedContract.requiredReadinessBlockingRiskIds,
        "reportGenerator.generatedReport.readinessBlockingRiskIds",
    );
    assertExactArray(
        generatedReport.nonBlockingOpenOrProvisionalRiskIds,
        generatedContract.requiredNonBlockingOpenOrProvisionalRiskIds,
        "reportGenerator.generatedReport.nonBlockingOpenOrProvisionalRiskIds",
    );
}

const makefile = fs.readFileSync(path.join(root, "Makefile"), "utf8");
if (!makefile.includes("risk-register:")) fail("makefile", "missing risk-register target");
if (register.reportGenerator?.makeTarget && !makefile.includes(`${register.reportGenerator.makeTarget}:`)) {
    fail("makefile", `missing ${register.reportGenerator.makeTarget} target`);
}

const docsIndex = fs.readFileSync(path.join(root, "docs", "README.md"), "utf8");
for (const requiredDoc of ["risk-register.json", "risk-register.md"]) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs-index", `missing ${requiredDoc}`);
}

if (failures.length > 0) {
    console.error("risk register check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`risk register passed (${ids.length} risks)`);
