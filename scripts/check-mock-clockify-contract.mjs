#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = readJson("docs/mock-clockify-contract.json", "contractPath");

function fail(message) {
    failures.push(message);
}

function safeRelativePath(label, relativePath) {
    if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
        return null;
    }
    const normalized = path.normalize(relativePath);
    if (path.isAbsolute(relativePath) || normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
        fail(`${label} must be a repo-relative path without parent traversal`);
        return null;
    }
    return normalized;
}

function assertNonEmptyString(label, value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail(`${label} must be a non-empty string`);
    }
}

function assertObject(label, value) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
        fail(`${label} must be an object`);
        return false;
    }
    return true;
}

function assertStringArray(label, value, { allowEmpty = true } = {}) {
    if (!Array.isArray(value)) {
        fail(`${label} must be an array`);
        return [];
    }
    if (!allowEmpty && value.length === 0) {
        fail(`${label} must be a non-empty array`);
    }
    for (const entry of value) {
        if (typeof entry !== "string" || entry.trim().length === 0) {
            fail(`${label} contains a non-string or empty entry`);
        }
    }
    return value.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function assertUnique(label, values) {
    const seen = new Set();
    for (const value of values ?? []) {
        if (seen.has(value)) fail(`${label} contains duplicate ${value}`);
        seen.add(value);
    }
}

function readRelative(relativePath, label = relativePath) {
    const safePath = safeRelativePath(label, relativePath);
    if (safePath == null) return "";
    const absolutePath = path.join(root, safePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`${safePath} is missing`);
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
        fail(`${label} invalid JSON: ${error.message}`);
        return {};
    }
}

function validateMarkerEntry(label, entry, markerField = "contains") {
    if (!assertObject(label, entry)) return;
    safeRelativePath(`${label}.path`, entry.path);
    const markers = assertStringArray(`${label}.${markerField}`, entry[markerField], {
        allowEmpty: false,
    });
    assertUnique(`${label}.${markerField}`, markers);
}

function validateContractShape() {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    assertNonEmptyString("purpose", contract.purpose);


    safeRelativePath("server", contract.server);
    assertNonEmptyString("defaultWorkspaceId", contract.defaultWorkspaceId);

    const exports = assertStringArray("exports", contract.exports, { allowEmpty: false });
    assertUnique("exports", exports);

    const requiredHeaders = assertStringArray("requiredHeaders", contract.requiredHeaders, {
        allowEmpty: false,
    });
    assertUnique("requiredHeaders", requiredHeaders);

    const requiredRoutes = assertStringArray("requiredRoutes", contract.requiredRoutes, {
        allowEmpty: false,
    });
    assertUnique("requiredRoutes", requiredRoutes);
    for (const route of requiredRoutes) {
        if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) \/.+/.test(route)) {
            fail(`requiredRoutes invalid route ${route}`);
        }
    }

    if (!Array.isArray(contract.mockTests) || contract.mockTests.length === 0) {
        fail("mockTests must be a non-empty array");
    }
    assertUnique(
        "mockTests.path",
        (contract.mockTests ?? []).map((test) => test?.path).filter((testPath) => typeof testPath === "string"),
    );
    for (const [index, test] of (contract.mockTests ?? []).entries()) {
        const label = test?.surface ?? `mockTests[${index}]`;
        if (!assertObject(label, test)) continue;
        assertNonEmptyString(`${label}.surface`, test.surface);
        safeRelativePath(`${label}.path`, test.path);
        const markers = assertStringArray(`${label}.mustContain`, test.mustContain, {
            allowEmpty: false,
        });
        assertUnique(`${label}.mustContain`, markers);
    }

    if (!Array.isArray(contract.docs) || contract.docs.length === 0) {
        fail("docs must be a non-empty array");
    }
    assertUnique(
        "docs.path",
        (contract.docs ?? []).map((doc) => doc?.path).filter((docPath) => typeof docPath === "string"),
    );
    for (const [index, doc] of (contract.docs ?? []).entries()) {
        validateMarkerEntry(`docs[${index}]`, doc);
    }

    if (assertObject("wiring", contract.wiring)) {
        assertNonEmptyString("wiring.makeTarget", contract.wiring.makeTarget);
        assertNonEmptyString("wiring.qualityGate", contract.wiring.qualityGate);
        assertNonEmptyString("wiring.docsIndexContract", contract.wiring.docsIndexContract);
        assertNonEmptyString("wiring.inventoryId", contract.wiring.inventoryId);
        assertNonEmptyString("wiring.auditId", contract.wiring.auditId);
    }
}

