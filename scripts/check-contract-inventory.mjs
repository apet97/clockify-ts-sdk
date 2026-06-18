#!/usr/bin/env node
// check-contract-inventory: validates docs/contract-inventory.json against
// reportGenerator.generatedReport.requiredInventoryInvariants so each contract
// doc, checker script, Make target, and audit ID stays wired together.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { buildReport } from "./contract-inventory-report.mjs";

const root = process.cwd();
const failures = [];
const inventory = JSON.parse(await readRel("docs/contract-inventory.json", "inventoryPath"));
let makefile = "";
let docsIndex = "";
let qualityGates = "";
let audit = "";
let perfectFast = "";
let perfectFull = "";

async function readRel(relPath, label = relPath) {
    const safePath = inventoryRelativePath(label, relPath);
    if (safePath == null) return "";
    return readFile(path.join(root, safePath), "utf8");
}

async function existsRel(relPath, label = relPath) {
    const safePath = inventoryRelativePath(label, relPath);
    if (safePath == null) return false;
    try {
        await stat(path.join(root, safePath));
        return true;
    } catch {
        return false;
    }
}

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function inventoryRelativePath(label, relPath) {
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

function assertNonEmptyString(value, label) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertStringArray(values, label, { allowEmpty = true } = {}) {
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

function assertOptionalBoolean(value, label) {
    if (value != null && typeof value !== "boolean") {
        fail(label, "must be a boolean when present");
    }
}

function targetLine(target) {
    return makefile.split("\n").find((line) => line.startsWith(`${target}:`)) ?? "";
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

function assertMinimumCounts(counts, minimumCounts, label) {
    for (const [field, expectedMinimum] of Object.entries(minimumCounts ?? {})) {
        const actual = counts?.[field];
        if (typeof actual !== "number" || actual < expectedMinimum) {
            fail(label, `${field} expected at least ${expectedMinimum} but got ${JSON.stringify(actual)}`);
        }
    }
}

function assertEntryIds(entries, ids, label) {
    const actual = new Set((entries ?? []).map((entry) => entry.id));
    for (const id of ids ?? []) {
        if (!actual.has(id)) fail(label, `missing report entry ${id}`);
    }
}

function assertArrayContains(actualItems, expectedItems, label) {
    const actual = new Set(actualItems ?? []);
    for (const expected of expectedItems ?? []) {
        if (!actual.has(expected)) fail(label, `missing ${expected}`);
    }
}

function assertExactArray(actualItems, expectedItems, label) {
    const actual = [...(actualItems ?? [])].sort();
    const expected = [...(expectedItems ?? [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(label, `expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
}

function assertUnique(items, label) {
    const seen = new Set();
    for (const item of items ?? []) {
        if (seen.has(item)) fail(label, `duplicate ${item}`);
        seen.add(item);
    }
}

function validateInventoryShape() {
    if (inventory.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString(inventory.purpose, "purpose");

    const invariants = assertStringArray(inventory.inventoryInvariants, "inventoryInvariants", {
        allowEmpty: false,
    });
    assertUnique(invariants, "inventoryInvariants");
    for (const invariant of [
        "valid-schema-version",
        "valid-purpose",
        "safe-inventory-paths",
        "typed-entry-lists",
        "typed-report-generator-config",
        "unique-entry-ids",
        "unique-entry-targets",
        "unique-entry-reports",
        "unique-entry-policies",
        "unique-entry-contracts",
        "unique-entry-audit-ids",
        "unique-report-generator-markers",
        "unique-report-generator-required-entry-ids",
        "unique-report-generator-required-toolbox-helper-scripts",
        "makefile-audit-wiring",
    ]) {
        if (!invariants.includes(invariant)) fail("inventoryInvariants", `missing invariant ${invariant}`);
    }

    if (inventory.wiring == null || typeof inventory.wiring !== "object" || Array.isArray(inventory.wiring)) {
        fail("wiring", "must be an object");
    } else {
        assertNonEmptyString(inventory.wiring.makeTarget, "wiring.makeTarget");
        assertNonEmptyString(inventory.wiring.checker, "wiring.checker");
        assertNonEmptyString(inventory.wiring.enterpriseAuditId, "wiring.enterpriseAuditId");
        if (inventory.wiring.makeTarget !== "contract-inventory") {
            fail("wiring.makeTarget", "must be contract-inventory");
        }
        if (inventory.wiring.checker !== "scripts/check-contract-inventory.mjs") {
            fail("wiring.checker", "must be scripts/check-contract-inventory.mjs");
        }
    }

    if (inventory.reportGenerator == null || typeof inventory.reportGenerator !== "object") {
        fail("reportGenerator", "must be an object");
    } else {
        inventoryRelativePath("reportGenerator.path", inventory.reportGenerator.path);
        assertNonEmptyString(inventory.reportGenerator.makeTarget, "reportGenerator.makeTarget");
        const markers = assertStringArray(inventory.reportGenerator.contains, "reportGenerator.contains", {
            allowEmpty: false,
        });
        assertUnique(markers, "reportGenerator.contains");
        const generatedReport = inventory.reportGenerator.generatedReport ?? {};
        if (generatedReport == null || typeof generatedReport !== "object" || Array.isArray(generatedReport)) {
            fail("reportGenerator.generatedReport", "must be an object");
        }
        for (const field of [
            "requiredEntryIds",
            "requiredUnlistedRequiredDocs",
            "requiredMissingDocsIndexLinks",
            "requiredMissingQualityGateTargets",
            "requiredToolboxHelperScripts",
            "requiredMissingToolboxHelperOwners",
            "requiredMissingToolboxHelperCommands",
            "requiredExtraToolboxHelperCommands",
            "requiredDuplicateToolboxHelperCommands",
            "requiredInventoryInvariants",
            "requiredDuplicateEntryIds",
            "requiredDuplicateEntryTargets",
            "requiredDuplicateReportGeneratorMarkers",
            "requiredDuplicateRequiredEntryIds",
            "requiredDuplicateRequiredToolboxHelperScripts",
            "requiredEntryDuplicateLists",
            "requiredOrderedProofChainEntries",
            "requiredMissingOrderedProofChainEntries",
            "requiredStructuralInvariants",
            "requiredInventoryShapeSchemaIssues",
            "requiredInventoryShapeUnsafePaths",
            "requiredInventoryShapeTypedListIssues",
            "requiredInventoryShapeBooleanIssues",
            "requiredInventoryShapeMinimumCountIssues",
            "requiredInventoryShapeInvalidEntryShapes",
        ]) {
            const values = assertStringArray(
                generatedReport[field] ?? [],
                `reportGenerator.generatedReport.${field}`,
            );
            assertUnique(values, `reportGenerator.generatedReport.${field}`);
        }
        for (const [field, value] of Object.entries(generatedReport.minimumCounts ?? {})) {
            if (!Number.isInteger(value) || value < 0) {
                fail("reportGenerator.generatedReport.minimumCounts", `${field} must be a non-negative integer`);
            }
        }
    }

    if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
        fail("entries", "must be a non-empty array");
        return;
    }

    for (const [index, entry] of inventory.entries.entries()) {
        const label = `entries[${index}]`;
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
            fail(label, "must be an object");
            continue;
        }
        assertNonEmptyString(entry.id, `${label}.id`);
        assertNonEmptyString(entry.target, `${label}.target`);
        inventoryRelativePath(`${entry.id ?? label}.checker`, entry.checker);
        assertOptionalBoolean(entry.perfectFast, `${entry.id ?? label}.perfectFast`);
        assertOptionalBoolean(entry.perfectFull, `${entry.id ?? label}.perfectFull`);
        for (const field of ["reports", "policies", "contracts", "auditIds"]) {
            const values = assertStringArray(entry[field] ?? [], `${entry.id ?? label}.${field}`);
            assertUnique(values, `${entry.id ?? label}.${field}`);
            if (field !== "auditIds") {
                for (const relPath of values) inventoryRelativePath(`${entry.id ?? label}.${field}`, relPath);
            }
        }
    }
}

validateInventoryShape();
if (failures.length > 0) {
    console.error("Contract inventory shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

makefile = await readRel("Makefile", "Makefile");
docsIndex = await readRel("docs/README.md", "docsIndex");
qualityGates = await readRel("docs/quality-gates.md", "qualityGates");
audit = await readRel("docs/enterprise-hardening-audit.json", "enterpriseAudit");
perfectFast = targetLine("perfect-fast");
perfectFull = targetLine("perfect-full");

const inventoryInvariants = new Set(inventory.inventoryInvariants ?? []);
for (const invariant of [
    "valid-schema-version",
    "valid-purpose",
    "safe-inventory-paths",
    "typed-entry-lists",
    "typed-report-generator-config",
    "unique-entry-ids",
    "unique-entry-targets",
    "unique-entry-reports",
    "unique-entry-policies",
    "unique-entry-contracts",
    "unique-entry-audit-ids",
    "unique-report-generator-markers",
    "unique-report-generator-required-entry-ids",
    "unique-report-generator-required-toolbox-helper-scripts",
    "makefile-audit-wiring",
]) {
    if (!inventoryInvariants.has(invariant)) fail("inventoryInvariants", `missing invariant ${invariant}`);
}
assertUnique((inventory.entries ?? []).map((entry) => entry.id), "entries.id");
assertUnique((inventory.entries ?? []).map((entry) => entry.target), "entries.target");
assertUnique(inventory.reportGenerator?.contains, "reportGenerator.contains");
assertUnique(inventory.reportGenerator?.generatedReport?.requiredEntryIds, "reportGenerator.generatedReport.requiredEntryIds");
assertUnique(
    inventory.reportGenerator?.generatedReport?.requiredToolboxHelperScripts,
    "reportGenerator.generatedReport.requiredToolboxHelperScripts",
);

if (inventory.reportGenerator) {
    if (!(await existsRel(inventory.reportGenerator.path))) {
        fail("reportGenerator", `missing ${inventory.reportGenerator.path}`);
    } else {
        const generator = await readRel(inventory.reportGenerator.path);
        for (const marker of inventory.reportGenerator.contains ?? []) {
            if (!generator.includes(marker)) fail("reportGenerator", `missing marker ${marker}`);
        }
    }
    if (!makefile.includes(`${inventory.reportGenerator.makeTarget}:`)) {
        fail("reportGenerator", `Makefile missing ${inventory.reportGenerator.makeTarget}`);
    }
    const report = await buildReport();
    const generatedReport = inventory.reportGenerator.generatedReport ?? {};
    assertExactFields(report, generatedReport.exactFields, "reportGenerator.generatedReport");
    assertMinimumCounts(report.counts, generatedReport.minimumCounts, "reportGenerator.generatedReport.counts");
    assertEntryIds(report.entries, generatedReport.requiredEntryIds, "reportGenerator.generatedReport.entries");
    assertExactArray(
        report.requiredDocCoverage?.unlistedRequiredDocs ?? [],
        generatedReport.requiredUnlistedRequiredDocs ?? [],
        "reportGenerator.generatedReport.requiredDocCoverage.unlistedRequiredDocs",
    );
    assertExactArray(
        report.docsIndexCoverage?.missingLinks ?? [],
        generatedReport.requiredMissingDocsIndexLinks ?? [],
        "reportGenerator.generatedReport.docsIndexCoverage.missingLinks",
    );
    assertExactArray(
        report.qualityGateCoverage?.missingTargets ?? [],
        generatedReport.requiredMissingQualityGateTargets ?? [],
        "reportGenerator.generatedReport.qualityGateCoverage.missingTargets",
    );
    assertArrayContains(
        report.inventoryInvariantStatus?.invariants ?? [],
        generatedReport.requiredInventoryInvariants ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.invariants",
    );
    assertArrayContains(
        report.inventoryInvariantStatus?.structuralInvariants ?? [],
        generatedReport.requiredStructuralInvariants ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.structuralInvariants",
    );
    assertExactArray(
        report.inventoryShapeStatus?.schemaIssues ?? [],
        generatedReport.requiredInventoryShapeSchemaIssues ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.schemaIssues",
    );
    assertExactArray(
        report.inventoryShapeStatus?.unsafePaths ?? [],
        generatedReport.requiredInventoryShapeUnsafePaths ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.unsafePaths",
    );
    assertExactArray(
        report.inventoryShapeStatus?.typedListIssues ?? [],
        generatedReport.requiredInventoryShapeTypedListIssues ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.typedListIssues",
    );
    assertExactArray(
        report.inventoryShapeStatus?.booleanIssues ?? [],
        generatedReport.requiredInventoryShapeBooleanIssues ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.booleanIssues",
    );
    assertExactArray(
        report.inventoryShapeStatus?.minimumCountIssues ?? [],
        generatedReport.requiredInventoryShapeMinimumCountIssues ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.minimumCountIssues",
    );
    assertExactArray(
        report.inventoryShapeStatus?.invalidEntryShapes ?? [],
        generatedReport.requiredInventoryShapeInvalidEntryShapes ?? [],
        "reportGenerator.generatedReport.inventoryShapeStatus.invalidEntryShapes",
    );
    assertExactArray(
        report.inventoryInvariantStatus?.duplicateEntryIds ?? [],
        generatedReport.requiredDuplicateEntryIds ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.duplicateEntryIds",
    );
    assertExactArray(
        report.inventoryInvariantStatus?.duplicateEntryTargets ?? [],
        generatedReport.requiredDuplicateEntryTargets ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.duplicateEntryTargets",
    );
    assertExactArray(
        report.inventoryInvariantStatus?.duplicateReportGeneratorMarkers ?? [],
        generatedReport.requiredDuplicateReportGeneratorMarkers ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.duplicateReportGeneratorMarkers",
    );
    assertExactArray(
        report.inventoryInvariantStatus?.duplicateRequiredEntryIds ?? [],
        generatedReport.requiredDuplicateRequiredEntryIds ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.duplicateRequiredEntryIds",
    );
    assertExactArray(
        report.inventoryInvariantStatus?.duplicateRequiredToolboxHelperScripts ?? [],
        generatedReport.requiredDuplicateRequiredToolboxHelperScripts ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.duplicateRequiredToolboxHelperScripts",
    );
    assertExactArray(
        (report.inventoryInvariantStatus?.entryDuplicateLists ?? []).map(
            (entry) => `${entry.id}.${entry.field}`,
        ),
        generatedReport.requiredEntryDuplicateLists ?? [],
        "reportGenerator.generatedReport.inventoryInvariantStatus.entryDuplicateLists",
    );
    assertArrayContains(
        report.orderedProofChainCoverage?.entries?.map((entry) => entry.id) ?? [],
        generatedReport.requiredOrderedProofChainEntries ?? [],
        "reportGenerator.generatedReport.orderedProofChainCoverage.entries",
    );
    assertExactArray(
        report.orderedProofChainCoverage?.missingRequiredEntries ?? [],
        generatedReport.requiredMissingOrderedProofChainEntries ?? [],
        "reportGenerator.generatedReport.orderedProofChainCoverage.missingRequiredEntries",
    );
    assertExactArray(
        report.toolboxHelperOwnership?.missingOwners ?? [],
        generatedReport.requiredMissingToolboxHelperOwners ?? [],
        "reportGenerator.generatedReport.toolboxHelperOwnership.missingOwners",
    );
    assertArrayContains(
        report.toolboxHelperOwnership?.helpers?.map((helper) => helper.path) ?? [],
        generatedReport.requiredToolboxHelperScripts ?? [],
        "reportGenerator.generatedReport.toolboxHelperOwnership.helpers",
    );
    assertExactArray(
        report.toolboxHelperCommandCoverage?.missingCommands ?? [],
        generatedReport.requiredMissingToolboxHelperCommands ?? [],
        "reportGenerator.generatedReport.toolboxHelperCommandCoverage.missingCommands",
    );
    assertExactArray(
        report.toolboxHelperCommandCoverage?.extraCommands ?? [],
        generatedReport.requiredExtraToolboxHelperCommands ?? [],
        "reportGenerator.generatedReport.toolboxHelperCommandCoverage.extraCommands",
    );
    assertExactArray(
        report.toolboxHelperCommandCoverage?.duplicateCommands ?? [],
        generatedReport.requiredDuplicateToolboxHelperCommands ?? [],
        "reportGenerator.generatedReport.toolboxHelperCommandCoverage.duplicateCommands",
    );
    assertArrayContains(
        report.toolboxHelperCommandCoverage?.helpers?.map((helper) => helper.path) ?? [],
        generatedReport.requiredToolboxHelperScripts ?? [],
        "reportGenerator.generatedReport.toolboxHelperCommandCoverage.helpers",
    );
}

for (const entry of inventory.entries ?? []) {
    const id = entry.id;
    if (entry.retired) {
        // Retired gates are history-only: their target/checker/contract files
        // are gone (folded into a survivor via `retiredGates`), so skip every
        // liveness assertion. Keep auditIds resolvable so the audit history
        // stays wired.
        for (const auditId of entry.auditIds ?? []) {
            if (!audit.includes(`"id": "${auditId}"`)) fail(id, `enterprise audit missing id ${auditId}`);
        }
        continue;
    }
    if (!entry.target) fail(id, "missing target");
    if (!entry.checker) fail(id, "missing checker");
    assertUnique(entry.reports, `${id}.reports`);
    assertUnique(entry.policies, `${id}.policies`);
    assertUnique(entry.contracts, `${id}.contracts`);
    assertUnique(entry.auditIds, `${id}.auditIds`);
    if (!makefile.includes(`${entry.target}:`)) fail(id, `Makefile missing target ${entry.target}`);
    if (!(await existsRel(entry.checker))) fail(id, `missing checker ${entry.checker}`);

    if (entry.perfectFast && !perfectFast.includes(entry.target)) fail(id, `perfect-fast missing ${entry.target}`);
    if (entry.perfectFull && !perfectFull.includes(entry.target)) fail(id, `perfect-full missing ${entry.target}`);

    if (!qualityGates.includes(`make ${entry.target}`)) fail(id, `docs/quality-gates.md missing make ${entry.target}`);

    for (const relPath of [...(entry.reports ?? [])]) {
        if (!(await existsRel(relPath))) fail(id, `missing report ${relPath}`);
    }

    for (const relPath of [...(entry.policies ?? []), ...(entry.contracts ?? [])]) {
        if (!(await existsRel(relPath))) fail(id, `missing ${relPath}`);
        const docsLink = `./${relPath.replace(/^docs\//, "")}`;
        if (!docsIndex.includes(docsLink)) fail(id, `docs/README.md missing ${docsLink}`);
    }

    for (const auditId of entry.auditIds ?? []) {
        if (!audit.includes(`"id": "${auditId}"`)) fail(id, `enterprise audit missing id ${auditId}`);
    }
}

const listedDocs = new Set(
    (inventory.entries ?? []).flatMap((entry) => [...(entry.policies ?? []), ...(entry.contracts ?? [])]),
);
for (const relPath of await discoverRequiredDocs()) {
    if (!listedDocs.has(relPath)) fail("inventory", `required contract/policy document not listed: ${relPath}`);
}

if (failures.length > 0) {
    console.error("Contract inventory failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(`Contract inventory passed (${inventory.entries.length} entries checked).`);

async function discoverRequiredDocs() {
    const names = await readdir(path.join(root, "docs"));
    return names
        .filter((name) => name.endsWith("-contract.json") || name.endsWith("-policy.md"))
        .map((name) => `docs/${name}`)
        .sort();
}
