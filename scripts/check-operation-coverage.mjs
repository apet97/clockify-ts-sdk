#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import { isTargetReachable } from "./lib/gate-targets.mjs";
import { validateOperationDisposition } from "./lib/operation-parity-contract.mjs";
import { buildOperationEvidenceSemanticExpectations } from "./lib/operation-evidence-semantics.mjs";

const root = process.cwd();
const failures = [];
const contract = (await readJsonRel("docs/operation-coverage-contract.json", "contract")) ?? {};

function safeRelativePath(label, relPath) {
    if (typeof relPath !== "string" || relPath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relPath).replace(/\\/g, "/");
    const segments = relPath.split(/[\\/]+/);
    if (path.isAbsolute(relPath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relPath}`);
        return "";
    }

    return normalized;
}

async function readRel(relPath, label = relPath) {
    const safePath = safeRelativePath(label, relPath);
    if (safePath === "") return "";

    try {
        return await readFile(path.join(root, safePath), "utf8");
    } catch {
        fail(label, "missing");
        return "";
    }
}

async function readJsonRel(relPath, label = relPath) {
    const text = await readRel(relPath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

async function existsRel(relPath) {
    const safePath = safeRelativePath("existsRel", relPath);
    if (safePath === "") return false;

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

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(label, "must be a non-empty string");
        return false;
    }
    return true;
}

function assertNonNegativeInteger(label, value) {
    if (!Number.isInteger(value) || value < 0) {
        fail(label, "must be a non-negative integer");
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(label, `must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { required = true, min = 0 } = {}) {
    if (values == null && !required) return [];
    if (!Array.isArray(values)) {
        fail(label, "must be an array");
        return [];
    }
    if (values.length < min) fail(label, `must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]`, "must be a non-empty string");
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.${markerField}`, entry[markerField], { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateSupportingEvidence() {
    if (!Array.isArray(contract.supportingEvidence) || contract.supportingEvidence.length === 0) {
        fail("supportingEvidence", "must be a non-empty array");
        return;
    }
    for (const [index, evidence] of contract.supportingEvidence.entries()) {
        validateMarkerEntry(`supportingEvidence[${index}]`, evidence);
    }
    assertUnique(
        "supportingEvidence.path",
        contract.supportingEvidence.map((evidence) => evidence?.path).filter((evidencePath) => typeof evidencePath === "string"),
    );
}

function makeTargetRule(makefile, target) {
    const lines = makefile.split("\n");
    const targetIndex = lines.findIndex((line) => line.startsWith(`${target}:`));
    if (targetIndex < 0) return { prerequisites: [], recipes: [] };

    const targetLine = lines[targetIndex];
    const prerequisites = targetLine
        .slice(targetLine.indexOf(":") + 1)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    const recipes = [];
    for (
        let index = targetIndex + 1;
        index < lines.length && lines[index].startsWith("\t");
        index += 1
    ) {
        recipes.push(lines[index].slice(1));
    }
    return { prerequisites, recipes };
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("policyDocument", contract.policyDocument);

    if (assertObject("reportInputs", contract.reportInputs)) {
        safeRelativePath("reportInputs.openapiOperations", contract.reportInputs.openapiOperations);
        safeRelativePath("reportInputs.operationParity", contract.reportInputs.operationParity);
        safeRelativePath("reportInputs.operationDispositions", contract.reportInputs.operationDispositions);
        safeRelativePath("reportInputs.sdkNamingClassifications", contract.reportInputs.sdkNamingClassifications);
        safeRelativePath("reportInputs.operationEvidence", contract.reportInputs.operationEvidence);
        safeRelativePath("reportInputs.operationEvidenceAnchors", contract.reportInputs.operationEvidenceAnchors);
        safeRelativePath("reportInputs.operationEvidenceSemantics", contract.reportInputs.operationEvidenceSemantics);
        safeRelativePath("reportInputs.correctedOpenapi", contract.reportInputs.correctedOpenapi);
        safeRelativePath("reportInputs.discrepancyLedger", contract.reportInputs.discrepancyLedger);
        safeRelativePath("reportInputs.sdkCodegenReceipt", contract.reportInputs.sdkCodegenReceipt);
    }

    if (assertObject("generatedInputWiring", contract.generatedInputWiring)) {
        for (const key of ["coveragePrerequisites", "coverageRecipes", "coverageAggregateRecipes", "sdkBuildPrerequisites", "codegenRecipes"]) {
            assertStringArray(`generatedInputWiring.${key}`, contract.generatedInputWiring[key], { min: 1 });
        }
        assertStringArray(
            "generatedInputWiring.coverageAggregatePrerequisites",
            contract.generatedInputWiring.coverageAggregatePrerequisites,
        );
        for (const key of ["coverageAggregateTarget", "sdkBuildTarget", "codegenTarget"]) {
            assertNonEmptyString(`generatedInputWiring.${key}`, contract.generatedInputWiring[key]);
        }
        const exactGeneratedInputWiring = {
            coveragePrerequisites: ["operation-parity-drift"],
            coverageRecipes: ["$(MAKE) --no-print-directory operation-coverage-run"],
            coverageAggregateTarget: "operation-coverage-run",
            coverageAggregatePrerequisites: [],
            coverageAggregateRecipes: [
                "node --test scripts/operation-evidence-semantics.test.mjs",
                "node --test scripts/generate-operation-parity.test.mjs",
                "node scripts/check-operation-coverage.mjs",
            ],
            sdkBuildTarget: "sdk-wrapper-build",
            sdkBuildPrerequisites: ["sdk-codegen-sync"],
            codegenTarget: "sdk-codegen-sync",
            codegenRecipes: [
                "node scripts/generate-sdk-from-openapi.mjs --write",
                "cd wrapper && npm run sync",
            ],
        };
        if (JSON.stringify(contract.generatedInputWiring) !== JSON.stringify(exactGeneratedInputWiring)) {
            fail("generatedInputWiring", `must equal ${JSON.stringify(exactGeneratedInputWiring)}`);
        }
    }

    if (assertObject("driftWiring", contract.driftWiring)) {
        assertNonEmptyString("driftWiring.target", contract.driftWiring.target);
        assertStringArray("driftWiring.requiredPrerequisites", contract.driftWiring.requiredPrerequisites, { min: 1 });
        assertStringArray("driftWiring.forbiddenPrerequisites", contract.driftWiring.forbiddenPrerequisites, { min: 1 });
        if (contract.driftWiring.target !== "operation-parity-drift") {
            fail("driftWiring.target", "must be operation-parity-drift");
        }
        if (JSON.stringify(contract.driftWiring.requiredPrerequisites) !== JSON.stringify(["mcp-tool-manifest-drift"])) {
            fail("driftWiring.requiredPrerequisites", "must require only mcp-tool-manifest-drift");
        }
        if (JSON.stringify(contract.driftWiring.forbiddenPrerequisites) !== JSON.stringify(["mcp-tool-manifest"])) {
            fail("driftWiring.forbiddenPrerequisites", "must forbid writer mcp-tool-manifest");
        }
    }

    if (assertObject("manifestProofWiring", contract.manifestProofWiring)) {
        for (const key of ["driftTarget", "driftExecutionTarget", "writerTarget"]) {
            assertNonEmptyString(`manifestProofWiring.${key}`, contract.manifestProofWiring[key]);
        }
        for (const key of [
            "driftPrerequisites",
            "driftRecipes",
            "driftExecutionRecipes",
            "writerPrerequisites",
            "writerRecipes",
        ]) {
            assertStringArray(`manifestProofWiring.${key}`, contract.manifestProofWiring[key], {
                min: 1,
            });
        }
        for (const key of ["driftExecutionPrerequisites"]) {
            assertStringArray(`manifestProofWiring.${key}`, contract.manifestProofWiring[key]);
        }
        const exactManifestProofWiring = {
            driftTarget: "mcp-tool-manifest-drift",
            driftPrerequisites: ["sdk-wrapper-build"],
            driftRecipes: ["$(MAKE) --no-print-directory mcp-tool-manifest-drift-run"],
            driftExecutionTarget: "mcp-tool-manifest-drift-run",
            driftExecutionPrerequisites: [],
            driftExecutionRecipes: ["cd mcp && node --import tsx scripts/generate-tool-manifest.mjs --check"],
            writerTarget: "mcp-tool-manifest",
            writerPrerequisites: ["sdk-wrapper-build"],
            writerRecipes: ["cd mcp && node --import tsx scripts/generate-tool-manifest.mjs --write"],
        };
        if (
            JSON.stringify(contract.manifestProofWiring) !==
            JSON.stringify(exactManifestProofWiring)
        ) {
            fail("manifestProofWiring", `must equal ${JSON.stringify(exactManifestProofWiring)}`);
        }
        if (contract.manifestProofWiring.driftTarget === contract.manifestProofWiring.writerTarget) {
            fail("manifestProofWiring", "driftTarget and writerTarget must be distinct");
        }
    }

    // Each threshold is a dated, reasoned decision, not a bare number: a
    // structural check like this one only proves the value is well-formed. It
    // does not prove -- and does not attempt to prove -- that `reason` stays
    // fresh when `value` changes; that freshness stays human-reviewed on
    // purpose (a named residual, not an oversight).
    if (assertObject("thresholds", contract.thresholds)) {
        for (const key of [
            "operations",
            "sdkGenerated",
            "sdkExplicitlyNamed",
            "sdkOperationIdDerived",
            "tsMcpExact",
            "goMcpExact",
            "cliExact",
            "curated",
        ]) {
            const entry = contract.thresholds[key];
            if (!assertObject(`thresholds.${key}`, entry)) continue;
            assertNonNegativeInteger(`thresholds.${key}.value`, entry.value);
            if (entry.direction !== "exact" && entry.direction !== "floor") {
                fail(`thresholds.${key}.direction`, 'must be "exact" or "floor"');
            }
            assertNonEmptyString(`thresholds.${key}.reason`, entry.reason);
            if (typeof entry.changedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.changedOn)) {
                fail(`thresholds.${key}.changedOn`, "must be a YYYY-MM-DD date string");
            }
        }
    }

    assertStringArray("requiredTargets", contract.requiredTargets, { min: 1 });
    for (const [index, docPath] of assertStringArray("requiredDocs", contract.requiredDocs, { min: 1 }).entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }
    validateSupportingEvidence();

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "aggregateTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
        if (contract.wiring.makeTarget !== "operation-coverage") {
            fail("wiring.makeTarget", "must be operation-coverage");
        }
        if (contract.wiring.aggregateTarget !== "operation-coverage-run") {
            fail("wiring.aggregateTarget", "must be operation-coverage-run");
        }
        if (contract.wiring.checker !== "scripts/check-operation-coverage.mjs") {
            fail("wiring.checker", "must be scripts/check-operation-coverage.mjs");
        }
        if (contract.wiring.qualityGate !== "make operation-coverage") {
            fail("wiring.qualityGate", "must be make operation-coverage");
        }
        if (contract.wiring.inventoryId !== "operation-coverage") {
            fail("wiring.inventoryId", "must be operation-coverage");
        }
        if (contract.wiring.auditId !== "operation-coverage") {
            fail("wiring.auditId", "must be operation-coverage");
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${marker}`);
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Operation coverage contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const parity = (await readJsonRel(contract.reportInputs.operationParity, "reportInputs.operationParity")) ?? {};
const openapi = (await readJsonRel(contract.reportInputs.openapiOperations, "reportInputs.openapiOperations")) ?? {};
const dispositions =
    (await readJsonRel(contract.reportInputs.operationDispositions, "reportInputs.operationDispositions")) ?? {};
const classifications =
    (await readJsonRel(contract.reportInputs.sdkNamingClassifications, "reportInputs.sdkNamingClassifications")) ?? {};
const evidence =
    (await readJsonRel(contract.reportInputs.operationEvidence, "reportInputs.operationEvidence")) ?? {};
const evidenceAnchors =
    (await readJsonRel(
        contract.reportInputs.operationEvidenceAnchors,
        "reportInputs.operationEvidenceAnchors",
    )) ?? {};
const evidenceSemantics =
    (await readJsonRel(
        contract.reportInputs.operationEvidenceSemantics,
        "reportInputs.operationEvidenceSemantics",
    )) ?? {};
const correctedOpenapi = parse(
    await readRel(contract.reportInputs.correctedOpenapi, "reportInputs.correctedOpenapi"),
);
const receipt =
    (await readJsonRel(contract.reportInputs.sdkCodegenReceipt, "reportInputs.sdkCodegenReceipt")) ?? {};
const discrepancyLedger = await readRel(
    contract.reportInputs.discrepancyLedger,
    "reportInputs.discrepancyLedger",
);
const makefile = await readRel("Makefile");
const docsIndex = await readRel("docs/README.md");
const qualityGates = await readRel("docs/quality-gates.md");
const contractInventory = await readRel("docs/contract-inventory.json");
const enterpriseAudit = await readRel("docs/enterprise-hardening-audit.json");

const policy = await readRel(contract.policyDocument.path);
includesAll(policy, contract.policyDocument.contains, contract.policyDocument.path);
for (const marker of contract.policyDocument.forbiddenMarkers ?? []) {
    if (policy.includes(marker)) fail(contract.policyDocument.path, `contains forbidden marker ${marker}`);
}

if (
    classifications.schemaVersion !== 1 ||
    typeof classifications.purpose !== "string" ||
    !Array.isArray(classifications.classifications)
) {
    fail(contract.reportInputs.sdkNamingClassifications, "must have schemaVersion 1, purpose, and classifications");
}
if (
    evidence.schemaVersion !== 1 ||
    typeof evidence.purpose !== "string" ||
    !Array.isArray(evidence.operations)
) {
    fail(contract.reportInputs.operationEvidence, "must have schemaVersion 1, purpose, and operations");
}
if (
    evidenceAnchors.schemaVersion !== 1 ||
    typeof evidenceAnchors.purpose !== "string" ||
    !Array.isArray(evidenceAnchors.anchors)
) {
    fail(
        contract.reportInputs.operationEvidenceAnchors,
        "must have schemaVersion 1, purpose, and anchors",
    );
}
if (
    evidenceSemantics.schemaVersion !== 1 ||
    typeof evidenceSemantics.purpose !== "string" ||
    !Array.isArray(evidenceSemantics.canonicalPaginatedRoutes)
) {
    fail(
        contract.reportInputs.operationEvidenceSemantics,
        "must have schemaVersion 1, purpose, and canonicalPaginatedRoutes",
    );
}
const knownEvidenceIds = new Set(
    [...discrepancyLedger.matchAll(/^### `([^`]+)`/gm)].map((match) => match[1]),
);
for (const failure of validateOperationDisposition({
    artifact: dispositions,
    classifications: classifications.classifications ?? [],
    evidenceAnchors: evidenceAnchors.anchors ?? [],
    evidenceAudit: evidence.operations ?? [],
    inventory: openapi,
    knownEvidenceIds,
    receipt,
    semanticEvidenceExpectations: buildOperationEvidenceSemanticExpectations({
        inventory: openapi,
        openapi: correctedOpenapi,
        semanticContract: evidenceSemantics,
    }),
})) {
    fail("generated operation truth", failure);
}

// Each key's direction is asserted twice, deliberately: the schema check
// above requires it to be present and well-formed, and this map is the
// independent expectation a threshold entry is compared against below. A
// bare `entry.direction` read here (with no independent expectation) would
// let someone silently loosen an "exact" metric to a "floor" -- e.g. quietly
// widen "operations" from must-equal to must-at-least -- and nothing would
// catch it. Comparing against a fixed expectation keeps direction
// load-bearing, not merely descriptive.
const EXPECTED_DIRECTIONS = {
    operations: "exact",
    sdkGenerated: "exact",
    sdkExplicitlyNamed: "exact",
    sdkOperationIdDerived: "exact",
    tsMcpExact: "floor",
    goMcpExact: "floor",
    cliExact: "exact",
    curated: "floor",
};

const thresholds = contract.thresholds ?? {};
const summary = parity.summary ?? {};
const thresholdValue = (key) => thresholds[key]?.value;

for (const [key, expectedDirection] of Object.entries(EXPECTED_DIRECTIONS)) {
    const entry = thresholds[key];
    if (isObject(entry) && entry.direction !== expectedDirection) {
        fail(`thresholds.${key}.direction`, `must be ${JSON.stringify(expectedDirection)}`);
    }
}

if (openapi.operationCount !== thresholdValue("operations")) {
    fail(
        contract.reportInputs.openapiOperations,
        `expected operationCount ${thresholdValue("operations")}, got ${openapi.operationCount}`,
    );
}
if (summary.operations !== thresholdValue("operations")) {
    fail(
        contract.reportInputs.operationParity,
        `expected summary.operations ${thresholdValue("operations")}, got ${summary.operations}`,
    );
}
for (const key of ["sdkGenerated", "sdkExplicitlyNamed", "sdkOperationIdDerived", "cliExact"]) {
    if (summary[key] !== thresholdValue(key)) {
        fail(contract.reportInputs.operationParity, `${key} expected ${thresholdValue(key)}, got ${summary[key]}`);
    }
}
for (const key of ["tsMcpExact", "goMcpExact", "curated"]) {
    const value = thresholdValue(key);
    if (typeof value !== "number") fail("thresholds", `missing numeric threshold ${key}`);
    if (typeof summary[key] !== "number") fail(contract.reportInputs.operationParity, `missing numeric summary ${key}`);
    if (typeof value === "number" && typeof summary[key] === "number" && summary[key] < value) {
        fail(contract.reportInputs.operationParity, `${key} coverage ${summary[key]} is below minimum ${value}`);
    }
}

// TS MCP silent-drop accountability: an operation the TS MCP does not cover
// is a deliberate, explained decision, never an accident. Every tsMcp:null
// parity row must carry a curated overrideReason, so a future drop reds here
// naming the operation instead of hiding inside the aggregate floor.
for (const row of Array.isArray(parity.operations) ? parity.operations : []) {
    if (!isObject(row) || row.tsMcp !== null) continue;
    if (typeof row.overrideReason !== "string" || row.overrideReason.trim() === "") {
        fail(
            contract.reportInputs.operationParity,
            `operation ${row.operationId ?? `${row.method} ${row.path}`} has tsMcp null without a curated overrideReason`,
        );
    }
}

// GOCLMCP sibling-fallback freshness (W5): CI has no GOCLMCP checkout, so
// docs/operation-parity.json's goMcp values are routinely carried forward
// from the last sibling-present regeneration -- a circular fallback that,
// left unchecked, could carry stale data indefinitely. This assertion is
// release-proof-tier ONLY (reached via operation-coverage-run ->
// release-proof/heavy-proof/perfect-full, never contract-gates): CI staying
// green on a carried-forward stamp is by design, but a RELEASE must reflect
// a real GOCLMCP comparison from within the freshness window. The window
// (90 days) is a bootstrap default, not a measured policy figure.
const GOMCP_FRESHNESS_WINDOW_DAYS = 90;
const goMcpSource = parity.sources?.goMcp;
if (!isObject(goMcpSource)) {
    fail(contract.reportInputs.operationParity, "sources.goMcp must be an object with catalogPresent/carriedForward/carriedFromVerifiedAt");
} else if (goMcpSource.carriedForward === true) {
    if (typeof goMcpSource.carriedFromVerifiedAt !== "string") {
        fail(
            contract.reportInputs.operationParity,
            "sources.goMcp is carried forward but carriedFromVerifiedAt is unknown -- " +
                "never stamped by a sibling-present regeneration; run generate-operation-parity.mjs " +
                "--write with the GOCLMCP sibling checked out before releasing",
        );
    } else {
        const ageDays = Math.floor(
            (Date.now() - Date.parse(`${goMcpSource.carriedFromVerifiedAt}T00:00:00Z`)) / 86_400_000,
        );
        if (!(ageDays >= 0) || ageDays > GOMCP_FRESHNESS_WINDOW_DAYS) {
            fail(
                contract.reportInputs.operationParity,
                `sources.goMcp carried forward from ${goMcpSource.carriedFromVerifiedAt} ` +
                    `(${ageDays} day(s) ago) exceeds the ${GOMCP_FRESHNESS_WINDOW_DAYS}-day release freshness ` +
                    "window; run generate-operation-parity.mjs --write with the GOCLMCP sibling checked out",
            );
        }
    }
}

// The policy document's coverage table is derived, not hand-maintained: every
// row must render exactly from contract.thresholds and the current parity
// summary, so a stale or hand-edited number reds this gate instead of rotting.
// `kind` renders from thresholds[key].direction (validated above against
// EXPECTED_DIRECTIONS), not a second hardcoded literal here.
const policyTableRows = [
    ["operations", "OpenAPI operations"],
    ["sdkGenerated", "Generated SDK operations"],
    ["sdkExplicitlyNamed", "Explicitly named SDK operations"],
    ["sdkOperationIdDerived", "OperationId-derived SDK operations"],
    ["tsMcpExact", "TS MCP exact operation/tool matches"],
    ["goMcpExact", "GOCLMCP exact operation/tool matches"],
    ["cliExact", "CLI exact command/operation matches"],
    ["curated", "Curated parity overrides"],
];
for (const [key, label] of policyTableRows) {
    const kind = thresholds[key]?.direction ?? "unknown";
    const expectedRow = `| ${label} | ${kind} | ${thresholdValue(key)} | ${summary[key]} |`;
    if (!policy.includes(expectedRow)) {
        fail(
            contract.policyDocument.path,
            `missing derived coverage table row ${JSON.stringify(expectedRow)} ` +
                "(rendered from contract.thresholds and the parity summary; update the table, not the numbers by hand)",
        );
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

const driftPrerequisites = makeTargetRule(makefile, contract.driftWiring.target).prerequisites;
for (const prerequisite of contract.driftWiring.requiredPrerequisites) {
    if (!driftPrerequisites.includes(prerequisite)) {
        fail("Makefile", `${contract.driftWiring.target} missing exact prerequisite ${prerequisite}`);
    }
}
for (const prerequisite of contract.driftWiring.forbiddenPrerequisites) {
    if (driftPrerequisites.includes(prerequisite)) {
        fail("Makefile", `${contract.driftWiring.target} must not depend on writer ${prerequisite}`);
    }
}

const manifestDriftRule = makeTargetRule(makefile, contract.manifestProofWiring.driftTarget);
const manifestDriftExecutionRule = makeTargetRule(
    makefile,
    contract.manifestProofWiring.driftExecutionTarget,
);
const manifestWriterRule = makeTargetRule(makefile, contract.manifestProofWiring.writerTarget);
for (const [target, label, actual, expected] of [
    [
        contract.manifestProofWiring.driftTarget,
        "prerequisites",
        manifestDriftRule.prerequisites,
        contract.manifestProofWiring.driftPrerequisites,
    ],
    [
        contract.manifestProofWiring.driftTarget,
        "recipes",
        manifestDriftRule.recipes,
        contract.manifestProofWiring.driftRecipes,
    ],
    [
        contract.manifestProofWiring.driftExecutionTarget,
        "prerequisites",
        manifestDriftExecutionRule.prerequisites,
        contract.manifestProofWiring.driftExecutionPrerequisites,
    ],
    [
        contract.manifestProofWiring.driftExecutionTarget,
        "recipes",
        manifestDriftExecutionRule.recipes,
        contract.manifestProofWiring.driftExecutionRecipes,
    ],
    [
        contract.manifestProofWiring.writerTarget,
        "prerequisites",
        manifestWriterRule.prerequisites,
        contract.manifestProofWiring.writerPrerequisites,
    ],
    [
        contract.manifestProofWiring.writerTarget,
        "recipes",
        manifestWriterRule.recipes,
        contract.manifestProofWiring.writerRecipes,
    ],
]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(
            "Makefile",
            `${target} ${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    }
}
if (manifestDriftRule.prerequisites.includes(contract.manifestProofWiring.writerTarget)) {
    fail(
        "Makefile",
        `${contract.manifestProofWiring.driftTarget} must not depend on writer ${contract.manifestProofWiring.writerTarget}`,
    );
}
if (manifestDriftRule.recipes.some((recipe) => recipe.includes("--write"))) {
    fail("Makefile", `${contract.manifestProofWiring.driftTarget} must not run a manifest writer`);
}
if (manifestWriterRule.recipes.some((recipe) => recipe.includes("--check"))) {
    fail(
        "Makefile",
        `${contract.manifestProofWiring.writerTarget} must remain the explicit manifest writer`,
    );
}

const coverageRule = makeTargetRule(makefile, contract.wiring.makeTarget);
const coverageAggregateRule = makeTargetRule(
    makefile,
    contract.generatedInputWiring.coverageAggregateTarget,
);
const sdkBuildRule = makeTargetRule(makefile, contract.generatedInputWiring.sdkBuildTarget);
const codegenRule = makeTargetRule(makefile, contract.generatedInputWiring.codegenTarget);
for (const [target, label, actual, expected] of [
    [
        contract.wiring.makeTarget,
        "prerequisites",
        coverageRule.prerequisites,
        contract.generatedInputWiring.coveragePrerequisites,
    ],
    [
        contract.wiring.makeTarget,
        "recipes",
        coverageRule.recipes,
        contract.generatedInputWiring.coverageRecipes,
    ],
    [
        contract.generatedInputWiring.coverageAggregateTarget,
        "prerequisites",
        coverageAggregateRule.prerequisites,
        contract.generatedInputWiring.coverageAggregatePrerequisites,
    ],
    [
        contract.generatedInputWiring.coverageAggregateTarget,
        "recipes",
        coverageAggregateRule.recipes,
        contract.generatedInputWiring.coverageAggregateRecipes,
    ],
    [
        contract.generatedInputWiring.sdkBuildTarget,
        "prerequisites",
        sdkBuildRule.prerequisites,
        contract.generatedInputWiring.sdkBuildPrerequisites,
    ],
    [
        contract.generatedInputWiring.codegenTarget,
        "recipes",
        codegenRule.recipes,
        contract.generatedInputWiring.codegenRecipes,
    ],
]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(
            "Makefile",
            `${target} ${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
    }
}

if (!makefile.includes(`node ${contract.wiring.checker}`)) {
    fail("Makefile", `missing ${contract.wiring.checker} invocation`);
}
const aggregateRoot = contract.wiring.aggregateRoot ?? "contract-gates";
if (!isTargetReachable(makefile, aggregateRoot, contract.wiring.aggregateTarget)) {
    fail("Makefile", `${aggregateRoot} missing ${contract.wiring.aggregateTarget}`);
}
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}
if (!contractInventory.includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!enterpriseAudit.includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Operation coverage contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `Operation coverage contract passed (${summary.operations} ops, ${summary.sdkGenerated} generated SDK = ${summary.sdkExplicitlyNamed} explicit + ${summary.sdkOperationIdDerived} operationId-derived, ${summary.tsMcpExact} TS MCP, ${summary.goMcpExact} Go MCP, ${summary.curated} curated).`,
);
