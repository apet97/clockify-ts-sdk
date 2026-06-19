#!/usr/bin/env node
// Tie a documented count to an independent generated-code derivation.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

function readJson(relPath) {
    const abs = path.join(root, relPath);
    if (!fs.existsSync(abs)) {
        fail(`${relPath}: missing`);
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (error) {
        fail(`${relPath}: invalid JSON: ${error.message}`);
        return null;
    }
}

const operations = readJson("docs/openapi-operations.json") ?? {};
const documented = operations.operationCount;
if (!Number.isInteger(documented) || documented < 1) {
    fail("docs/openapi-operations.json#operationCount must be a positive integer");
}

const candidates = ["output/ts-sdk", "wrapper/src"];
const generatedRoot = candidates
    .map((candidate) => path.join(root, candidate))
    .find((candidate) => fs.existsSync(path.join(candidate, "api/resources")));
const strict = process.env.STRICT_DOC_ANCHOR === "1";

if (!generatedRoot) {
    const message = `no generated TypeScript SDK root at ${candidates.join(" or ")}. Run make sdk-codegen to populate it.`;
    if (strict) {
        fail(`correctness anchor: ${message} (STRICT_DOC_ANCHOR=1 forbids skipping)`);
    } else {
        console.warn(`Skipped (non-strict): ${message}`);
        console.warn(
            "This anchor only proves anything once generated code is present; perfect-full runs it with STRICT_DOC_ANCHOR=1.",
        );
    }
} else {
    const resourcesRoot = path.join(generatedRoot, "api/resources");
    const methodRegex = /public\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let emitted = 0;
    for (const group of fs.readdirSync(resourcesRoot)) {
        const clientPath = path.join(resourcesRoot, group, "client/Client.ts");
        if (!fs.existsSync(clientPath)) continue;
        const text = fs.readFileSync(clientPath, "utf8");
        emitted += new Set([...text.matchAll(methodRegex)].map((match) => match[1])).size;
    }
    if (failures.length === 0 && emitted !== documented) {
        fail(
            `correctness anchor: documented operation count (${documented}) does not equal the ${emitted} emitted public methods in ${path.relative(root, generatedRoot)}`,
        );
    }
    if (failures.length === 0) {
        console.log(`Doc correctness anchor: documented ${documented} operations == ${emitted} emitted public methods in ${path.relative(root, generatedRoot)}.`);
    }
}

if (failures.length > 0) {
    console.error("doc correctness anchor failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("doc correctness anchor passed");
