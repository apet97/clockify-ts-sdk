#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "docs/operator-toolbox-contract.json"), "utf8"));
let failures = [];

function fail(label, message) {
    failures.push(`${label}: ${message}`);
}

function toolboxRelativePath(label, relativePath) {
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

function readRelative(relativePath, label = relativePath) {
    const safePath = toolboxRelativePath(label, relativePath);
    if (safePath == null) return "";
    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJsonRelative(relativePath, label) {
    const text = readRelative(relativePath);
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON in ${relativePath}: ${error.message}`);
        return null;
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${JSON.stringify(marker)}`);
    }
}

// Planner scripts are reached through scripts/plan.mjs; derive the topic from the basename.
const PLANNER_TOPIC_BY_SCRIPT = {
    "scripts/onboarding-plan.mjs": "onboarding",
    "scripts/workflow-plan.mjs": "workflow",
    "scripts/acceptance-plan.mjs": "acceptance",
    "scripts/examples-plan.mjs": "examples",
    "scripts/change-impact-plan.mjs": "change-impact",
    "scripts/maintenance-plan.mjs": "maintenance",
    "scripts/performance-calibration-plan.mjs": "performance-calibration",
    "scripts/release-decision-plan.mjs": "release-decision",
    "scripts/contract-inventory-report.mjs": "contract-inventory",
    "scripts/risk-status-report.mjs": "risk-status",
};

function plannerTopicFor(scriptPath) {
    return PLANNER_TOPIC_BY_SCRIPT[scriptPath] ?? null;
}