validateContractShape();
if (failures.length > 0) {
    console.error("mock Clockify contract shape failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const server = readRelative(contract.server, "server");
if (server) {
    for (const exported of contract.exports ?? []) {
        if (!server.includes(`export function ${exported}`)) fail(`mock server missing export ${exported}`);
    }
    if (!server.includes(contract.defaultWorkspaceId)) {
        fail(`mock server missing default workspace id ${contract.defaultWorkspaceId}`);
    }
    for (const header of contract.requiredHeaders ?? []) {
        if (!server.includes(header)) fail(`mock server missing header ${header}`);
    }
    // Boot the mock on loopback and probe each required route so a dropped or
    // mis-wired handler cannot pass on loose source tokens. (Method + path
    // segments used to be checked independently against the file text, so a
    // missing GET /clients stayed green because the bare word "clients"
    // survives in the seeded state object.)
    const { createMockClockifyServer } = await import("./mock-clockify-server.mjs");
    const probe = createMockClockifyServer();
    const probeBase = await probe.listen(); // returns http://host:port/api/v1
    const seededTagId = probe.state.tags[0]?.id ?? "000000000000000000000101";
    const seededInvoiceId = probe.state.invoices[0]?.id ?? "000000000000000000000401";
    try {
        for (const route of contract.requiredRoutes ?? []) {
            const [method, routePath] = route.split(" ");
            const concretePath = routePath
                .replaceAll("{workspaceId}", probe.workspaceId)
                .replaceAll("{tagId}", seededTagId)
                .replaceAll("{invoiceId}", seededInvoiceId);
            try {
                const response = await fetch(`${probeBase}${concretePath}`, {
                    method,
                    headers: { "X-Api-Key": "mock" },
                });
                await response.text().catch(() => {});
                if (response.status === 404) fail(`mock server does not serve ${route} (404)`);
            } catch (error) {
                fail(`mock server route ${route} probe failed: ${error.message}`);
            }
        }
    } finally {
        await probe.close();
    }
}

for (const test of contract.mockTests ?? []) {
    const text = readRelative(test.path);
    if (!text) continue;
    if (!text.includes("createMockClockifyServer")) fail(`${test.path} does not use createMockClockifyServer`);
    for (const marker of test.mustContain ?? []) {
        if (!text.includes(marker)) fail(`${test.path} missing marker ${JSON.stringify(marker)}`);
    }
}

for (const doc of contract.docs ?? []) {
    const text = readRelative(doc.path);
    if (!text) continue;
    for (const marker of doc.contains ?? []) {
        if (!text.includes(marker)) fail(`${doc.path} missing marker ${JSON.stringify(marker)}`);
    }
}

const makefile = readRelative("Makefile");
const wiring = contract.wiring ?? {};
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget} target`);
for (const target of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((candidate) => candidate.startsWith(`${target}:`)) ?? "";
    if (!line.includes(wiring.makeTarget)) fail(`Makefile ${target} missing ${wiring.makeTarget}`);
}

const qualityGates = readRelative("docs/quality-gates.md");
if (!qualityGates.includes(wiring.qualityGate)) fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);

const docsIndex = readRelative("docs/README.md");
if (!docsIndex.includes(`./${wiring.docsIndexContract}`)) {
    fail(`docs/README.md missing ${wiring.docsIndexContract}`);
}

const inventory = readRelative("docs/contract-inventory.json");
if (!inventory.includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}

const audit = readRelative("docs/enterprise-hardening-audit.json");
if (!audit.includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("mock Clockify contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const routeCount = Array.isArray(contract.requiredRoutes) ? contract.requiredRoutes.length : 0;
const testCount = Array.isArray(contract.mockTests) ? contract.mockTests.length : 0;
console.log(`mock Clockify contract passed (${routeCount} routes, ${testCount} test surfaces)`);
