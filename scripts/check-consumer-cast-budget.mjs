#!/usr/bin/env node
// Every `as never` in cli/src + mcp/src must be either eliminated or
// annotated with a `KEEP as never` comment on the same line or immediately
// above it. result.ts/output-schema.ts are forwarding seams and are exempt.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const ROOTS = ["cli/src", "mcp/src"];
const FORBIDDEN_IDENTIFIER_ROOTS = [
    "wrapper/tests",
    "wrapper/examples",
    "cli/src",
    "cli/tests",
    "mcp/src",
    "mcp/tests",
];

const contract = JSON.parse(
    await readFile(path.join(root, "docs/consumer-cast-budget-contract.json"), "utf8"),
);
if (contract.schemaVersion !== 1) failures.push("schemaVersion must be 1");
const budget = contract.allowedRequestCastBudget;
if (!Number.isInteger(budget) || budget < 0) {
    failures.push("allowedRequestCastBudget must be a non-negative integer");
}
const exemptSuffixes = contract.exemptPathSuffixes;
if (!Array.isArray(exemptSuffixes) || !exemptSuffixes.every((value) => typeof value === "string")) {
    failures.push("exemptPathSuffixes must be an array of strings");
}
const pathExemptions = Array.isArray(exemptSuffixes) ? exemptSuffixes : [];

const isAnnotated = (here, above) => /KEEP as never/.test(here) || /KEEP as never/.test(above);
if (!isAnnotated("foo as never; // KEEP as never: x", "") || isAnnotated("foo as never;", "const x = 1;")) {
    failures.push("annotation self-test regressed: must accept `KEEP as never` and reject a bare `as never`");
}

async function listTs(dir) {
    const out = [];
    const stack = [dir];
    while (stack.length) {
        const d = stack.pop();
        let entries;
        try {
            entries = await readdir(path.join(root, d), { withFileTypes: true });
        } catch {
            failures.push(`missing directory ${d}`);
            continue;
        }
        for (const e of entries) {
            const rel = path.join(d, e.name);
            if (e.isDirectory()) stack.push(rel);
            else if (e.name.endsWith(".ts")) out.push(rel);
        }
    }
    return out.sort();
}

let unannotated = 0;
const offenders = [];
const forbiddenIdentifier = "wireBody";
const forbiddenIdentifierPattern = new RegExp(`\\b${forbiddenIdentifier}\\b`);
const forbiddenIdentifierOffenders = [];
for (const r of ROOTS) {
    for (const rel of await listTs(r)) {
        if (pathExemptions.some((s) => rel.endsWith(s))) continue;
        const lines = (await readFile(path.join(root, rel), "utf8")).split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (!/\bas never\b/.test(lines[i])) continue;
            const above = i > 0 ? lines[i - 1] : "";
            if (!isAnnotated(lines[i], above)) {
                unannotated++;
                offenders.push(`${rel}:${i + 1}`);
            }
        }
    }
}

const forbiddenFiles = new Set();
for (const scanRoot of FORBIDDEN_IDENTIFIER_ROOTS) {
    for (const rel of await listTs(scanRoot)) forbiddenFiles.add(rel);
}
for (const entry of await readdir(path.join(root, "wrapper"), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
        forbiddenFiles.add(path.join("wrapper", entry.name));
    }
}
for (const rel of [...forbiddenFiles].sort()) {
    const lines = (await readFile(path.join(root, rel), "utf8")).split("\n");
    for (let i = 0; i < lines.length; i++) {
        if (forbiddenIdentifierPattern.test(lines[i])) {
            forbiddenIdentifierOffenders.push(`${rel}:${i + 1}`);
        }
    }
}

if (forbiddenIdentifierOffenders.length > 0) {
    failures.push(
        `forbidden request escape \`${forbiddenIdentifier}\` found in governed TypeScript`,
    );
    for (const offender of forbiddenIdentifierOffenders) {
        failures.push(`  forbidden: ${offender}`);
    }
}

if (unannotated > budget) {
    failures.push(`unannotated \`as never\` count ${unannotated} exceeds budget ${budget}`);
    for (const o of offenders) failures.push(`  unannotated: ${o}`);
}

if (failures.length > 0) {
    console.error("Consumer cast budget failed:");
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
}

console.log(`Consumer cast budget passed (${unannotated} unannotated \`as never\`, budget ${budget}).`);
