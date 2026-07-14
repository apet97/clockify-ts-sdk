#!/usr/bin/env node
// check-generator-independence: ensures generated output remains behind wrapper seams.
// Forbids CLI/MCP imports from output/ts-sdk/** and wrapper/src/** and pins the
// local-generator allowlist so SDK product behavior stays in hand-written wrappers.
// CLI/MCP local development uses the npm workspace link (devDependency: "*"); the
// runtime peer dependency is the published SDK package name.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/generator-independence-contract.json", "contract") ?? {};

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

function read(relativePath, label = relativePath) {
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
    const text = read(relativePath, label);
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

function validateFileInputs() {
    if (!assertObject("files", contract.files)) return;
    for (const key of [
        "wrapperPackage",
        "cliPackage",
        "mcpPackage",
        "productSurface",
        "localGenerator",
        "syncScript",
        "generatedCoreDecision",
    ]) {
        safeRelativePath(`files.${key}`, contract.files[key]);
    }
}

function walkFiles(relativeDir) {
    const safeDir = safeRelativePath("postgenEscapeHatch.scannedScriptDirs", relativeDir);
    if (safeDir === "") return [];
    const absoluteDir = path.join(root, safeDir);
    if (!fs.existsSync(absoluteDir)) return [];

    const files = [];
    const stack = [absoluteDir];
    while (stack.length > 0) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
            continue;
        }
        files.push(path.relative(root, current).replace(/\\/g, "/"));
    }
    return files;
}

