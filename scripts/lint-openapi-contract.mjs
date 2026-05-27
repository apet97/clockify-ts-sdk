#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(fs.readFileSync(path.join(root, "docs", "openapi-operations.json"), "utf8"));
const failures = [];

function fail(message) {
    failures.push(message);
}

if (inventory.operationCount !== 185) fail(`expected 185 operations, got ${inventory.operationCount}`);
if (!Array.isArray(inventory.operations)) fail("operations must be an array");

const operationIds = new Set();
let sdkNamed = 0;
let lastPage = 0;
let paginated = 0;

for (const op of inventory.operations ?? []) {
    const label = `${op.method} ${op.path}`;
    if (!op.operationId) fail(`${label}: missing operationId`);
    else if (operationIds.has(op.operationId)) fail(`${label}: duplicate operationId ${op.operationId}`);
    else operationIds.add(op.operationId);

    if (!Array.isArray(op.tags) || op.tags.length === 0) fail(`${label}: missing tags`);
    if (!Array.isArray(op.responseCodes) || op.responseCodes.length === 0) fail(`${label}: missing responses`);

    const hasSdkGroup = typeof op.sdkGroup === "string" && op.sdkGroup.length > 0;
    const hasSdkMethod = typeof op.sdkMethod === "string" && op.sdkMethod.length > 0;
    if (hasSdkGroup !== hasSdkMethod) fail(`${label}: sdk group/method stamp is partial`);
    if (hasSdkGroup && hasSdkMethod) sdkNamed += 1;

    const params = Array.isArray(op.parameters) ? op.parameters : [];
    const paramNames = new Set(params.map((param) => param.name));
    if (paramNames.has("page") || paramNames.has("page-size")) {
        paginated += 1;
        if (!paramNames.has("page") || !paramNames.has("page-size")) fail(`${label}: pagination must include both page and page-size`);
    }
    if (op.lastPageHeader) lastPage += 1;

    for (const param of params) {
        if (["expenseId", "invoiceId", "assignmentId"].includes(param.name) && param.schemaType !== "string") {
            fail(`${label}: ${param.name} must remain a string path parameter`);
        }
    }
}

if (sdkNamed < 169) fail(`expected at least 169 SDK-named operations, got ${sdkNamed}`);
if (paginated < 18) fail(`expected at least 18 paginated operations, got ${paginated}`);
if (lastPage < 15) fail(`expected at least 15 Last-Page-aware operations, got ${lastPage}`);

if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
}

console.log(`OpenAPI contract lint passed: ${inventory.operationCount} ops, ${sdkNamed} SDK-named, ${paginated} paginated, ${lastPage} Last-Page-aware.`);
