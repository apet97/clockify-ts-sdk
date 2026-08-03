#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { isWiringTargetReachable } from "./lib/gate-targets.mjs";

const rootArgIndex = process.argv.indexOf("--root");
const root =
    rootArgIndex === -1
        ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
        : path.resolve(process.argv[rootArgIndex + 1] ?? "");
const failures = [];
const contract = readJson("docs/issue-intake-contract.json", "contractPath");

const issueFormTypes = new Set(["markdown", "input", "textarea", "dropdown", "checkboxes"]);

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
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

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(label, "must be an object");
        return false;
    }
    return true;
}

function parseYaml(label, text) {
    try {
        return YAML.parse(text);
    } catch (error) {
        fail(label, `invalid YAML: ${error.message}`);
        return null;
    }
}

function validateIssueForm(label, value, contractEntry) {
    if (!assertObject(label, value)) return null;
    assertNonEmptyString(`${label}.name`, value.name);
    assertNonEmptyString(`${label}.description`, value.description);
    if (!Array.isArray(value.body) || value.body.length === 0) {
        fail(`${label}.body`, "must be a non-empty array");
        return null;
    }

    const ids = new Set();
    const items = [];
    for (const [index, item] of value.body.entries()) {
        const itemLabel = `${label}.body[${index}]`;
        if (!assertObject(itemLabel, item)) continue;
        if (!issueFormTypes.has(item.type)) {
            fail(`${itemLabel}.type`, `unsupported issue-form type ${JSON.stringify(item.type)}`);
        }
        if (item.type !== "markdown") {
            assertNonEmptyString(`${itemLabel}.id`, item.id);
        }
        if (item.id !== undefined) {
            if (typeof item.id !== "string" || item.id.trim().length === 0) {
                fail(`${itemLabel}.id`, "must be a non-empty string");
            } else if (ids.has(item.id)) {
                if (contractEntry.forbiddenDuplicateIds) fail(label, `duplicate body id ${item.id}`);
            } else {
                ids.add(item.id);
            }
        }
        if (item.validations !== undefined) {
            if (!assertObject(`${itemLabel}.validations`, item.validations)) continue;
            if (item.validations.required !== undefined && typeof item.validations.required !== "boolean") {
                fail(`${itemLabel}.validations.required`, "must be boolean when present");
            }
        }
        if (item.type === "checkboxes") {
            const options = item.attributes?.options;
            if (!Array.isArray(options) || options.length === 0) {
                fail(`${itemLabel}.attributes.options`, "must be a non-empty array");
            } else {
                for (const [optionIndex, option] of options.entries()) {
                    const optionLabel = `${itemLabel}.attributes.options[${optionIndex}]`;
                    if (!assertObject(optionLabel, option)) continue;
                    assertNonEmptyString(`${optionLabel}.label`, option.label);
                    if (option.required !== undefined && typeof option.required !== "boolean") {
                        fail(`${optionLabel}.required`, "must be boolean when present");
                    }
                }
            }
        }
        items.push(item);
    }
    return { ids, items };
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(label, "must be an array");
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(label, "must be a non-empty array");
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(label, "contains non-string or empty entry");
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(label, `duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(safePath, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return {};
    }
}

function checkEntry(entry) {
    if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return;

    const text = readRelative(entry.path);
    const isYaml = typeof entry.path === "string" && entry.path.endsWith(".yml");
    const parsed = isYaml ? parseYaml(entry.path, text) : null;
    const markerText = isYaml && parsed !== null ? JSON.stringify(parsed) : text;
    for (const marker of entry.mustContain ?? []) {
        if (!markerText.includes(marker)) fail(entry.path, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (markerText.includes(marker)) fail(entry.path, `contains forbidden marker ${marker}`);
    }

    const isIssueForm = isYaml && !entry.path.endsWith("/config.yml") && entry.requiredBodyIds !== undefined;
    if (isIssueForm && parsed !== null) {
        const formResult = validateIssueForm(entry.path, parsed, entry);
        if (formResult === null) return;

        const bodyItems = formResult.items.filter(
            (item) => item.type !== "checkboxes" && item.type !== "markdown",
        );
        const checkboxItems = formResult.items.filter((item) => item.type === "checkboxes");
        const bodyIds = new Set(bodyItems.map((item) => item.id));
        const checkboxIds = new Set(checkboxItems.map((item) => item.id));
        const requiredBodyIds = entry.requiredBodyIds ?? [];
        const optionalBodyIds = entry.optionalBodyIds ?? [];
        for (const id of requiredBodyIds) {
            const item = bodyItems.find((candidate) => candidate.id === id);
            if (!item) {
                fail(entry.path, `required body id ${id} is missing`);
            } else if (item.validations?.required !== true) {
                fail(entry.path, `required body id ${id} must have validations.required: true`);
            }
        }
        for (const id of optionalBodyIds) {
            if (!bodyIds.has(id)) {
                fail(entry.path, `optional body id ${id} is missing`);
            } else if (bodyItems.find((item) => item.id === id)?.validations?.required === true) {
                fail(entry.path, `optional body id ${id} must not be required`);
            }
        }
        const governedBodyIds = new Set([...requiredBodyIds, ...optionalBodyIds]);
        for (const id of bodyIds) {
            if (!governedBodyIds.has(id)) fail(entry.path, `unexpected body id ${id}`);
        }
        for (const id of entry.requiredCheckboxIds ?? []) {
            if (!checkboxIds.has(id)) fail(entry.path, `required checkbox id ${id} is missing`);
        }
        for (const id of checkboxIds) {
            if (!(entry.requiredCheckboxIds ?? []).includes(id)) {
                fail(entry.path, `unexpected checkbox id ${id}`);
            }
        }
    }
}

function includesAll(text, markers, label) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(label, `missing marker ${JSON.stringify(marker)}`);
    }
}

function validateMarkerEntry(label, entry) {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const mustContain = assertStringArray(`${label}.mustContain`, entry.mustContain, {
        allowEmpty: false,
    });
    assertUnique(`${label}.mustContain`, mustContain);
    const forbiddenMarkers = assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers ?? []);
    assertUnique(`${label}.forbiddenMarkers`, forbiddenMarkers);
}

function validateFormContract(label, entry) {
    if (!entry.path?.endsWith(".yml") || entry.path.endsWith("/config.yml")) return;
    const requiredBodyIds = assertStringArray(`${label}.requiredBodyIds`, entry.requiredBodyIds, {
        allowEmpty: false,
    });
    const optionalBodyIds = assertStringArray(`${label}.optionalBodyIds`, entry.optionalBodyIds ?? []);
    const requiredCheckboxIds = assertStringArray(`${label}.requiredCheckboxIds`, entry.requiredCheckboxIds, {
        allowEmpty: false,
    });
    if (typeof entry.forbiddenDuplicateIds !== "boolean") {
        fail(`${label}.forbiddenDuplicateIds`, "must be boolean");
    }
    assertUnique(`${label}.requiredBodyIds`, requiredBodyIds);
    assertUnique(`${label}.optionalBodyIds`, optionalBodyIds);
    assertUnique(`${label}.requiredCheckboxIds`, requiredCheckboxIds);
    const required = new Set(requiredBodyIds);
    for (const id of optionalBodyIds) {
        if (required.has(id)) fail(label, `body id ${id} cannot be both required and optional`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("policyDocument", contract.policyDocument);
    for (const section of ["templates", "supportingEvidence"]) {
        if (!Array.isArray(contract[section]) || contract[section].length === 0) {
            fail(section, "must be a non-empty array");
            continue;
        }
        assertUnique(
            `${section}.path`,
            contract[section].map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
        );
        for (const [index, entry] of contract[section].entries()) {
            validateMarkerEntry(`${section}[${index}]`, entry);
            if (section === "templates") validateFormContract(`${section}[${index}]`, entry);
        }
    }
    const readinessContextFields = assertStringArray("readinessContextFields", contract.readinessContextFields, {
        allowEmpty: false,
    });
    assertUnique("readinessContextFields", readinessContextFields);
    const quickstartDiagnosticsFields = assertStringArray("quickstartDiagnosticsFields", contract.quickstartDiagnosticsFields, {
        allowEmpty: false,
    });
    assertUnique("quickstartDiagnosticsFields", quickstartDiagnosticsFields);

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        const docsIndex = assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, {
            allowEmpty: false,
        });
        assertUnique("wiring.docsIndex", docsIndex);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.supportBundleCommand", contract.wiring.supportBundleCommand);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Issue intake contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const section of ["templates", "supportingEvidence"]) {
    for (const entry of contract[section] ?? []) checkEntry(entry);
}

const readinessContextFields = contract.readinessContextFields ?? [];
for (const pathWithReadinessContext of [
    contract.policyDocument?.path,
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/pull_request_template.md",
]) {
    if (!pathWithReadinessContext) continue;
    includesAll(readRelative(pathWithReadinessContext), readinessContextFields, pathWithReadinessContext);
}

const quickstartDiagnosticsFields = contract.quickstartDiagnosticsFields ?? [];
for (const pathWithQuickstartDiagnostics of [
    contract.policyDocument?.path,
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/pull_request_template.md",
]) {
    if (!pathWithQuickstartDiagnostics) continue;
    includesAll(
        readRelative(pathWithQuickstartDiagnostics),
        quickstartDiagnosticsFields,
        pathWithQuickstartDiagnostics,
    );
}

const wiring = contract.wiring ?? {};
const makefile = readRelative("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
if (!isWiringTargetReachable(makefile, "contract-gates", wiring)) {
    fail("Makefile", `contract-gates cannot reach ${wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);
}
if (wiring.supportBundleCommand && !readRelative("docs/issue-intake-policy.md").includes(wiring.supportBundleCommand)) {
    fail("docs/issue-intake-policy.md", `missing ${wiring.supportBundleCommand}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Issue intake contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Issue intake contract passed");