function assertUnique(items, label) {
    const seen = new Set();
    for (const item of items ?? []) {
        if (seen.has(item)) fail(label, `duplicate ${item}`);
        seen.add(item);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);
    toolboxRelativePath("toolbox.path", contract.toolbox?.path);
    assertStringArray("toolbox.mustContain", contract.toolbox?.mustContain, { allowEmpty: false });
    assertStringArray("toolbox.forbiddenMarkers", contract.toolbox?.forbiddenMarkers ?? []);
    assertStringArray("helperScripts", contract.helperScripts, { allowEmpty: false });
    assertStringArray("listInvariants", contract.listInvariants, { allowEmpty: false });
    assertStringArray("helperCommandCoverageInvariants", contract.helperCommandCoverageInvariants, {
        allowEmpty: false,
    });
    assertStringArray("helperOwnership.ownedBy", contract.helperOwnership?.ownedBy, { allowEmpty: false });
    toolboxRelativePath("helperOwnership.inventoryPath", contract.helperOwnership?.inventoryPath);
    assertStringArray("helperOwnership.requiredOwnedScripts", contract.helperOwnership?.requiredOwnedScripts, {
        allowEmpty: false,
    });
    if (contract.wiring == null || typeof contract.wiring !== "object" || Array.isArray(contract.wiring)) {
        fail("wiring", "must be an object");
    } else {
        if (contract.wiring.makeTarget !== "operator-toolbox") {
            fail("wiring.makeTarget", `must be operator-toolbox, got ${contract.wiring.makeTarget ?? "(missing)"}`);
        }
        if (contract.wiring.enterpriseAuditId !== "operator-toolbox") {
            fail("wiring.enterpriseAuditId", `must be operator-toolbox, got ${contract.wiring.enterpriseAuditId ?? "(missing)"}`);
        }
        const checker = toolboxRelativePath("wiring.checker", contract.wiring.checker);
        if (checker !== "scripts/check-operator-toolbox.mjs") {
            fail("wiring.checker", `must be scripts/check-operator-toolbox.mjs, got ${contract.wiring.checker ?? "(missing)"}`);
        }
    }
    assertStringArray("requiredTargets", contract.requiredTargets, { allowEmpty: false });
    assertStringArray("makeHelpMustContain", contract.makeHelpMustContain, { allowEmpty: false });
    assertStringArray("supportingDocs", contract.supportingDocs, { allowEmpty: false });
    for (const [index, scriptPath] of (contract.helperScripts ?? []).entries()) {
        toolboxRelativePath(`helperScripts[${index}]`, scriptPath);
    }
    for (const [index, scriptPath] of (contract.helperOwnership?.requiredOwnedScripts ?? []).entries()) {
        toolboxRelativePath(`helperOwnership.requiredOwnedScripts[${index}]`, scriptPath);
    }
    for (const [index, docPath] of (contract.supportingDocs ?? []).entries()) {
        toolboxRelativePath(`supportingDocs[${index}]`, docPath);
    }
    if (!Array.isArray(contract.helperCommandCoverage) || contract.helperCommandCoverage.length === 0) {
        fail("helperCommandCoverage", "must be a non-empty array");
    }
    for (const [index, entry] of (contract.helperCommandCoverage ?? []).entries()) {
        const label = `helperCommandCoverage[${index}]`;
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) {
            fail(label, "must be an object");
            continue;
        }
        toolboxRelativePath(`${label}.script`, entry.script);
        assertNonEmptyString(`${label}.documentedCommand`, entry.documentedCommand);
    }
    if (!Array.isArray(contract.supportingDocMarkers)) {
        fail("supportingDocMarkers", "must be an array");
    }
    for (const [index, doc] of (contract.supportingDocMarkers ?? []).entries()) {
        const label = `supportingDocMarkers[${index}]`;
        if (doc == null || typeof doc !== "object" || Array.isArray(doc)) {
            fail(label, "must be an object");
            continue;
        }
        toolboxRelativePath(`${label}.path`, doc.path);
        assertStringArray(`${label}.mustContain`, doc.mustContain, { allowEmpty: false });
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Operator toolbox contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

failures = [];
const toolbox = readRelative(contract.toolbox.path, "toolbox.path");
includesAll(toolbox, contract.toolbox.mustContain, contract.toolbox.path);
for (const marker of contract.toolbox.forbiddenMarkers ?? []) {
    if (toolbox.includes(marker)) fail(contract.toolbox.path, `contains forbidden marker ${marker}`);
}

const listInvariants = new Set(contract.listInvariants ?? []);
for (const invariant of [
    "valid-schema-version",
    "valid-purpose",
    "safe-toolbox-paths",
    "typed-helper-lists",
    "typed-helper-command-coverage",
    "unique-helper-scripts",
    "unique-required-owned-scripts",
    "unique-required-targets",
    "unique-supporting-docs",
    "makefile-audit-wiring",
]) {
    if (!listInvariants.has(invariant)) fail("listInvariants", `missing invariant ${invariant}`);
}
assertUnique(contract.helperScripts, "helperScripts");
assertUnique(contract.helperOwnership?.requiredOwnedScripts, "helperOwnership.requiredOwnedScripts");
assertUnique(contract.requiredTargets, "requiredTargets");
assertUnique(contract.supportingDocs, "supportingDocs");
assertUnique(contract.toolbox?.mustContain, "toolbox.mustContain");
assertUnique(contract.toolbox?.forbiddenMarkers, "toolbox.forbiddenMarkers");
assertUnique(contract.helperCommandCoverageInvariants, "helperCommandCoverageInvariants");
assertUnique(contract.helperOwnership?.ownedBy, "helperOwnership.ownedBy");
assertUnique(contract.makeHelpMustContain, "makeHelpMustContain");

for (const scriptPath of contract.helperScripts ?? []) {
    const script = readRelative(scriptPath, scriptPath);
    includesAll(script, ["network", "commandsExecuted"], scriptPath);
}

if (contract.helperCommandCoverage) {
    const helperScripts = new Set(contract.helperScripts ?? []);
    const coveredScripts = new Set();
    const commandCoverageInvariants = new Set(contract.helperCommandCoverageInvariants ?? []);
    for (const invariant of ["no-extra-script-mappings", "no-duplicate-script-mappings"]) {
        if (!commandCoverageInvariants.has(invariant)) {
            fail("helperCommandCoverage", `missing invariant ${invariant}`);
        }
    }
    for (const entry of contract.helperCommandCoverage) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) continue;
        if (!helperScripts.has(entry.script)) {
            fail("helperCommandCoverage", `${entry.script} is not listed in helperScripts`);
        }
        if (coveredScripts.has(entry.script)) {
            fail("helperCommandCoverage", `${entry.script} has duplicate documented command coverage`);
        }
        coveredScripts.add(entry.script);
        const plannerTopic = plannerTopicFor(entry.script);
        if (plannerTopic) {
            const expectedPrefix = `node scripts/plan.mjs ${plannerTopic}`;
            if (!entry.documentedCommand?.startsWith(expectedPrefix)) {
                fail(
                    "helperCommandCoverage",
                    `${entry.script} documented command must start with ${JSON.stringify(expectedPrefix)}`,
                );
            }
        } else if (!entry.documentedCommand?.includes(entry.script)) {
            fail("helperCommandCoverage", `${entry.script} documented command does not include script path`);
        }
        if (!toolbox.includes(entry.documentedCommand)) {
            fail("helperCommandCoverage", `${entry.script} missing documented command ${entry.documentedCommand}`);
        }
    }
    for (const scriptPath of contract.helperScripts ?? []) {
        if (!coveredScripts.has(scriptPath)) {
            fail("helperCommandCoverage", `${scriptPath} has no documented command coverage`);
        }
    }
}

