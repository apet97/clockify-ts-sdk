#!/usr/bin/env node
/**
 * Replay committed redacted golden fixtures offline.
 *
 * The gate checks pinned wire-shape arithmetic, scans fixture bytes for secret
 * patterns/unredacted IDs, and trips if a future invoice-item/payment-create
 * site in mcp/src omits invoiceItemUnitPriceToWire.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function fail(where, message) {
    failures.push(`${where}: ${message}`);
}

function readJson(relPath) {
    return JSON.parse(fs.readFileSync(path.join(root, relPath), "utf8"));
}

function unitPriceFromWire(wire) {
    return Math.round(wire / 100);
}

function unitPriceToWire(minor) {
    return Math.round(minor * 100);
}

function invoicePercentBody(wire) {
    const out = {};
    if (typeof wire.tax === "number") out.taxPercent = wire.tax / 100;
    if (typeof wire.discount === "number") out.discountPercent = wire.discount / 100;
    if (typeof wire.tax2 === "number") out.tax2Percent = wire.tax2 / 100;
    return out;
}

const contractPath = "docs/replay-fixtures-contract.json";
const contract = fs.existsSync(path.join(root, contractPath)) ? readJson(contractPath) : null;
const fixturesDir = contract?.fixturesDir ?? "spec/evidence/fixtures";
const fixturesAbs = path.join(root, fixturesDir);
const files = fs.readdirSync(fixturesAbs).filter((file) => file.endsWith(".json")).sort();

if (files.length === 0) fail(fixturesDir, "no committed fixtures found");
for (const required of contract?.requiredFixtures ?? []) {
    if (!fs.existsSync(path.join(root, required))) fail(required, "required fixture missing");
}

const secretPolicy = readJson("docs/secret-hygiene.json");
const secretPatterns = (secretPolicy.patterns ?? []).map((item) => ({
    id: item.id,
    re: new RegExp(item.regex),
}));
const hex24 = /\b[0-9a-f]{24}\b/gi;
const placeholderId = new RegExp(contract?.placeholderIdPattern ?? "^0{20}[0-9]{4}$|^0{21}[0-9]{3}$");

for (const file of files) {
    const rel = path.join(fixturesDir, file);
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    for (const { id, re } of secretPatterns) {
        if (re.test(text)) fail(rel, `secret-hygiene pattern ${id} matched`);
    }
    for (const match of text.matchAll(hex24)) {
        if (!placeholderId.test(match[0])) fail(rel, `un-redacted 24-hex id ${match[0]}`);
    }

    let fixture;
    try {
        fixture = JSON.parse(text);
    } catch (error) {
        fail(rel, `invalid JSON: ${error.message}`);
        continue;
    }

    const assertion = fixture.assert ?? {};
    if (typeof fixture.operationId !== "string" || fixture.operationId.length === 0) {
        fail(rel, "operationId must be a non-empty string");
    }
    if (!("wire" in fixture)) fail(rel, "wire payload missing");
    if (assertion.helper === "invoiceItemUnitPriceFromWire") {
        const got = unitPriceFromWire(assertion.input);
        if (got !== assertion.expect) fail(rel, `unitPriceFromWire(${assertion.input}) = ${got}, expected ${assertion.expect}`);
        if (unitPriceToWire(got) !== assertion.input) fail(rel, `unitPrice round trip broken for ${assertion.input}`);
    }
    if (assertion.helper === "invoiceUpdateBodyFromExisting") {
        const body = invoicePercentBody(fixture.wire ?? {});
        for (const [key, expected] of Object.entries(assertion.expectPercent ?? {})) {
            if (body[key] !== expected) fail(rel, `invoice ${key} = ${body[key]}, expected ${expected}`);
        }
        if ("tax" in body || "discount" in body) fail(rel, "invoice PUT body must not carry verbatim tax/discount");
    }
    if (Array.isArray(assertion.envelope)) {
        for (const key of assertion.envelope) {
            if (!(key in (fixture.wire ?? {}))) fail(rel, `envelope missing key ${key}`);
        }
        if (typeof assertion.count === "number" && (fixture.wire?.count ?? -1) !== assertion.count) {
            fail(rel, `envelope count ${fixture.wire?.count} != ${assertion.count}`);
        }
    }
    if (assertion.isArray === true && !Array.isArray(fixture.wire)) fail(rel, "wire must be an array");
    if (fixture.operationId === "getWorkspaceProjects" && !Array.isArray(fixture.wire)) {
        fail(rel, "getWorkspaceProjects fixture must be a bare array");
    }
    if (fixture.operationId === "getTimeOffRequests") {
        if (!fixture.wire || typeof fixture.wire !== "object" || Array.isArray(fixture.wire)) {
            fail(rel, "getTimeOffRequests fixture must be an envelope object");
        } else {
            if (typeof fixture.wire.count !== "number") fail(rel, "getTimeOffRequests count must be numeric");
            if (!Array.isArray(fixture.wire.requests)) fail(rel, "getTimeOffRequests requests must be an array");
        }
    }
}

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(abs);
        else if (entry.name.endsWith(".ts")) yield abs;
    }
}

const tripwire = contract?.sourceGrepTripwire ?? {
    scanDir: "mcp/src",
    triggers: ["addInvoiceItem", "invoiceItems.create", "payments.create", "createInvoicePayment"],
    requires: "invoiceItemUnitPriceToWire",
};
const triggerRe = new RegExp(tripwire.triggers.map((trigger) => trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
const scanDir = path.join(root, tripwire.scanDir);
if (fs.existsSync(scanDir)) {
    for (const file of walk(scanDir)) {
        const source = fs.readFileSync(file, "utf8");
        if (triggerRe.test(source) && !source.includes(tripwire.requires)) {
            fail(
                path.relative(root, file),
                `references an invoice-item/payment-create op but not ${tripwire.requires}; unitPrice is minor*100 on the wire`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("replay-fixtures gate FAILED:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}

console.log(`replay-fixtures gate passed (${files.length} fixtures replayed offline, hygiene + unitPrice tripwire clean).`);
