#!/usr/bin/env node
// check-support-bundle: validates the safe diagnostic bundle contract,
// including prepublishOnly posture and the redaction surface advertised by
// `node scripts/plan.mjs workflow --workflow first-run-support`.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildBundle } from "./create-support-bundle.mjs";

const root = process.cwd();
let failures = [];
const contract = JSON.parse(await readRel("docs/support-bundle-contract.json"));

async function readRel(relPath) {
    const safePath = supportRelativePath(relPath, relPath);
    if (safePath == null) return "";
    return readFile(path.join(root, safePath), "utf8");
}

async function existsRel(relPath) {
    const safePath = supportRelativePath(relPath, relPath);
    if (safePath == null) return false;
    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
    }
}

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function supportRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relPath);
    if (path.isAbsolute(relPath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
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
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

function assertOnlyAllowedFields(value, allowedFields, forbiddenFields, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "is not an object");
        return;
    }
    for (const key of Object.keys(value)) {
        if (!allowedFields.has(key)) fail(label, `unexpected field ${key}`);
    }
    for (const key of forbiddenFields) {
        if (Object.prototype.hasOwnProperty.call(value, key)) fail(label, `forbidden field ${key}`);
    }
}

function assertFalseFields(value, fields, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "is not an object");
        return;
    }
    for (const field of fields ?? []) {
        if (value[field] !== false) {
            fail(label, `${field} must be false`);
        }
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);
    const invariants = assertStringArray("contractInvariants", contract.contractInvariants, {
        allowEmpty: false,
    });
    assertUnique("contractInvariants", invariants);
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-support-bundle-paths",
        "typed-runbook-contract",
        "typed-generator-contract",
        "typed-lockfile-summary-contract",
        "typed-generated-bundle-shape",
        "typed-diagnostics-and-quickstart-summary",
        "typed-supporting-evidence",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("contractInvariants", `missing invariant ${invariant}`);
    }

    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "support-bundle") {
            fail("wiring.makeTarget", `must be support-bundle, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "support-bundle") {
            fail("wiring.enterpriseAuditId", `must be support-bundle, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = supportRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-support-bundle.mjs") {
            fail("wiring.checker", `must be scripts/check-support-bundle.mjs, got ${contract.wiring.checker ?? "(missing)"}`);
        }
    }

    supportRelativePath("runbook.path", contract.runbook?.path);
    assertStringArray("runbook.contains", contract.runbook?.contains, { allowEmpty: false });
    assertStringArray("runbook.forbiddenMarkers", contract.runbook?.forbiddenMarkers ?? []);
    assertUnique("runbook.contains", contract.runbook?.contains ?? []);
    assertUnique("runbook.forbiddenMarkers", contract.runbook?.forbiddenMarkers ?? []);

    if (contract.generator == null || typeof contract.generator !== "object" || Array.isArray(contract.generator)) {
        fail("generator", "must be an object");
    } else {
        supportRelativePath("generator.path", contract.generator.path);
        assertNonEmptyString("generator.command", contract.generator.command);
        assertStringArray("generator.contains", contract.generator.contains, { allowEmpty: false });
        assertStringArray("generator.forbiddenMarkers", contract.generator.forbiddenMarkers ?? []);
        assertUnique("generator.contains", contract.generator.contains ?? []);
        assertUnique("generator.forbiddenMarkers", contract.generator.forbiddenMarkers ?? []);
    }

    for (const field of ["allowedFields", "forbiddenFields"]) {
        const values = assertStringArray(`lockfileSummary.${field}`, contract.lockfileSummary?.[field], {
            allowEmpty: false,
        });
        assertUnique(`lockfileSummary.${field}`, values);
    }

    const shape = contract.generatedBundleShape ?? {};
    if (shape == null || typeof shape !== "object" || Array.isArray(shape)) {
        fail("generatedBundleShape", "must be an object");
    } else {
        if (!Number.isInteger(shape.packageCount) || shape.packageCount < 1) {
            fail("generatedBundleShape.packageCount", "must be a positive integer");
        }
        for (const field of [
            "requiredPackageFields",
            "environmentShapeFalseFields",
            "redactionFalseFields",
            "requiredReadinessContextFields",
            "requiredReadinessReports",
            "requiredDiagnosticSurfaces",
            "requiredSafeCommandHints",
        ]) {
            const values = assertStringArray(`generatedBundleShape.${field}`, shape[field], {
                allowEmpty: false,
            });
            assertUnique(`generatedBundleShape.${field}`, values);
        }
    }

    for (const field of ["requiredTargets", "requiredDocs", "bundleFields"]) {
        const values = assertStringArray(field, contract[field], { allowEmpty: false });
        assertUnique(field, values);
    }
    for (const [index, docPath] of (contract.requiredDocs ?? []).entries()) {
        supportRelativePath(`requiredDocs[${index}]`, docPath);
    }

    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
    }
    assertUnique(
        "supportingEvidence.path",
        (contract.supportingEvidence ?? [])
            .map((evidence) => evidence?.path)
            .filter((evidencePath) => typeof evidencePath === "string"),
    );
    for (const [index, evidence] of (contract.supportingEvidence ?? []).entries()) {
        const label = `supportingEvidence[${index}]`;
        if (evidence == null || typeof evidence !== "object" || Array.isArray(evidence)) {
            fail(label, "must be an object");
            continue;
        }
        supportRelativePath(`${label}.path`, evidence.path);
        const markers = assertStringArray(`${label}.contains`, evidence.contains, { allowEmpty: false });
        assertUnique(`${label}.contains`, markers);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Support bundle contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const runbook = await readRel(contract.runbook.path);
includesAll(runbook, contract.runbook.contains, contract.runbook.path);
for (const marker of contract.runbook.forbiddenMarkers ?? []) {
    if (runbook.includes(marker)) fail(contract.runbook.path, `contains forbidden marker ${marker}`);
}
includesAll(runbook, contract.bundleFields, `${contract.runbook.path} escalation template`);

if (contract.generator) {
    if (!(await existsRel(contract.generator.path))) {
        fail("generator", `missing ${contract.generator.path}`);
    } else {
        const generator = await readRel(contract.generator.path);
        includesAll(generator, contract.generator.contains, contract.generator.path);
        for (const marker of contract.generator.forbiddenMarkers ?? []) {
            if (generator.includes(marker)) {
                fail(contract.generator.path, `contains forbidden generator marker ${marker}`);
            }
        }
        for (const field of contract.lockfileSummary?.allowedFields ?? []) {
            if (!generator.includes(field)) {
                fail(contract.generator.path, `lockfile summary missing allowed field ${field}`);
            }
        }
        for (const field of contract.lockfileSummary?.forbiddenFields ?? []) {
            if (generator.includes(field)) {
                fail(contract.generator.path, `lockfile summary contains forbidden field ${field}`);
            }
        }
    }
    if (contract.generator.command && !runbook.includes(contract.generator.command)) {
        fail(contract.runbook.path, `missing generator command ${contract.generator.command}`);
    }
}

for (const docPath of contract.requiredDocs ?? []) {
    if (!(await existsRel(docPath))) fail("requiredDocs", `missing ${docPath}`);
}

for (const evidence of contract.supportingEvidence ?? []) {
    if (!(await existsRel(evidence.path))) {
        fail("supportingEvidence", `missing ${evidence.path}`);
        continue;
    }
    includesAll(await readRel(evidence.path), evidence.contains, evidence.path);
}

for (const target of contract.requiredTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}

if (!makefile.includes("perfect-fast:") || !makefile.includes("support-bundle")) {
    fail("Makefile", "perfect-fast/perfect-full wiring missing support-bundle");
}
if (!qualityGates.includes("make support-bundle")) {
    fail("docs/quality-gates.md", "missing make support-bundle");
}
if (!docsIndex.includes("./support-runbook.md")) {
    fail("docs/README.md", "missing support runbook link");
}
if (!docsIndex.includes("./support-bundle-contract.json")) {
    fail("docs/README.md", "missing support bundle contract link");
}
if (!contractInventory.includes('"id": "support-bundle"')) {
    fail("docs/contract-inventory.json", "missing support-bundle entry");
}
if (!enterpriseAudit.includes('"id": "support-bundle"')) {
    fail("docs/enterprise-hardening-audit.json", "missing support-bundle audit entry");
}

const generatedBundle = await buildBundle();
const expectedPackageCount = contract.generatedBundleShape?.packageCount ?? 3;
if (generatedBundle.generator?.network !== "none") {
    fail("generated bundle generator", "network must be none");
}
if (!Array.isArray(generatedBundle.generator?.commandsExecuted) || generatedBundle.generator.commandsExecuted.length !== 0) {
    fail("generated bundle generator", "commandsExecuted must be an empty array");
}
assertFalseFields(
    generatedBundle.environmentShape,
    contract.generatedBundleShape?.environmentShapeFalseFields ?? [],
    "generated bundle environmentShape",
);
assertFalseFields(
    generatedBundle.redaction,
    contract.generatedBundleShape?.redactionFalseFields ?? [],
    "generated bundle redaction",
);
if (!generatedBundle.readinessContext || typeof generatedBundle.readinessContext !== "object") {
    fail("generated bundle readinessContext", "must be an object");
} else {
    for (const field of contract.generatedBundleShape?.requiredReadinessContextFields ?? []) {
        if (!Object.prototype.hasOwnProperty.call(generatedBundle.readinessContext, field)) {
            fail("generated bundle readinessContext", `missing field ${field}`);
        }
    }
    if (generatedBundle.readinessContext.network !== "none") {
        fail("generated bundle readinessContext", "network must be none");
    }
    if (
        !Array.isArray(generatedBundle.readinessContext.commandsExecuted) ||
        generatedBundle.readinessContext.commandsExecuted.length !== 0
    ) {
        fail("generated bundle readinessContext", "commandsExecuted must be an empty array");
    }
    for (const reportId of contract.generatedBundleShape?.requiredReadinessReports ?? []) {
        if (!generatedBundle.readinessContext.reportsCaptured?.includes(reportId)) {
            fail("generated bundle readinessContext", `missing captured report ${reportId}`);
        }
    }
    if (typeof generatedBundle.readinessContext.riskStatus?.riskRoutingSummary?.finalReadinessRiskStatus !== "string") {
        fail("generated bundle readinessContext", "riskStatus.riskRoutingSummary.finalReadinessRiskStatus must be a string");
    }
    if (!Array.isArray(generatedBundle.readinessContext.contractInventory?.orderedProofChainCoverage?.entries)) {
        fail("generated bundle readinessContext", "contractInventory.orderedProofChainCoverage.entries must be an array");
    }
}
if (!Array.isArray(generatedBundle.packages)) {
    fail("generated bundle", "packages must be an array");
} else if (generatedBundle.packages.length !== expectedPackageCount) {
    fail("generated bundle", `expected ${expectedPackageCount} packages, got ${generatedBundle.packages.length}`);
}

if (!Array.isArray(generatedBundle.diagnostics)) {
    fail("generated bundle diagnostics", "diagnostics must be an array");
} else {
    for (const surface of contract.generatedBundleShape?.requiredDiagnosticSurfaces ?? []) {
        const diagnostic = generatedBundle.diagnostics.find((entry) => entry?.surface === surface);
        if (!diagnostic) {
            fail("generated bundle diagnostics", `missing diagnostic surface ${surface}`);
            continue;
        }
        if (diagnostic.network !== "none") {
            fail("generated bundle diagnostics", `${surface} diagnostic network must be none`);
        }
        if (typeof diagnostic.entrypoint !== "string" || diagnostic.entrypoint.length === 0) {
            fail("generated bundle diagnostics", `${surface} diagnostic entrypoint must be present`);
        }
    }
}

if (!Array.isArray(generatedBundle.safeCommandHints)) {
    fail("generated bundle safeCommandHints", "safeCommandHints must be an array");
} else {
    for (const hint of contract.generatedBundleShape?.requiredSafeCommandHints ?? []) {
        if (!generatedBundle.safeCommandHints.includes(hint)) {
            fail("generated bundle safeCommandHints", `missing ${hint}`);
        }
    }
}

const requiredPackageFields = contract.generatedBundleShape?.requiredPackageFields ?? [];
const allowedLockfileFields = new Set(contract.lockfileSummary?.allowedFields ?? []);
const forbiddenLockfileFields = new Set(contract.lockfileSummary?.forbiddenFields ?? []);
for (const [index, pkg] of (generatedBundle.packages ?? []).entries()) {
    for (const field of requiredPackageFields) {
        if (!Object.prototype.hasOwnProperty.call(pkg, field)) {
            fail(`generated bundle package ${index}`, `missing field ${field}`);
        }
    }
    assertOnlyAllowedFields(
        pkg.lockfile,
        allowedLockfileFields,
        forbiddenLockfileFields,
        `generated bundle package ${index} lockfile`,
    );
    if (pkg.lockfile?.available === true) {
        if (typeof pkg.lockfile.lockfileVersion !== "number") {
            fail(`generated bundle package ${index} lockfile`, "lockfileVersion must be a number when available");
        }
        if (typeof pkg.lockfile.packageCount !== "number") {
            fail(`generated bundle package ${index} lockfile`, "packageCount must be a number when available");
        }
    }
}

if (failures.length > 0) {
    console.error("Support bundle contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Support bundle contract passed (${contract.bundleFields.length} bundle fields checked).`);
