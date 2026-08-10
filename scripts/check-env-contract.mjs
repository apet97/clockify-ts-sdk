#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { isWiringTargetReachable } from "./lib/gate-targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/env-contract.json", "contract") ?? {};
const UNKNOWN_RC_KEY_POLICY =
    "For each unknown rc-file key, the CLI writes one warning to stderr, names the nearest known key, ignores the unknown key, and continues.";

function fail(variable, message) {
    failures.push(`${variable}: ${message}`);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(label, "must be a non-empty repo-relative path");
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(label, `must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(label, "missing");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (text === "") return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        fail(label, `invalid JSON: ${error.message}`);
        return null;
    }
}

function readStringTupleConstant(source, constantName, label) {
    const sourceFile = ts.createSourceFile(
        "config.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const declarations = sourceFile.statements
        .filter(
            (statement) =>
                ts.isVariableStatement(statement) &&
                (statement.declarationList.flags & ts.NodeFlags.Const) !== 0,
        )
        .flatMap((statement) => statement.declarationList.declarations)
        .filter(
            (declaration) =>
                ts.isIdentifier(declaration.name) && declaration.name.text === constantName,
        );
    if (declarations.length !== 1) {
        fail(label, `missing string tuple constant ${constantName}`);
        return [];
    }

    const initializer = declarations[0].initializer;
    if (
        !initializer ||
        !ts.isAsExpression(initializer) ||
        initializer.type.getText(sourceFile) !== "const" ||
        !ts.isArrayLiteralExpression(initializer.expression)
    ) {
        fail(label, `${constantName} must be a string tuple declared with as const`);
        return [];
    }

    const values = initializer.expression.elements.map((element) =>
        ts.isStringLiteral(element) ? element.text : null,
    );
    if (values.some((value) => value == null)) {
        fail(label, `${constantName} must contain only string literals`);
        return [];
    }
    return assertStringArray(label, values, { min: 1 });
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

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(label, "must be a boolean");
        return false;
    }
    return true;
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value <= 0) {
        fail(label, "must be a positive integer");
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

function validateVariable(index, variable) {
    const label = `variables[${index}]`;
    if (!assertObject(label, variable)) return;
    assertNonEmptyString(`${label}.name`, variable.name);
    assertStringArray(`${label}.surfaces`, variable.surfaces, { min: 1 });
    assertBoolean(`${label}.secret`, variable.secret);
    assertStringArray(`${label}.requiredFor`, variable.requiredFor, { min: 1 });
    for (const [evidenceIndex, evidencePath] of assertStringArray(`${label}.evidence`, variable.evidence, {
        min: 1,
    }).entries()) {
        safeRelativePath(`${label}.evidence[${evidenceIndex}]`, evidencePath);
    }
    if (variable.mustMentionSafety != null) assertBoolean(`${label}.mustMentionSafety`, variable.mustMentionSafety);
}

function validateRcFile() {
    if (!assertObject("rcFile", contract.rcFile)) return;
    safeRelativePath("rcFile.source", contract.rcFile.source);
    assertNonEmptyString("rcFile.knownKeysConstant", contract.rcFile.knownKeysConstant);
    const knownKeys = assertStringArray("rcFile.knownKeys", contract.rcFile.knownKeys, { min: 1 });
    if (
        assertPositiveInteger("rcFile.expectedKnownKeyCount", contract.rcFile.expectedKnownKeyCount) &&
        contract.rcFile.expectedKnownKeyCount !== knownKeys.length
    ) {
        fail(
            "rcFile.expectedKnownKeyCount",
            `expected ${contract.rcFile.expectedKnownKeyCount} keys, found ${knownKeys.length}`,
        );
    }
    if (contract.rcFile.unknownKeyPolicy !== UNKNOWN_RC_KEY_POLICY) {
        fail("rcFile.unknownKeyPolicy", `must be ${JSON.stringify(UNKNOWN_RC_KEY_POLICY)}`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);

    validateRcFile();
    if (!Array.isArray(contract.variables) || contract.variables.length === 0) {
        fail("variables", "must be a non-empty array");
    }
    for (const [index, variable] of (contract.variables ?? []).entries()) validateVariable(index, variable);
    assertUnique(
        "variables.name",
        (contract.variables ?? []).map((variable) => variable?.name).filter((name) => typeof name === "string"),
    );
    assertStringArray("requiredSafetyMarkers", contract.requiredSafetyMarkers, { min: 1 });

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("environment contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const rcFileSource = readRelative(contract.rcFile.source, "rcFile.source");
const sourceRcFileKeys = readStringTupleConstant(
    rcFileSource,
    contract.rcFile.knownKeysConstant,
    "rcFile.knownKeys",
);
if (JSON.stringify(sourceRcFileKeys) !== JSON.stringify(contract.rcFile.knownKeys)) {
    fail(
        "rcFile.knownKeys",
        `expected ${JSON.stringify(contract.rcFile.knownKeys)} but source declares ${JSON.stringify(sourceRcFileKeys)}`,
    );
}

for (const variable of contract.variables ?? []) {
    let combinedEvidenceText = "";
    for (const evidencePath of variable.evidence ?? []) {
        const text = readRelative(evidencePath, variable.name);
        combinedEvidenceText += `\n${text}`;
        if (!text.includes(variable.name)) {
            fail(variable.name, `${evidencePath} does not mention ${variable.name}`);
        }
    }

    if (variable.mustMentionSafety) {
        for (const marker of contract.requiredSafetyMarkers ?? []) {
            if (!combinedEvidenceText.toLowerCase().includes(marker.toLowerCase())) {
                fail(variable.name, `combined evidence missing safety marker ${JSON.stringify(marker)}`);
            }
        }
    }
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
if (!isWiringTargetReachable(makefile, "contract-gates", contract.wiring)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("environment contract check failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `environment contract passed (${contract.variables.length} variables, ${contract.rcFile.knownKeys.length} rc-file keys)`,
);
