#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
    failures.push(message);
}

function readRelative(relativePath) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
        fail(`missing: ${relativePath}`);
        return "";
    }
    return fs.readFileSync(absolutePath, "utf8");
}

function validateContract(contract) {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    if (typeof contract.purpose !== "string" || contract.purpose.trim() === "") fail("purpose must be non-empty");
    const roots = contract.generatedRoots ?? {};
    if (!Array.isArray(roots.candidates) || roots.candidates.length === 0) fail("generatedRoots.candidates must be non-empty");
    for (const field of ["resourcesPath", "clientPath", "methodRegex"]) {
        if (typeof roots[field] !== "string" || roots[field].trim() === "") fail(`generatedRoots.${field} must be non-empty`);
    }
    if (!Array.isArray(contract.ignoredMembers)) fail("ignoredMembers must be an array");
    if (!Array.isArray(contract.snippetSurfaces) || contract.snippetSurfaces.length === 0) fail("snippetSurfaces must be non-empty");
    if (typeof contract.referenceRegex !== "string" || contract.referenceRegex.trim() === "") fail("referenceRegex must be non-empty");
    const wiring = contract.wiring ?? {};
    for (const field of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
        if (typeof wiring[field] !== "string" || wiring[field].trim() === "") fail(`wiring.${field} must be non-empty`);
    }
    if (!Array.isArray(wiring.docsIndex) || wiring.docsIndex.length === 0) fail("wiring.docsIndex must be non-empty");
}

const contractText = readRelative("docs/snippet-method-parity-contract.json");
let contract = {};
if (contractText) {
    try {
        contract = JSON.parse(contractText);
    } catch (error) {
        fail(`docs/snippet-method-parity-contract.json invalid JSON: ${error.message}`);
    }
}
validateContract(contract);

if (failures.length === 0) {
    const roots = contract.generatedRoots;
    const generatedRoot = roots.candidates
        .map((candidate) => path.join(root, candidate))
        .find((candidate) => fs.existsSync(path.join(candidate, roots.resourcesPath)));

    if (!generatedRoot) {
        console.warn(`Skipped generated-client method validation: no SDK root at ${roots.candidates.join(" or ")}.`);
    } else {
        const methodsByGroup = new Map();
        const resourcesRoot = path.join(generatedRoot, roots.resourcesPath);
        const methodRegex = new RegExp(roots.methodRegex, "g");
        for (const group of fs.readdirSync(resourcesRoot)) {
            const clientPath = path.join(resourcesRoot, group, roots.clientPath);
            if (!fs.existsSync(clientPath)) continue;
            const text = fs.readFileSync(clientPath, "utf8");
            methodsByGroup.set(group, new Set([...text.matchAll(methodRegex)].map((match) => match[1])));
        }

        const ignored = new Set(contract.ignoredMembers);
        let checkedRefs = 0;
        for (const surface of contract.snippetSurfaces) {
            const text = readRelative(surface);
            const referenceRegex = new RegExp(contract.referenceRegex, "g");
            for (const match of text.matchAll(referenceRegex)) {
                const group = match[1];
                const member = match[2];
                if (ignored.has(group) || ignored.has(member)) continue;
                checkedRefs += 1;
                const methods = methodsByGroup.get(group);
                if (!methods) {
                    fail(`${surface}: unknown generated client group clockify.${group}.${member}`);
                    continue;
                }
                if (!methods.has(member)) fail(`${surface}: non-generated method clockify.${group}.${member}`);
            }
        }
        console.log(`Snippet method parity inspected ${checkedRefs} method references against ${methodsByGroup.size} generated groups.`);
    }
}

const wiring = contract.wiring ?? {};
const makefile = readRelative("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget}`);
if (!makefile.includes(`node ${wiring.checker}`)) fail(`Makefile missing ${wiring.checker} invocation`);
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(wiring.makeTarget)) fail(`Makefile contract-gates missing ${wiring.makeTarget}`);

const docsIndex = readRelative("docs/README.md");
for (const doc of wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${doc}`)) fail(`docs/README.md missing ${doc}`);
}
if (!readRelative("docs/quality-gates.md").includes(wiring.qualityGate)) fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${wiring.inventoryId}"`)) fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${wiring.auditId}"`)) fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);

if (failures.length > 0) {
    console.error("snippet method parity contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("snippet method parity passed");
