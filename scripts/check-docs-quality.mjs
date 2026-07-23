#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/docs-quality-contract.json", "contract") ?? {};

function fail(id, message) {
    failures.push(`${id}: ${message}`);
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

function validateEntryShape(label, entry, { requireId = false } = {}) {
    if (!assertObject(label, entry)) return;
    if (requireId) assertNonEmptyString(`${label}.id`, entry.id);
    safeRelativePath(`${label}.path`, entry.path);
    assertStringArray(`${label}.mustContain`, entry.mustContain, { min: 1 });
    assertStringArray(`${label}.forbiddenMarkers`, entry.forbiddenMarkers, { required: false });
}

function validateEntryCollection(label, entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        fail(label, "must be a non-empty array");
        return;
    }
    for (const [index, entry] of entries.entries()) {
        validateEntryShape(`${label}[${index}]`, entry, options);
    }
    assertUnique(
        `${label}.path`,
        entries.map((entry) => entry?.path).filter((entryPath) => typeof entryPath === "string"),
    );
    if (options.requireId) {
        assertUnique(
            `${label}.id`,
            entries.map((entry) => entry?.id).filter((entryId) => typeof entryId === "string"),
        );
    }
}

function validateProductSurfaceClaims() {
    if (!assertObject("productSurfaceClaims", contract.productSurfaceClaims)) return;
    safeRelativePath("productSurfaceClaims.path", contract.productSurfaceClaims.path);
    assertStringArray("productSurfaceClaims.requiredWorkflowFields", contract.productSurfaceClaims.requiredWorkflowFields, {
        min: 1,
    });
    assertStringArray("productSurfaceClaims.surfaceAvailabilityFields", contract.productSurfaceClaims.surfaceAvailabilityFields, {
        min: 1,
    });
    assertStringArray(
        "productSurfaceClaims.emptySurfaceRequiresIntentionalGap",
        contract.productSurfaceClaims.emptySurfaceRequiresIntentionalGap,
        { min: 1 },
    );
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateEntryShape("policyDocument", contract.policyDocument);
    validateEntryCollection("keyDocuments", contract.keyDocuments, { requireId: true });
    validateEntryCollection("supportingEvidence", contract.supportingEvidence);

    for (const field of ["generatedTruthSurfaces", "scanPaths"]) {
        for (const [index, relativePath] of assertStringArray(field, contract[field], { min: 1 }).entries()) {
            safeRelativePath(`${field}[${index}]`, relativePath);
        }
    }

    validateProductSurfaceClaims();

    for (const [index, pattern] of assertStringArray(
        "forbiddenUnsupportedClaims",
        contract.forbiddenUnsupportedClaims,
        { min: 1 },
    ).entries()) {
        try {
            new RegExp(pattern, "i");
        } catch (error) {
            fail(`forbiddenUnsupportedClaims[${index}]`, `invalid regex: ${error.message}`);
        }
    }

    if (assertObject("wiring", contract.wiring)) {
        for (const key of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
            assertNonEmptyString(`wiring.${key}`, contract.wiring[key]);
        }
        safeRelativePath("wiring.checker", contract.wiring.checker);
        assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, { min: 1 });
        assertNonEmptyString("wiring.uniqueClaimInventory", contract.wiring.uniqueClaimInventory);
    }
}

