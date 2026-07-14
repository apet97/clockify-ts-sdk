#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/diagnostics-contract.json");

function fail(file, message) {
    failures.push(`${file}: ${message}`);
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
        fail(safePath, "missing file");
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function readJson(relativePath, label = relativePath) {
    const text = readRelative(relativePath, label);
    if (!text) return {};
    return JSON.parse(text);
}

function validatePolicyDocument() {
    if (!assertObject("policyDocument", contract.policyDocument)) return;
    safeRelativePath("policyDocument.path", contract.policyDocument.path);
    const contains = assertStringArray("policyDocument.contains", contract.policyDocument.contains, {
        allowEmpty: false,
    });
    assertUnique("policyDocument.contains", contains);
    const forbiddenMarkers = assertStringArray(
        "policyDocument.forbiddenMarkers",
        contract.policyDocument.forbiddenMarkers ?? [],
    );
    assertUnique("policyDocument.forbiddenMarkers", forbiddenMarkers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validatePolicyDocument();

    if (!Array.isArray(contract.surfaces) || contract.surfaces.length === 0) {
        fail("surfaces", "must be a non-empty array");
    }
    assertUnique(
        "surfaces.id",
        (contract.surfaces ?? []).map((surface) => surface?.id).filter((id) => typeof id === "string"),
    );
    for (const [surfaceIndex, surface] of (contract.surfaces ?? []).entries()) {
        const surfaceLabel = surface?.id ?? `surfaces[${surfaceIndex}]`;
        if (!assertObject(surfaceLabel, surface)) continue;
        assertNonEmptyString(`${surfaceLabel}.id`, surface.id);
        if (!Array.isArray(surface.files) || surface.files.length === 0) {
            fail(`${surfaceLabel}.files`, "must be a non-empty array");
            continue;
        }
        assertUnique(
            `${surfaceLabel}.files.path`,
            surface.files.map((file) => file?.path).filter((filePath) => typeof filePath === "string"),
        );
        for (const [fileIndex, file] of surface.files.entries()) {
            const fileLabel = `${surfaceLabel}.files[${fileIndex}]`;
            if (!assertObject(fileLabel, file)) continue;
            safeRelativePath(`${fileLabel}.path`, file.path);
            const contains = assertStringArray(`${fileLabel}.contains`, file.contains, {
                allowEmpty: false,
            });
            assertUnique(`${fileLabel}.contains`, contains);
        }
    }

    if (!Array.isArray(contract.noNetworkEvidence) || contract.noNetworkEvidence.length === 0) {
        fail("noNetworkEvidence", "must be a non-empty array");
    }
    assertUnique(
        "noNetworkEvidence.path",
        (contract.noNetworkEvidence ?? [])
            .map((file) => file?.path)
            .filter((filePath) => typeof filePath === "string"),
    );
    for (const [fileIndex, file] of (contract.noNetworkEvidence ?? []).entries()) {
        const fileLabel = `noNetworkEvidence[${fileIndex}]`;
        if (!assertObject(fileLabel, file)) continue;
        safeRelativePath(`${fileLabel}.path`, file.path);
        const contains = assertStringArray(`${fileLabel}.contains`, file.contains, {
            allowEmpty: false,
        });
        assertUnique(`${fileLabel}.contains`, contains);
        const forbiddenContains = assertStringArray(`${fileLabel}.forbiddenContains`, file.forbiddenContains, {
            allowEmpty: false,
        });
        assertUnique(`${fileLabel}.forbiddenContains`, forbiddenContains);
    }

    const forbiddenSecretPatterns = assertStringArray(
        "forbiddenSecretPatterns",
        contract.forbiddenSecretPatterns,
        { allowEmpty: false },
    );
    assertUnique("forbiddenSecretPatterns", forbiddenSecretPatterns);

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertNonEmptyString("wiring.docsIndexPolicy", contract.wiring.docsIndexPolicy);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("Diagnostics contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const policy = contract.policyDocument;
const policyText = readRelative(policy.path);
for (const marker of policy.contains ?? []) {
    if (!policyText.includes(marker)) fail(policy.path, `missing marker ${marker}`);
}

for (const surface of contract.surfaces ?? []) {
    for (const file of surface.files ?? []) {
        const text = readRelative(file.path);
        for (const marker of file.contains ?? []) {
            if (!text.includes(marker)) fail(file.path, `missing ${surface.id} marker ${marker}`);
        }
        for (const pattern of contract.forbiddenSecretPatterns ?? []) {
            if (text.includes(pattern)) fail(file.path, `contains forbidden secret-like fixture ${pattern}`);
        }
    }
}

for (const file of contract.noNetworkEvidence ?? []) {
    const text = readRelative(file.path);
    for (const marker of file.contains ?? []) {
        if (!text.includes(marker)) fail(file.path, `missing no-network marker ${marker}`);
    }
    for (const marker of file.forbiddenContains ?? []) {
        if (text.includes(marker)) fail(file.path, `contains forbidden network/client marker ${marker}`);
    }
}

const sdkPublicApi = readJson("docs/sdk-public-api.json");
if (!sdkPublicApi.rootSymbols?.includes("clockifyDiagnostics")) {
    fail("docs/sdk-public-api.json", "rootSymbols missing clockifyDiagnostics");
}
if (!sdkPublicApi.subpaths?.["./diagnostics"]?.includes("clockifyDiagnostics")) {
    fail("docs/sdk-public-api.json", "./diagnostics subpath missing clockifyDiagnostics");
}

const cliCommands = readJson("docs/cli-commands.json");
if (!cliCommands.commands?.some((command) => command.command === "clk115 doctor")) {
    fail("docs/cli-commands.json", "missing clk115 doctor command");
}

const mcpContract = readJson("docs/mcp-contract.json");
if (!mcpContract.expected?.resources?.includes("clockify://mcp/doctor")) {
    fail("docs/mcp-contract.json", "expected resources missing clockify://mcp/doctor");
}

const productSurface = readJson("docs/product-surface.json");
const statusWorkflow = productSurface.workflows?.find((workflow) => workflow.id === "status");
for (const [field, marker] of [
    ["sdk", "clockifyDiagnostics"],
    ["cli", "clk115 doctor"],
    ["tsMcp", "clockify://mcp/doctor"],
]) {
    if (!statusWorkflow?.[field]?.includes(marker)) {
        fail("docs/product-surface.json", `status workflow ${field} missing ${marker}`);
    }
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
if (!makefile.includes(`node ${wiring.checker}`)) {
    fail("Makefile", "diagnostics target does not run checker");
}
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(wiring.makeTarget)) fail("Makefile", `contract-gates missing ${wiring.makeTarget}`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes(wiring.docsIndexPolicy)) fail("docs/README.md", "missing diagnostics policy row");
if (!docsIndex.includes(wiring.docsIndexContract)) fail("docs/README.md", "missing diagnostics contract row");

const docIndexChecker = readRelative("scripts/check-doc-index.mjs");
if (!docIndexChecker.includes(wiring.docsIndexPolicy)) {
    fail("scripts/check-doc-index.mjs", "missing diagnostics policy requirement");
}
if (!docIndexChecker.includes(wiring.docsIndexContract)) {
    fail("scripts/check-doc-index.mjs", "missing diagnostics contract requirement");
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Diagnostics contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Diagnostics contract passed");
