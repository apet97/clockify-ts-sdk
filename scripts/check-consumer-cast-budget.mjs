#!/usr/bin/env node
// Source-aware zero request-cast ratchet for CLI/MCP request construction.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateConsumerCastGovernance } from "./lib/consumer-cast-governance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const contract = JSON.parse(
    await readFile(path.join(root, "docs/consumer-cast-budget-contract.json"), "utf8"),
);

async function listTypeScript(relativeRoot) {
    const files = [];
    const stack = [relativeRoot];
    while (stack.length > 0) {
        const directory = stack.pop();
        let entries;
        try {
            entries = await readdir(path.join(root, directory), { withFileTypes: true });
        } catch {
            failures.push(`missing governed directory ${directory}`);
            continue;
        }
        for (const entry of entries) {
            const relativePath = path.join(directory, entry.name);
            if (entry.isDirectory()) stack.push(relativePath);
            else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(relativePath);
        }
    }
    return files.sort();
}

const validation = await validateConsumerCastGovernance({ root, contract });
failures.push(...validation.failures);
const governance = contract.requestCastGovernance;
if (governance?.canonicalZeroBaseline !== true) {
    failures.push("requestCastGovernance.canonicalZeroBaseline must stay true");
}
if (JSON.stringify(governance?.sourceRoots) !== JSON.stringify({ cli: "cli/src", mcp: "mcp/src" })) {
    failures.push("requestCastGovernance.sourceRoots must govern exactly cli/src and mcp/src");
}
if (
    governance?.exceptions == null ||
    Object.keys(governance.exceptions).sort().join(",") !== "cli,mcp"
) {
    failures.push("requestCastGovernance.exceptions must contain exactly cli and mcp arrays");
}

const escapeContract = contract.forbiddenRequestEscape;
if (
    escapeContract == null ||
    escapeContract.identifier !== "wireBody" ||
    !Array.isArray(escapeContract.roots)
) {
    failures.push("forbiddenRequestEscape must name an identifier and governed roots");
} else {
    const governedFiles = new Set();
    for (const relativeRoot of escapeContract.roots) {
        for (const relativePath of await listTypeScript(relativeRoot)) governedFiles.add(relativePath);
    }
    if (escapeContract.wrapperRootTypeScript === true) {
        for (const entry of await readdir(path.join(root, "wrapper"), { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".ts")) {
                governedFiles.add(path.join("wrapper", entry.name));
            }
        }
    }
    const identifierPattern = new RegExp(`\\b${escapeContract.identifier}\\b`);
    for (const relativePath of [...governedFiles].sort()) {
        const lines = (await readFile(path.join(root, relativePath), "utf8")).split("\n");
        for (let index = 0; index < lines.length; index += 1) {
            if (identifierPattern.test(lines[index])) {
                failures.push(
                    `forbidden request escape \`${escapeContract.identifier}\` at ${relativePath}:${index + 1}`,
                );
            }
        }
    }
}

const publicProof = contract.publicNoAnyProof;
if (
    publicProof == null ||
    typeof publicProof.path !== "string" ||
    typeof publicProof.compilerGate !== "string" ||
    !Array.isArray(publicProof.contains)
) {
    failures.push("publicNoAnyProof must name its existing compiler proof and markers");
} else {
    let proofSource = "";
    try {
        proofSource = await readFile(path.join(root, publicProof.path), "utf8");
    } catch {
        failures.push(`publicNoAnyProof.path does not exist: ${publicProof.path}`);
    }
    for (const marker of publicProof.contains) {
        if (typeof marker !== "string" || !proofSource.includes(marker)) {
            failures.push(`publicNoAnyProof is missing marker ${String(marker)}`);
        }
    }
    const [makeCommand, makeTarget, ...tail] = publicProof.compilerGate.split(/\s+/);
    const makefile = await readFile(path.join(root, "Makefile"), "utf8");
    if (makeCommand !== "make" || !makeTarget || tail.length > 0 || !makefile.includes(`${makeTarget}:`)) {
        failures.push(`publicNoAnyProof.compilerGate must name one existing make target`);
    }
}

for (const packageName of ["wrapper", "cli", "mcp"]) {
    const strictness = contract.strictness?.[packageName];
    for (const option of ["strict", "noUncheckedIndexedAccess", "noImplicitOverride", "exactOptionalPropertyTypes"]) {
        if (strictness?.[option] !== true) failures.push(`strictness.${packageName}.${option} must be true`);
    }
}

if (failures.length > 0) {
    console.error("Consumer cast budget failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

const counts = Object.fromEntries(
    ["cli", "mcp"].map((packageName) => [
        packageName,
        validation.findings.filter((finding) => finding.packageName === packageName).length,
    ]),
);
console.log(
    `Consumer cast budget passed (request casts: CLI ${counts.cli}, MCP ${counts.mcp}; exceptions: CLI 0, MCP 0; public any-adapter proof governed).`,
);
