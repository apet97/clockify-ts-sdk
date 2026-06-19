#!/usr/bin/env node
/**
 * Fixture <-> mock parity gate.
 *
 * Golden fixtures under spec/evidence/fixtures document wire-shape facts. This
 * gate makes the served subset mechanically honest by booting the mock server
 * on loopback, driving the mapped routes, and comparing responses to fixture
 * `wire`. Unserved fixtures must be classified with a static assertion pointer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMockClockifyServer } from "./mock-clockify-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(where, message) {
    failures.push(`${where}: ${message}`);
}

function readJson(rel) {
    return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

const map = readJson("docs/fixture-mock-parity-map.json");
if (map.schemaVersion !== 1) fail("map", "schemaVersion must be 1");
if (!Array.isArray(map.served)) fail("map", "served must be an array");
if (!Array.isArray(map.unservedByDesign)) fail("map", "unservedByDesign must be an array");

const fixturesDir = path.join(root, "spec/evidence/fixtures");
const allFixtures = fs
    .readdirSync(fixturesDir)
    .filter((file) => file.endsWith(".json"))
    .sort();
const classified = new Set([
    ...(map.served ?? []).map((entry) => path.basename(entry.fixture)),
    ...(map.unservedByDesign ?? []).map((entry) => path.basename(entry.fixture)),
]);
for (const fixture of allFixtures) {
    if (!classified.has(fixture)) {
        fail(fixture, "fixture is not classified as served or unservedByDesign");
    }
}

const replaySource = fs.readFileSync(path.join(root, "scripts/check-replay-fixtures.mjs"), "utf8");
for (const entry of map.unservedByDesign ?? []) {
    if (!replaySource.includes(entry.operationId)) {
        fail(
            entry.fixture,
            `unservedByDesign operationId ${entry.operationId} is not mentioned in scripts/check-replay-fixtures.mjs`,
        );
    }
}

function structuralShape(value) {
    if (Array.isArray(value)) return "array";
    if (value === null) return "null";
    return typeof value;
}

function compareExact(fixtureWire, mockBody, where) {
    const fixtureJson = JSON.stringify(fixtureWire);
    const mockJson = JSON.stringify(mockBody);
    if (fixtureJson !== mockJson) {
        fail(where, `exact mismatch:\n    fixture: ${fixtureJson}\n    mock:    ${mockJson}`);
    }
}

function compareMemberOfArray(fixtureWire, mockBody, where) {
    if (!Array.isArray(mockBody)) {
        fail(where, "mock did not return a bare array");
        return;
    }
    if (!Array.isArray(fixtureWire) || fixtureWire.length !== 1) {
        fail(where, "fixture wire must be a one-element array");
        return;
    }
    const expected = fixtureWire[0];
    const actual = mockBody[0];
    if (actual == null || typeof actual !== "object") {
        fail(where, "mock array is empty or not object-shaped");
        return;
    }
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
        fail(where, `key set differs: fixture ${expectedKeys} vs mock ${actualKeys}`);
        return;
    }
    for (const key of expectedKeys) {
        const expectedShape = structuralShape(expected[key]);
        const actualShape = structuralShape(actual[key]);
        if (expectedShape !== actualShape) {
            fail(where, `key ${key} shape differs: fixture ${expectedShape} vs mock ${actualShape}`);
        }
    }
}

function routeFor(entry) {
    return String(entry.request.route ?? "")
        .replace("{invoiceId}", entry.request.id ?? "")
        .replace(/\/$/, "");
}

async function run() {
    const mock = createMockClockifyServer();
    const baseUrl = await mock.listen();
    try {
        for (const entry of map.served ?? []) {
            const fixture = readJson(entry.fixture);
            const where = `${entry.fixture} (${entry.operationId})`;
            const url = `${baseUrl}/workspaces/${mock.workspaceId}/${routeFor(entry)}`;
            const response = await fetch(url, {
                method: entry.request.method,
                headers: { "X-Api-Key": "mock" },
            });
            const body = await response.json().catch(() => null);
            if (response.status !== 200) {
                fail(where, `expected status 200, got ${response.status}`);
                continue;
            }
            if (entry.compare === "exact") {
                compareExact(fixture.wire, body, where);
            } else if (entry.compare === "memberOfArray") {
                compareMemberOfArray(fixture.wire, body, where);
            } else {
                fail(where, `unknown compare mode ${entry.compare}`);
            }
        }
    } finally {
        await mock.close();
    }
}

await run();

if (failures.length > 0) {
    console.error("fixture<->mock parity gate FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(
    `fixture<->mock parity gate passed (${map.served.length} served fixtures checked against the live mock, ${map.unservedByDesign.length} unserved-by-design fixtures classified).`,
);