function includesAll(label, text, markers) {
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(`${label}: missing marker ${marker}`);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateFileInputs();

    if (assertObject("localGenerator", contract.localGenerator)) {
        safeRelativePath("localGenerator.inputOpenApi", contract.localGenerator.inputOpenApi);
        safeRelativePath("localGenerator.outputPath", contract.localGenerator.outputPath);
    }

    if (assertObject("wrapperPackage", contract.wrapperPackage)) {
        assertStringArray("wrapperPackage.forbiddenFiles", contract.wrapperPackage.forbiddenFiles, { min: 1 });
        assertStringArray("wrapperPackage.forbiddenFilePrefixes", contract.wrapperPackage.forbiddenFilePrefixes, {
            min: 1,
        });
        assertStringArray("wrapperPackage.forbiddenExportMarkers", contract.wrapperPackage.forbiddenExportMarkers, {
            min: 1,
        });
    }

    if (assertObject("packageDependencies", contract.packageDependencies)) {
        assertNonEmptyString("packageDependencies.sdkPackageName", contract.packageDependencies.sdkPackageName);
        assertNonEmptyString("packageDependencies.devDependencyValue", contract.packageDependencies.devDependencyValue);
        assertStringArray("packageDependencies.consumers", contract.packageDependencies.consumers, { min: 1 });
    }

    if (assertObject("sourceScan", contract.sourceScan)) {
        for (const [index, target] of assertStringArray("sourceScan.targets", contract.sourceScan.targets, { min: 1 }).entries()) {
            safeRelativePath(`sourceScan.targets[${index}]`, target);
        }
        assertStringArray("sourceScan.extensions", contract.sourceScan.extensions, { min: 1 });
        assertNonEmptyString("sourceScan.forbiddenGeneratedMarker", contract.sourceScan.forbiddenGeneratedMarker);
        assertNonEmptyString("sourceScan.forbiddenWrapperSrcMarker", contract.sourceScan.forbiddenWrapperSrcMarker);
        assertNonEmptyString("sourceScan.wrapperSrcAllowedTarget", contract.sourceScan.wrapperSrcAllowedTarget);
    }

    if (assertObject("productSurfacePolicy", contract.productSurfacePolicy)) {
        assertNonEmptyString("productSurfacePolicy.generatedCore", contract.productSurfacePolicy.generatedCore);
        assertNonEmptyString("productSurfacePolicy.handwrittenSdkLayer", contract.productSurfacePolicy.handwrittenSdkLayer);
    }

    if (assertObject("postgenEscapeHatch", contract.postgenEscapeHatch)) {
        const allowedScripts = assertStringArray(
            "postgenEscapeHatch.allowedGeneratedMutationScripts",
            contract.postgenEscapeHatch.allowedGeneratedMutationScripts,
            { min: 1 },
        );
        for (const [index, scriptPath] of allowedScripts.entries()) {
            safeRelativePath(`postgenEscapeHatch.allowedGeneratedMutationScripts[${index}]`, scriptPath);
        }
        const scannedDirs = assertStringArray(
            "postgenEscapeHatch.scannedScriptDirs",
            contract.postgenEscapeHatch.scannedScriptDirs,
            { min: 1 },
        );
        for (const [index, dirPath] of scannedDirs.entries()) {
            safeRelativePath(`postgenEscapeHatch.scannedScriptDirs[${index}]`, dirPath);
        }
        assertStringArray(
            "postgenEscapeHatch.forbiddenScriptNameFragments",
            contract.postgenEscapeHatch.forbiddenScriptNameFragments,
            { min: 1 },
        );
        assertStringArray("postgenEscapeHatch.decisionMarkers", contract.postgenEscapeHatch.decisionMarkers, {
            min: 1,
        });
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
    console.error("generator independence contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const wrapperPkg = readJson(contract.files.wrapperPackage, "files.wrapperPackage") ?? {};
const packageManifests = {
    cli: readJson(contract.files.cliPackage, "files.cliPackage") ?? {},
    mcp: readJson(contract.files.mcpPackage, "files.mcpPackage") ?? {},
};
const productSurface = readJson(contract.files.productSurface, "files.productSurface") ?? {};
const localGenerator = read(contract.files.localGenerator, "files.localGenerator");
const localGeneratorConstants = read("scripts/sdk-codegen/constants.mjs", "files.localGeneratorConstants");

for (const marker of [contract.localGenerator.inputOpenApi, contract.localGenerator.outputPath]) {
    if (!`${localGenerator}\n${localGeneratorConstants}`.includes(marker)) {
        fail(`local generator must reference ${marker}`);
    }
}
if (!fs.existsSync(path.join(root, contract.files.syncScript))) fail(`${contract.files.syncScript} is missing`);

for (const file of wrapperPkg.files ?? []) {
    if (
        contract.wrapperPackage.forbiddenFiles.includes(file) ||
        contract.wrapperPackage.forbiddenFilePrefixes.some((prefix) => file.startsWith(prefix))
    ) {
        fail("wrapper package files must not ship generated src");
    }
}
for (const [subpath, target] of Object.entries(wrapperPkg.exports ?? {})) {
    const raw = JSON.stringify(target);
    for (const marker of contract.wrapperPackage.forbiddenExportMarkers) {
        if (raw.includes(marker)) fail(`wrapper export ${subpath} points at generated src`);
    }
}

for (const name of contract.packageDependencies.consumers) {
    const pkg = packageManifests[name];
    const peer = pkg.peerDependencies?.[contract.packageDependencies.sdkPackageName];
    const dev = pkg.devDependencies?.[contract.packageDependencies.sdkPackageName];
    if (!peer) fail(`${name}: missing ${contract.packageDependencies.sdkPackageName} peerDependency`);
    if (dev !== contract.packageDependencies.devDependencyValue) {
        fail(`${name}: devDependency must point at ${contract.packageDependencies.devDependencyValue}`);
    }
}

for (const target of contract.sourceScan.targets) {
    const absolute = path.join(root, target);
    if (!fs.existsSync(absolute)) continue;
    const stack = [absolute];
    while (stack.length > 0) {
        const current = stack.pop();
        const stat = fs.statSync(current);
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
            continue;
        }
        if (!contract.sourceScan.extensions.some((extension) => current.endsWith(extension))) continue;
        const text = fs.readFileSync(current, "utf8");
        if (text.includes(contract.sourceScan.forbiddenGeneratedMarker)) {
            fail(`${path.relative(root, current)} imports ${contract.sourceScan.forbiddenGeneratedMarker}`);
        }
        if (
            target !== contract.sourceScan.wrapperSrcAllowedTarget &&
            text.includes(contract.sourceScan.forbiddenWrapperSrcMarker)
        ) {
            fail(`${path.relative(root, current)} imports ${contract.sourceScan.forbiddenWrapperSrcMarker}`);
        }
    }
}

if (productSurface.sourcePolicy.generatedCore !== contract.productSurfacePolicy.generatedCore) {
    fail(`product surface generatedCore must name ${contract.productSurfacePolicy.generatedCore}`);
}
if (productSurface.sourcePolicy.handwrittenSdkLayer !== contract.productSurfacePolicy.handwrittenSdkLayer) {
    fail(`product surface handwritten layer must name ${contract.productSurfacePolicy.handwrittenSdkLayer}`);
}

const generatedCoreDecision = read(contract.files.generatedCoreDecision, "files.generatedCoreDecision");
includesAll("files.generatedCoreDecision", generatedCoreDecision, contract.postgenEscapeHatch.decisionMarkers);

const allowedGeneratedMutationScripts = new Set(contract.postgenEscapeHatch.allowedGeneratedMutationScripts);
const forbiddenScriptNameFragments = contract.postgenEscapeHatch.forbiddenScriptNameFragments.map((fragment) =>
    fragment.toLowerCase(),
);
for (const scriptDir of contract.postgenEscapeHatch.scannedScriptDirs) {
    for (const scriptPath of walkFiles(scriptDir)) {
        if (allowedGeneratedMutationScripts.has(scriptPath)) continue;
        const lowerPath = scriptPath.toLowerCase();
        const matchedFragment = forbiddenScriptNameFragments.find((fragment) => lowerPath.includes(fragment));
        if (matchedFragment) {
            fail(`${scriptPath}: generated-output mutator name contains unregistered escape hatch marker ${matchedFragment}`);
        }
    }
}

const makefile = read("Makefile");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail(`Makefile missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail(`Makefile missing ${contract.wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail(`Makefile contract-gates missing ${contract.wiring.makeTarget}`);
}

const docsIndex = read("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail(`docs/README.md missing ${requiredDoc}`);
}

if (!read("docs/quality-gates.md").includes(contract.wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${contract.wiring.qualityGate}`);
}
if (!read("docs/contract-inventory.json").includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${contract.wiring.inventoryId}`);
}
if (!read("docs/enterprise-hardening-audit.json").includes(`"id": "${contract.wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("generator independence contract failed");
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

console.log("generator independence check passed: generated core is isolated behind wrapper/package seams");