if (contract.helperOwnership) {
    const helperScripts = new Set(contract.helperScripts ?? []);
    const requiredOwnedScripts = contract.helperOwnership.requiredOwnedScripts ?? contract.helperScripts ?? [];
    for (const helperPath of requiredOwnedScripts) {
        if (!helperScripts.has(helperPath)) fail("helperOwnership", `${helperPath} is not listed in helperScripts`);
    }
    for (const helperPath of contract.helperScripts ?? []) {
        if (!requiredOwnedScripts.includes(helperPath)) {
            fail("helperOwnership", `${helperPath} is missing from requiredOwnedScripts`);
        }
    }
    for (const ownerField of ["reportGenerator.path", "entries[].reports"]) {
        if (!(contract.helperOwnership.ownedBy ?? []).includes(ownerField)) {
            fail("helperOwnership", `missing ownership source ${ownerField}`);
        }
    }
    const inventory = readJsonRelative(contract.helperOwnership.inventoryPath, "helperOwnership");
    const ownedHelpers = new Set();
    if (inventory?.reportGenerator?.path) ownedHelpers.add(inventory.reportGenerator.path);
    for (const entry of inventory?.entries ?? []) {
        for (const reportPath of entry.reports ?? []) ownedHelpers.add(reportPath);
    }
    for (const helperPath of requiredOwnedScripts) {
        if (!ownedHelpers.has(helperPath)) {
            fail("helperOwnership", `${helperPath} is not owned in ${contract.helperOwnership.inventoryPath}`);
        }
    }
}

const makefile = readRelative("Makefile");
for (const target of contract.requiredTargets ?? []) {
    if (!makefile.includes(`${target}:`)) fail("Makefile", `missing target ${target}`);
}
includesAll(makefile, contract.makeHelpMustContain, "Makefile help");

for (const docPath of contract.supportingDocs ?? []) {
    readRelative(docPath, docPath);
}

for (const doc of contract.supportingDocMarkers ?? []) {
    includesAll(readRelative(doc.path, doc.path), doc.mustContain, doc.path);
}

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes("./operator-toolbox.md")) fail("docs/README.md", "missing operator toolbox link");
if (!docsIndex.includes("./operator-toolbox-contract.json")) {
    fail("docs/README.md", "missing operator toolbox contract link");
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes("make operator-toolbox")) {
    fail("docs/quality-gates.md", "missing make operator-toolbox");
}

if (failures.length > 0) {
    console.error("Operator toolbox contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Operator toolbox contract passed");
