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

function normalizeBlock(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    while (lines.length > 0 && lines[0].trim() === "") lines.shift();
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines.join("\n");
}

function validateContract(contract) {
    if (contract.schemaVersion !== 1) fail("schemaVersion must be 1");
    if (typeof contract.purpose !== "string" || contract.purpose.trim() === "") {
        fail("purpose must be non-empty");
    }
    if (typeof contract.marker !== "string" || contract.marker.trim() === "") {
        fail("marker must be non-empty");
    }
    if (!Array.isArray(contract.fenceLangs) || contract.fenceLangs.length === 0) {
        fail("fenceLangs must be non-empty");
    }
    if (!Number.isInteger(contract.minimumTaggedFences) || contract.minimumTaggedFences < 1) {
        fail("minimumTaggedFences must be a positive integer");
    }
    if (!Array.isArray(contract.surfaces) || contract.surfaces.length === 0) {
        fail("surfaces must be non-empty");
    }
    for (const [index, surface] of (contract.surfaces ?? []).entries()) {
        if (typeof surface?.readme !== "string" || surface.readme.trim() === "") {
            fail(`surfaces[${index}].readme must be non-empty`);
        }
        if (typeof surface?.examplesDir !== "string" || surface.examplesDir.trim() === "") {
            fail(`surfaces[${index}].examplesDir must be non-empty`);
        }
    }
    if (typeof contract.compiledBy !== "string" || contract.compiledBy.trim() === "") {
        fail("compiledBy must be non-empty");
    }

    const wiring = contract.wiring ?? {};
    for (const field of ["makeTarget", "checker", "qualityGate", "inventoryId", "auditId"]) {
        if (typeof wiring[field] !== "string" || wiring[field].trim() === "") {
            fail(`wiring.${field} must be non-empty`);
        }
    }
    if (!Array.isArray(wiring.docsIndex) || wiring.docsIndex.length === 0) {
        fail("wiring.docsIndex must be non-empty");
    }
}

function safeExamplePath(fileToken) {
    if (!fileToken) return false;
    if (fileToken.includes("..")) return false;
    if (path.isAbsolute(fileToken)) return false;
    return true;
}

const contractText = readRelative("docs/snippet-compile-contract.json");
let contract = {};
if (contractText) {
    try {
        contract = JSON.parse(contractText);
    } catch (error) {
        fail(`docs/snippet-compile-contract.json invalid JSON: ${error.message}`);
    }
}
validateContract(contract);

let inspected = 0;
if (failures.length === 0) {
    const langPattern = [...contract.fenceLangs]
        .sort((a, b) => b.length - a.length)
        .map((lang) => lang.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|");
    const fenceRegex = new RegExp(
        "```(" + langPattern + ")([^\\n]*)\\n([\\s\\S]*?)\\n```",
        "g",
    );

    for (const surface of contract.surfaces) {
        const readmeText = readRelative(surface.readme);
        if (readmeText === "") continue;

        for (const match of readmeText.matchAll(fenceRegex)) {
            const info = match[2] ?? "";
            const markerIndex = info.indexOf(contract.marker);
            if (markerIndex === -1) continue;

            const fileToken = info.slice(markerIndex + contract.marker.length).trim().split(/\s+/)[0];
            if (!safeExamplePath(fileToken)) {
                fail(`${surface.readme}: ${contract.marker}${fileToken} must be examples-relative`);
                continue;
            }

            const exampleRel = path.join(surface.examplesDir, fileToken);
            const exampleText = readRelative(exampleRel);
            if (exampleText === "") continue;

            inspected += 1;
            const fenceBody = normalizeBlock(match[3]);
            if (fenceBody === "") {
                fail(`${surface.readme}: tagged fence ${contract.marker}${fileToken} is empty`);
                continue;
            }
            const sourceBody = exampleText.replace(/\r\n/g, "\n");
            if (!sourceBody.includes(fenceBody)) {
                fail(
                    `${surface.readme}: fence tagged ${contract.marker}${fileToken} ` +
                        `is not a byte-exact slice of ${exampleRel}`,
                );
            }
        }
    }

    console.log(
        `Snippet compile parity inspected ${inspected} include-tagged fences ` +
            "against curated examples.",
    );

    if (inspected < contract.minimumTaggedFences) {
        fail(
            `expected at least ${contract.minimumTaggedFences} include-tagged fence(s), ` +
                `found ${inspected}`,
        );
    }
}

const wiring = contract.wiring ?? {};
const makefile = readRelative("Makefile");
if (!makefile.includes(`${wiring.makeTarget}:`)) fail(`Makefile missing ${wiring.makeTarget}`);
if (!makefile.includes(`node ${wiring.checker}`)) {
    fail(`Makefile missing ${wiring.checker} invocation`);
}
const aggregateLine = makefile.split("\n").find((line) => line.startsWith("contract-gates:")) ?? "";
if (!aggregateLine.includes(wiring.makeTarget)) fail(`Makefile contract-gates missing ${wiring.makeTarget}`);

const docsIndex = readRelative("docs/README.md");
for (const doc of wiring.docsIndex ?? []) {
    if (!docsIndex.includes(`./${doc}`)) fail(`docs/README.md missing ${doc}`);
}
if (!readRelative("docs/quality-gates.md").includes(wiring.qualityGate)) {
    fail(`docs/quality-gates.md missing ${wiring.qualityGate}`);
}
if (!readRelative("docs/contract-inventory.json").includes(`"id": "${wiring.inventoryId}"`)) {
    fail(`docs/contract-inventory.json missing ${wiring.inventoryId}`);
}
if (!readRelative("docs/enterprise-hardening-audit.json").includes(`"id": "${wiring.auditId}"`)) {
    fail(`docs/enterprise-hardening-audit.json missing ${wiring.auditId}`);
}

if (failures.length > 0) {
    console.error("snippet compile contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("snippet compile passed");
