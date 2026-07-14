#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/api-docs-contract.json", "contractPath");

function fail(id, message) {
    failures.push(`${id}: ${message}`);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(label, "must be a non-empty string");
        return null;
    }
    const normalized = path.normalize(relativePath);
    const segments = relativePath.split(/[\\/]+/);
    if (
        path.isAbsolute(relativePath) ||
        segments.includes("..") ||
        normalized === ".." ||
        normalized.startsWith(`..${path.sep}`)
    ) {
        fail(label, "must be a repo-relative path without parent traversal");
        return null;
    }
    return normalized.replace(/\\/g, "/");
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(label, "must be a non-empty string");
    }
}

function assertBoolean(label, value) {
    if (typeof value !== "boolean") {
        fail(label, "must be a boolean");
    }
}

function assertNonNegativeInteger(label, value) {
    if (!Number.isInteger(value) || value < 0) {
        fail(label, "must be a non-negative integer");
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

function checkText(relativePath, markers, forbiddenMarkers = []) {
    const text = readRelative(relativePath);
    for (const marker of markers ?? []) {
        if (!text.includes(marker)) fail(relativePath, `missing marker ${JSON.stringify(marker)}`);
    }
    for (const marker of forbiddenMarkers ?? []) {
        if (text.includes(marker)) fail(relativePath, `contains forbidden marker ${marker}`);
    }
    return text;
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

function validateStringMap(label, value, { allowBoolean = false } = {}) {
    if (!assertObject(label, value)) return;
    for (const [key, entry] of Object.entries(value)) {
        if (allowBoolean && typeof entry === "boolean") continue;
        assertNonEmptyString(`${label}.${key}`, entry);
    }
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion", "must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    validateMarkerEntry("policyDocument", contract.policyDocument);

    if (assertObject("typedoc", contract.typedoc)) {
        safeRelativePath("typedoc.path", contract.typedoc.path);
        validateStringMap("typedoc.mustEqual", contract.typedoc.mustEqual, { allowBoolean: true });
        const entryPoints = assertStringArray("typedoc.mustContainEntryPoints", contract.typedoc.mustContainEntryPoints, {
            allowEmpty: false,
        });
        assertUnique("typedoc.mustContainEntryPoints", entryPoints);
        validateStringMap("typedoc.mustContainNavigationLinks", contract.typedoc.mustContainNavigationLinks);
    }

    if (assertObject("wrapperPackage", contract.wrapperPackage)) {
        safeRelativePath("wrapperPackage.path", contract.wrapperPackage.path);
        validateStringMap("wrapperPackage.requiredScripts", contract.wrapperPackage.requiredScripts);
        const requiredDevDependencies = assertStringArray(
            "wrapperPackage.requiredDevDependencies",
            contract.wrapperPackage.requiredDevDependencies,
            { allowEmpty: false },
        );
        assertUnique("wrapperPackage.requiredDevDependencies", requiredDevDependencies);
    }

    if (assertObject("resourceDocs", contract.resourceDocs)) {
        safeRelativePath("resourceDocs.script", contract.resourceDocs.script);
        safeRelativePath("resourceDocs.directory", contract.resourceDocs.directory);
        assertNonNegativeInteger("resourceDocs.minimumMarkdownFiles", contract.resourceDocs.minimumMarkdownFiles);
        for (const field of ["requiredFiles", "mustContain"]) {
            const values = assertStringArray(`resourceDocs.${field}`, contract.resourceDocs[field], {
                allowEmpty: false,
            });
            assertUnique(`resourceDocs.${field}`, values);
        }
    }

    validateMarkerEntry("syncScript", contract.syncScript);
    validateMarkerEntry("docsWorkflow", contract.docsWorkflow);

    if (!Array.isArray(contract.supportingDocs) || contract.supportingDocs.length === 0) {
        fail("supportingDocs", "must be a non-empty array");
    }
    assertUnique(
        "supportingDocs.path",
        (contract.supportingDocs ?? [])
            .map((doc) => doc?.path)
            .filter((docPath) => typeof docPath === "string"),
    );
    for (const [index, doc] of (contract.supportingDocs ?? []).entries()) {
        validateMarkerEntry(`supportingDocs[${index}]`, doc);
    }

    if (contract.generatedApiDocs != null && assertObject("generatedApiDocs", contract.generatedApiDocs)) {
        safeRelativePath("generatedApiDocs.directory", contract.generatedApiDocs.directory);
        assertBoolean("generatedApiDocs.optionalWhenMissing", contract.generatedApiDocs.optionalWhenMissing);
        for (const field of ["representativeFiles", "mustContain", "forbiddenMarkers"]) {
            const values = assertStringArray(`generatedApiDocs.${field}`, contract.generatedApiDocs[field], {
                allowEmpty: field === "forbiddenMarkers",
            });
            assertUnique(`generatedApiDocs.${field}`, values);
        }
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        safeRelativePath("wiring.checker", contract.wiring.checker);
        const docsIndex = assertStringArray("wiring.docsIndex", contract.wiring.docsIndex, {
            allowEmpty: false,
        });
        assertUnique("wiring.docsIndex", docsIndex);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("API docs contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

checkText(
    contract.policyDocument.path,
    contract.policyDocument.mustContain,
    contract.policyDocument.forbiddenMarkers,
);

const typedoc = readJson(contract.typedoc.path, "typedoc.path");
for (const [key, expected] of Object.entries(contract.typedoc.mustEqual ?? {})) {
    if (typedoc[key] !== expected) fail(contract.typedoc.path, `expected ${key}=${JSON.stringify(expected)}, got ${JSON.stringify(typedoc[key])}`);
}
for (const entryPoint of contract.typedoc.mustContainEntryPoints ?? []) {
    if (!typedoc.entryPoints?.includes(entryPoint)) fail(contract.typedoc.path, `missing entry point ${entryPoint}`);
}
for (const [label, url] of Object.entries(contract.typedoc.mustContainNavigationLinks ?? {})) {
    if (typedoc.navigationLinks?.[label] !== url) fail(contract.typedoc.path, `navigationLinks.${label} must be ${url}`);
}

const wrapperPackage = readJson(contract.wrapperPackage.path, "wrapperPackage.path");
for (const [script, expected] of Object.entries(contract.wrapperPackage.requiredScripts ?? {})) {
    const actual = wrapperPackage.scripts?.[script];
    if (script === "docs") {
        if (typeof actual !== "string" || !actual.endsWith("typedoc")) {
            fail(contract.wrapperPackage.path, "script docs must end with typedoc");
        }
        if (typeof actual !== "string" || !actual.includes("generate-package-versions.mjs")) {
            fail(contract.wrapperPackage.path, "script docs must generate package versions before typedoc");
        }
        continue;
    }
    if (actual !== expected) fail(contract.wrapperPackage.path, `script ${script} must be ${expected}`);
}
for (const dep of contract.wrapperPackage.requiredDevDependencies ?? []) {
    if (typeof wrapperPackage.devDependencies?.[dep] !== "string") fail(contract.wrapperPackage.path, `missing devDependency ${dep}`);
}

checkText(contract.resourceDocs.script, contract.resourceDocs.mustContain);
const resourceDir = path.join(root, contract.resourceDocs.directory);
if (!fs.existsSync(resourceDir)) {
    fail(contract.resourceDocs.directory, "missing");
} else {
    const markdownFiles = fs.readdirSync(resourceDir).filter((entry) => entry.endsWith(".md"));
    if (markdownFiles.length < contract.resourceDocs.minimumMarkdownFiles) {
        fail(contract.resourceDocs.directory, `expected at least ${contract.resourceDocs.minimumMarkdownFiles} markdown files, got ${markdownFiles.length}`);
    }
    for (const file of contract.resourceDocs.requiredFiles ?? []) {
        if (!markdownFiles.includes(file)) fail(contract.resourceDocs.directory, `missing ${file}`);
    }
}

checkText(contract.syncScript.path, contract.syncScript.mustContain);
checkText(contract.docsWorkflow.path, contract.docsWorkflow.mustContain);
for (const doc of contract.supportingDocs ?? []) checkText(doc.path, doc.mustContain);

if (contract.generatedApiDocs != null) {
    const generatedDir = path.join(root, contract.generatedApiDocs.directory);
    if (!fs.existsSync(generatedDir)) {
        if (!contract.generatedApiDocs.optionalWhenMissing) fail(contract.generatedApiDocs.directory, "missing");
    } else {
        for (const file of contract.generatedApiDocs.representativeFiles ?? []) {
            const relativePath = path.join(contract.generatedApiDocs.directory, file);
            checkText(relativePath, contract.generatedApiDocs.mustContain, contract.generatedApiDocs.forbiddenMarkers);
        }
    }
}


if (contract.stabilityTags != null && assertObject("stabilityTags", contract.stabilityTags)) {
    const stability = contract.stabilityTags;
    assertNonEmptyString("stabilityTags.purpose", stability.purpose);
    const allowedTags = assertStringArray("stabilityTags.allowedTags", stability.allowedTags, {
        allowEmpty: false,
    });
    const allowedSet = new Set(allowedTags);
    assertNonEmptyString("stabilityTags.tagPattern", stability.tagPattern);
    const dir = safeRelativePath("stabilityTags.directory", stability.directory);
    if (dir != null && failures.length === 0) {
        let tagRegex = null;
        try {
            tagRegex = new RegExp(stability.tagPattern, "g");
        } catch (error) {
            fail("stabilityTags.tagPattern", `invalid regex: ${error.message}`);
        }
        const absoluteDir = path.join(root, dir);
        if (!fs.existsSync(absoluteDir)) {
            fail(dir, "missing");
        } else if (tagRegex != null) {
            // Scan hand-written wrapper TS files (top level only; src/** is generated).
            const tsFiles = fs
                .readdirSync(absoluteDir)
                .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".d.ts"));
            for (const file of tsFiles) {
                const relativePath = `${dir}/${file}`;
                const text = fs.readFileSync(path.join(absoluteDir, file), "utf8");
                for (const match of text.matchAll(tagRegex)) {
                    const tag = match[0];
                    if (!allowedSet.has(tag)) {
                        fail(relativePath, `stability tag ${tag} is not in the allowed vocabulary ${JSON.stringify([...allowedSet])}`);
                    }
                }
            }
        }
    }
    for (const [index, required] of (stability.requiredTaggedFiles ?? []).entries()) {
        const label = `stabilityTags.requiredTaggedFiles[${index}]`;
        if (!assertObject(label, required)) continue;
        const requiredPath = safeRelativePath(`${label}.path`, required.path);
        const mustContainTags = assertStringArray(`${label}.mustContainTags`, required.mustContainTags, {
            allowEmpty: false,
        });
        if (requiredPath == null) continue;
        const text = readRelative(requiredPath, `${label}.path`);
        for (const tag of mustContainTags) {
            if (!text.includes(tag)) {
                fail(requiredPath, `expected stability tag ${tag} to remain present`);
            }
        }
    }
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail("Makefile", `missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail("Makefile", `${target} missing ${wiring.makeTarget}`);
}
if (!makefile.includes(`node ${wiring.checker}`)) fail("Makefile", `${wiring.makeTarget} target does not run checker`);

const docsIndex = readRelative("docs/README.md");
for (const requiredDoc of wiring.docsIndex) {
    if (!docsIndex.includes(`./${requiredDoc}`)) fail("docs/README.md", `missing ${requiredDoc}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail("docs/quality-gates.md", `missing ${wiring.qualityGate}`);

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail("docs/contract-inventory.json", `missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail("docs/enterprise-hardening-audit.json", `missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("API docs contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("API docs contract passed");