function checkEntry(entry) {
    const text = readRelative(entry.path);
    for (const marker of entry.mustContain ?? []) {
        if (!text.includes(marker)) fail(entry.id ?? entry.path, `${entry.path} missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of entry.forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(entry.id ?? entry.path, `${entry.path} contains forbidden marker ${marker}`);
    }
}

function checkProductSurfaceClaims() {
    const claims = contract.productSurfaceClaims ?? {};
    const surface = readJson(claims.path, "productSurfaceClaims.path") ?? {};
    if (!Array.isArray(surface.workflows) || surface.workflows.length === 0) {
        fail(claims.path, "workflows must be a non-empty array");
        return;
    }

    for (const workflow of surface.workflows) {
        const workflowId = workflow?.id ?? "(missing id)";
        for (const field of claims.requiredWorkflowFields ?? []) {
            if (field === "surfaceAvailability") {
                if (!isObject(workflow.surfaceAvailability)) {
                    fail(claims.path, `${workflowId}.surfaceAvailability must be an object`);
                    continue;
                }
                for (const surfaceName of claims.surfaceAvailabilityFields ?? []) {
                    if (typeof workflow.surfaceAvailability[surfaceName] !== "string" || workflow.surfaceAvailability[surfaceName].trim() === "") {
                        fail(claims.path, `${workflowId}.surfaceAvailability.${surfaceName} must be a non-empty string`);
                    }
                }
                continue;
            }
            if (field === "proofMode") {
                if (typeof workflow.proofMode !== "string" || workflow.proofMode.trim() === "") {
                    fail(claims.path, `${workflowId}.proofMode must be a non-empty string`);
                }
                continue;
            }
            if (!Array.isArray(workflow[field])) {
                fail(claims.path, `${workflowId}.${field} must be an array`);
                continue;
            }
            if (["proof", "recovery"].includes(field) && workflow[field].length === 0) {
                fail(claims.path, `${workflowId}.${field} must be a non-empty array`);
            }
        }

        for (const surfaceName of claims.emptySurfaceRequiresIntentionalGap ?? []) {
            if (Array.isArray(workflow[surfaceName]) && workflow[surfaceName].length === 0) {
                if (!Array.isArray(workflow.intentionalGaps) || workflow.intentionalGaps.length === 0) {
                    fail(claims.path, `${workflowId}.${surfaceName} is empty and needs an intentionalGaps entry`);
                }
            }
        }
    }
}

function checkMcpPositioningMedia() {
    const relPath = "mcp/POSITIONING.md";
    const text = readRelative(relPath);
    const forbidden = [
        "screenshots below are placeholders",
        "Screenshot",
        "Full flow GIF",
    ];

    for (const marker of forbidden) {
        if (text.includes(marker)) fail(relPath, `contains unsupported media placeholder marker ${JSON.stringify(marker)}`);
    }

    const imageLinks = [...text.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)];
    for (const match of imageLinks) {
        const target = match[1]?.trim() ?? "";
        if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) {
            continue;
        }
        const resolved = path.normalize(path.join(path.dirname(relPath), target)).replace(/\\/g, "/");
        safeRelativePath(`${relPath}.image`, resolved);
        if (!fs.existsSync(path.join(root, resolved))) {
            fail(relPath, `image link points at missing file ${target}`);
        }
    }
}

function checkHistoricalArchiveBanners() {
    const banner = "ARCHIVED ARTIFACT. Do not execute directly.";
    // Every listed artifact is optional: these are historical records that get
    // retired once their content is fully absorbed elsewhere. The check keeps
    // its teeth for any that DO exist — an archived artifact still present must
    // still carry the banner, so it can never be mistaken for live guidance.
    for (const relPath of [".recon/MASTER.md", "plans/README.md"]) {
        if (!fs.existsSync(path.join(root, relPath))) {
            continue;
        }
        const text = readRelative(relPath);
        if (!text.includes(banner)) fail(relPath, `missing archive banner ${JSON.stringify(banner)}`);
        if (!text.includes("Use `AGENTS.md`,") || !text.includes("current `make perfect-fast` output")) {
            fail(relPath, "archive banner must point to AGENTS.md and current make perfect-fast output");
        }
    }
}

validateContractShape();

if (failures.length > 0) {
    console.error("Documentation quality contract shape failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkEntry(contract.policyDocument);
for (const section of ["keyDocuments", "supportingEvidence"]) {
    for (const entry of contract[section] ?? []) checkEntry(entry);
}

for (const surface of contract.generatedTruthSurfaces ?? []) {
    readRelative(surface);
}
checkProductSurfaceClaims();
checkMcpPositioningMedia();
checkHistoricalArchiveBanners();

for (const relPath of contract.scanPaths ?? []) {
    const text = readRelative(relPath);
    for (const pattern of contract.forbiddenUnsupportedClaims ?? []) {
        const regex = new RegExp(pattern, "i");
        if (regex.test(text)) fail(relPath, `unsupported marketing claim matched /${pattern}/i`);
    }
}

const makefile = readRelative("Makefile");
if (!makefile.includes(`${contract.wiring.uniqueClaimInventory}:`)) fail("Makefile", `missing ${contract.wiring.uniqueClaimInventory} target`);
if (!makefile.includes("node scripts/check-unique-claim-inventory.mjs")) fail("Makefile", "missing unique-claim inventory checker invocation");
if (!makefile.includes(`${contract.wiring.makeTarget}:`)) fail("Makefile", `missing ${contract.wiring.makeTarget} target`);
if (!makefile.includes(`node ${contract.wiring.checker}`)) fail("Makefile", `missing ${contract.wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(contract.wiring.makeTarget)) {
    fail("Makefile", `contract-gates missing ${contract.wiring.makeTarget}`);
}
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(contract.wiring.makeTarget)) fail("Makefile", `${target} missing ${contract.wiring.makeTarget}`);
}

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of contract.wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(contract.wiring.qualityGate)) {
    fail("docs/quality-gates.md", `missing ${contract.wiring.qualityGate}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${contract.wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${contract.wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${contract.wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${contract.wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("Documentation quality contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("Documentation quality contract passed");
