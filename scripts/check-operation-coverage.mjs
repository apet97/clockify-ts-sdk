#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

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
        safeRelativePath("reportInputs.sdkCodegenReceipt", contract.reportInputs.sdkCodegenReceipt);
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
        for (const key of ["driftTarget", "writerTarget"]) {
            assertNonEmptyString(`manifestProofWiring.${key}`, contract.manifestProofWiring[key]);
        }
        for (const key of [
            "driftPrerequisites",
            "driftRecipes",
            "writerPrerequisites",
            "writerRecipes",
        ]) {
            assertStringArray(`manifestProofWiring.${key}`, contract.manifestProofWiring[key], {
                min: 1,
            });
        }
        const exactManifestProofWiring = {
            driftTarget: "mcp-tool-manifest-drift",
            driftPrerequisites: ["sdk-wrapper-build"],
            driftRecipes: ["cd mcp && node --import tsx scripts/generate-tool-manifest.mjs --check"],
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

    if (assertObject("thresholds", contract.thresholds)) {
        for (const key of [
            "operations",
            "sdkGenerated",
            "sdkExplicitlyNamed",
            "sdkOperationIdDerived",
            "tsMcpExact",
            "goMcpExact",
            "curated",
        ]) {
            assertNonNegativeInteger(`thresholds.${key}`, contract.thresholds[key]);
        }
    }

    assertStringArray("requiredTargets", contract.requiredTargets, { min: 1 });
    for (const [index, docPath] of assertStringArray("requiredDocs", contract.requiredDocs, { min: 1 }).entries()) {
        safeRelativePath(`requiredDocs[${index}]`, docPath);
    }
    validateSupportingEvidence();

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
        if (contract.wiring.makeTarget !== "operation-coverage") {
            fail("wiring.makeTarget", "must be operation-coverage");
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
const receipt =
    (await readJsonRel(contract.reportInputs.sdkCodegenReceipt, "reportInputs.sdkCodegenReceipt")) ?? {};
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

const thresholds = contract.thresholds ?? {};
const summary = parity.summary ?? {};
if (openapi.operationCount !== thresholds.operations) {
    fail(contract.reportInputs.openapiOperations, `expected operationCount ${thresholds.operations}, got ${openapi.operationCount}`);
}
if (summary.operations !== thresholds.operations) {
    fail(contract.reportInputs.operationParity, `expected summary.operations ${thresholds.operations}, got ${summary.operations}`);
}
for (const key of ["sdkGenerated", "sdkExplicitlyNamed", "sdkOperationIdDerived"]) {
    if (summary[key] !== thresholds[key]) {
        fail(contract.reportInputs.operationParity, `${key} expected ${thresholds[key]}, got ${summary[key]}`);
    }
    if (dispositions?.summary?.[key] !== thresholds[key]) {
        fail(
            contract.reportInputs.operationDispositions,
            `${key} expected ${thresholds[key]}, got ${dispositions?.summary?.[key]}`,
        );
    }
}
if (receipt.operationCount !== thresholds.sdkGenerated) {
    fail(contract.reportInputs.sdkCodegenReceipt, `operationCount expected ${thresholds.sdkGenerated}, got ${receipt.operationCount}`);
}
if ((classifications.classifications ?? []).length !== thresholds.sdkOperationIdDerived) {
    fail(
        contract.reportInputs.sdkNamingClassifications,
        `classification count expected ${thresholds.sdkOperationIdDerived}, got ${(classifications.classifications ?? []).length}`,
    );
}
for (const key of ["tsMcpExact", "goMcpExact", "curated"]) {
    if (typeof thresholds[key] !== "number") fail("thresholds", `missing numeric threshold ${key}`);
    if (typeof summary[key] !== "number") fail(contract.reportInputs.operationParity, `missing numeric summary ${key}`);
    if (typeof thresholds[key] === "number" && typeof summary[key] === "number" && summary[key] < thresholds[key]) {
        fail(contract.reportInputs.operationParity, `${key} coverage ${summary[key]} is below minimum ${thresholds[key]}`);
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

if (!makefile.includes(`node ${contract.wiring.checker}`)) {
    fail("Makefile", `missing ${contract.wiring.checker} invocation`);
}
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
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
