#!/usr/bin/env node
// check-generator-comparison: compares the corrected OpenAPI SDK method stamps
// against the generated TypeScript client methods so divergence between the
// curated spec surface and the generated client is caught before wrappers ship.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/generator-comparison-contract.json", "contract") ?? {};

function fail(message) {
    failures.push(message);
}

function isObject(value) {
    return value != null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
        fail(`${label}: must be a non-empty repo-relative path`);
        return "";
    }

    const normalized = path.normalize(relativePath).replace(/\\/g, "/");
    const segments = relativePath.split(/[\\/]+/);
    if (path.isAbsolute(relativePath) || segments.includes("..") || normalized.startsWith("../")) {
        fail(`${label}: must not escape the repository root: ${relativePath}`);
        return "";
    }

    return normalized;
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath === "") return "";

    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${label}: missing`);
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
        fail(`${label}: invalid JSON: ${error.message}`);
        return null;
    }
}

function assertObject(label, value) {
    if (!isObject(value)) {
        fail(`${label}: must be an object`);
        return false;
    }
    return true;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim() === "") {
        fail(`${label}: must be a non-empty string`);
        return false;
    }
    return true;
}

function assertPositiveInteger(label, value) {
    if (!Number.isInteger(value) || value < 1) {
        fail(`${label}: must be a positive integer`);
        return false;
    }
    return true;
}

function assertUnique(label, values) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    if (duplicates.length > 0) fail(`${label}: must be unique; duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

function assertStringArray(label, values, { min = 0 } = {}) {
    if (!Array.isArray(values)) {
        fail(`${label}: must be an array`);
        return [];
    }
    if (values.length < min) fail(`${label}: must contain at least ${min} item(s)`);
    for (const [index, value] of values.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
            fail(`${label}[${index}]: must be a non-empty string`);
        }
    }
    assertUnique(label, values);
    return values.filter((value) => typeof value === "string" && value.trim() !== "");
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    if (assertObject("operationInventory", contract.operationInventory)) {
        safeRelativePath("operationInventory.path", contract.operationInventory.path);
        assertNonEmptyString("operationInventory.arrayField", contract.operationInventory.arrayField);
        assertStringArray("operationInventory.requiredStampedFields", contract.operationInventory.requiredStampedFields, {
            min: 1,
        });
    }

    if (assertObject("generatedRoots", contract.generatedRoots)) {
        for (const [index, relativePath] of assertStringArray("generatedRoots.candidates", contract.generatedRoots.candidates, {
            min: 1,
        }).entries()) {
            safeRelativePath(`generatedRoots.candidates[${index}]`, relativePath);
        }
        safeRelativePath("generatedRoots.resourcesPath", contract.generatedRoots.resourcesPath);
    }

    if (assertObject("clientScan", contract.clientScan)) {
        safeRelativePath("clientScan.clientPath", contract.clientScan.clientPath);
        assertNonEmptyString("clientScan.methodRegex", contract.clientScan.methodRegex);
        try {
            new RegExp(contract.clientScan.methodRegex, "g");
        } catch (error) {
            fail(`clientScan.methodRegex: invalid regex: ${error.message}`);
        }
    }

    if (assertObject("thresholds", contract.thresholds)) {
        assertPositiveInteger("thresholds.minimumStampedOperations", contract.thresholds.minimumStampedOperations);
        assertPositiveInteger("thresholds.minimumGeneratedMethods", contract.thresholds.minimumGeneratedMethods);
    }

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
    console.error("generator comparison contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const inventory = readJson(contract.operationInventory.path, "operationInventory.path") ?? {};
const generatedRoot = contract.generatedRoots.candidates
    .map((candidate) => path.join(root, candidate))
    .find((candidate) => fs.existsSync(path.join(candidate, contract.generatedRoots.resourcesPath)));

if (!generatedRoot) {
    // output/ts-sdk and wrapper/src are both gitignored. On a fresh
    // clone without local SDK codegen, neither candidate exists; skip
    // the comparison rather than failing so non-SDK workflows (cli/mcp,
    // docs) can still run perfect-fast.
    console.warn(
        `Skipped: no generated TypeScript SDK root at ${contract.generatedRoots.candidates.join(" or ")}. ` +
        "Run `make sdk-codegen` to populate it.",
    );
} else {
    const methodsByGroup = new Map();
    const resourcesRoot = path.join(generatedRoot, contract.generatedRoots.resourcesPath);
    const methodRegex = new RegExp(contract.clientScan.methodRegex, "g");
    for (const group of fs.readdirSync(resourcesRoot)) {
        const clientPath = path.join(resourcesRoot, group, contract.clientScan.clientPath);
        if (!fs.existsSync(clientPath)) continue;
        const text = fs.readFileSync(clientPath, "utf8");
        const methods = new Set([...text.matchAll(methodRegex)].map((match) => match[1]));
        methodsByGroup.set(group, methods);
    }

    let stamped = 0;
    for (const op of inventory[contract.operationInventory.arrayField] ?? []) {
        if (!op.sdkGroup || !op.sdkMethod) continue;
        for (const field of contract.operationInventory.requiredStampedFields) {
            if (typeof op[field] !== "string" || op[field].trim() === "") {
                fail(`${op.operationId ?? "operation"}: stamped operation missing ${field}`);
            }
        }
        stamped += 1;
        const methods = methodsByGroup.get(op.sdkGroup);
        if (!methods) {
            fail(`${op.operationId}: generated group missing: ${op.sdkGroup}`);
            continue;
        }
        if (!methods.has(op.sdkMethod)) {
            fail(`${op.operationId}: generated method missing: client.${op.sdkGroup}.${op.sdkMethod}`);
        }
    }

    const generatedMethodCount = [...methodsByGroup.values()].reduce((total, methods) => total + methods.size, 0);
    if (stamped < contract.thresholds.minimumStampedOperations) {
        fail(`expected at least ${contract.thresholds.minimumStampedOperations} stamped SDK operations, got ${stamped}`);
    }
    if (generatedMethodCount < contract.thresholds.minimumGeneratedMethods) {
        fail(`expected at least ${contract.thresholds.minimumGeneratedMethods} generated SDK methods, got ${generatedMethodCount}`);
    }
    console.log(`Generator comparison inspected ${stamped} stamped operations against ${generatedMethodCount} generated methods in ${path.relative(root, generatedRoot)}.`);
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail(`Makefile missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail(`Makefile missing ${contract.wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail(`Makefile contract-gates missing ${contract.wiring.makeTarget}`);
}
for (const aggregateTarget of ["perfect-fast", "perfect-full"]) {
    const targetLine = makefile.split("\n").find((line) => line.startsWith(`${aggregateTarget}:`)) ?? "";
    if (!targetLine.includes(contract.wiring.makeTarget)) {
        fail(`Makefile ${aggregateTarget} missing ${contract.wiring.makeTarget}`);
    }
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

if (!readRelative("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${contract.wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${contract.wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("generator comparison contract failed");
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

console.log("generator comparison passed");
