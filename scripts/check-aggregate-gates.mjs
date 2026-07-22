#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { evaluateAggregateGates } from "./lib/aggregate-gates.mjs";
import { commandsForPhase } from "./lib/verify-plan.mjs";

const root = process.cwd();
const failures = [];

function fail(message) {
    failures.push(message);
}

function stringArray(value, label, { allowEmpty = false } = {}) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
        fail(`${label}: must be ${allowEmpty ? "an" : "a non-empty"} array`);
        return [];
    }
    for (const [index, entry] of value.entries()) {
        if (typeof entry !== "string" || entry.trim() === "") {
            fail(`${label}[${index}]: must be a non-empty string`);
        }
    }
    if (new Set(value).size !== value.length) fail(`${label}: must be unique`);
    return value.filter((entry) => typeof entry === "string" && entry.trim() !== "");
}

const contract = JSON.parse(
    await readFile(path.join(root, "docs/aggregate-gates-contract.json"), "utf8"),
);
const expectedMakeDirectories = [".", "../GOCLMCP"];
if (JSON.stringify(contract.makefiles?.allowedDirectories) !== JSON.stringify(expectedMakeDirectories)) {
    fail(`makefiles.allowedDirectories: must be ${JSON.stringify(expectedMakeDirectories)}`);
}
const expectedFallbacks = {
    "../GOCLMCP": "docs/aggregate-gates-goclmcp.Makefile",
};
if (JSON.stringify(contract.makefiles?.fallbacks) !== JSON.stringify(expectedFallbacks)) {
    fail(`makefiles.fallbacks: must be ${JSON.stringify(expectedFallbacks)}`);
}
const makefileSources = {};
try {
    makefileSources["."] = await readFile(path.join(root, "Makefile"), "utf8");
} catch (error) {
    fail(`./Makefile: unavailable: ${error.message}`);
}
try {
    makefileSources["../GOCLMCP"] = await readFile(
        path.join(root, "../GOCLMCP/Makefile"),
        "utf8",
    );
} catch (error) {
    if (error?.code !== "ENOENT") {
        fail(`../GOCLMCP/Makefile: unavailable: ${error.message}`);
    }
}
const makefileFallbackSources = {};
for (const [directory, relativePath] of Object.entries(expectedFallbacks)) {
    try {
        makefileFallbackSources[directory] = await readFile(path.join(root, relativePath), "utf8");
    } catch (error) {
        fail(`${directory}/Makefile fallback ${relativePath}: unavailable: ${error.message}`);
    }
}
const makefileText = makefileSources["."] ?? "";
const packageDirectories = [".", "wrapper", "cli", "mcp"];
const packageEntries = await Promise.all(
    packageDirectories.map(async (directory) => [
        directory,
        JSON.parse(await readFile(path.join(root, directory, "package.json"), "utf8")),
    ]),
);
const packageCatalog = {
    byDirectory: Object.fromEntries(packageEntries),
    byName: Object.fromEntries(
        packageEntries
            .filter(([, manifest]) => typeof manifest.name === "string")
            .map(([directory, manifest]) => [manifest.name, directory]),
    ),
};

if (contract.schemaVersion !== 1) fail("schemaVersion: must be 1");
if (typeof contract.purpose !== "string" || contract.purpose.trim() === "") {
    fail("purpose: must be a non-empty string");
}
for (const aggregate of ["perfect-fast", "perfect-full", "contract-gates"]) {
    const spec = contract.aggregates?.[aggregate];
    if (spec == null || typeof spec !== "object" || Array.isArray(spec)) {
        fail(`aggregates.${aggregate}: must be an object`);
        continue;
    }
    stringArray(spec.requiredTargets, `aggregates.${aggregate}.requiredTargets`);
    stringArray(spec.expectedSequence, `aggregates.${aggregate}.expectedSequence`);
    if (spec.requireUnitExecutionCounts !== true) {
        fail(`aggregates.${aggregate}.requireUnitExecutionCounts: must be true`);
    }
}
for (const phase of ["full", "release"]) {
    stringArray(contract.standaloneVerify?.[phase]?.exactlyOnce, `standaloneVerify.${phase}.exactlyOnce`);
}
const expectedStandaloneOrder = {
    "mcp-tool-manifest-drift": {
        setupPrerequisites: ["sdk-wrapper-build"],
        runTarget: "mcp-tool-manifest-drift-run",
    },
    "mcp-write-safety": {
        setupPrerequisites: ["mcp-tool-manifest-drift"],
        runTarget: "mcp-write-safety-run",
    },
    coverage: { setupPrerequisites: ["sdk-codegen"], runTarget: "coverage-run" },
};
if (JSON.stringify(contract.standaloneTargetOrder) !== JSON.stringify(expectedStandaloneOrder)) {
    fail(`standaloneTargetOrder: must be ${JSON.stringify(expectedStandaloneOrder)}`);
}
for (const [key, expected] of Object.entries({
    makeTarget: "aggregate-gates",
    checker: "scripts/check-aggregate-gates.mjs",
    contract: "docs/aggregate-gates-contract.json",
    library: "scripts/lib/aggregate-gates.mjs",
    planModule: "scripts/lib/verify-plan.mjs",
    qualityGate: "make aggregate-gates",
    inventoryId: "aggregate-gates",
    auditId: "aggregate-gates",
})) {
    if (contract.wiring?.[key] !== expected) {
        fail(`wiring.${key}: must be ${JSON.stringify(expected)}`);
    }
}

const houseSurfaces = {
    "docs/README.md": `./${path.basename(contract.wiring?.contract ?? "")}`,
    "docs/quality-gates.md": contract.wiring?.qualityGate,
    "docs/contract-inventory.json": `"id": "${contract.wiring?.inventoryId}"`,
    "docs/enterprise-hardening-audit.json": `"id": "${contract.wiring?.auditId}"`,
};
for (const [relativePath, marker] of Object.entries(houseSurfaces)) {
    if (typeof marker !== "string" || marker.trim() === "") continue;
    const source = await readFile(path.join(root, relativePath), "utf8");
    if (!source.includes(marker)) fail(`${relativePath}: missing ${JSON.stringify(marker)}`);
}
if (!makefileText.includes(`${contract.wiring?.makeTarget}:`)) {
    fail(`Makefile: missing ${contract.wiring?.makeTarget} target`);
}
if (!makefileText.includes(`node ${contract.wiring?.checker}`)) {
    fail(`Makefile: missing ${contract.wiring?.checker} invocation`);
}

if (failures.length === 0) {
    const result = evaluateAggregateGates({
        makefileText,
        contract,
        commandsForPhase,
        packageCatalog,
        makefileProvider: (directory) => makefileSources[directory],
        makefileFallbackProvider: (directory) => makefileFallbackSources[directory],
    });
    failures.push(...result.failures);
    if (failures.length === 0) {
        for (const aggregate of ["perfect-fast", "perfect-full", "contract-gates"]) {
            const proof = result.aggregates[aggregate];
            console.log(`${aggregate} sequence (${proof.sequence.length}): ${proof.sequence.join(" -> ")}`);
            console.log(
                `${aggregate} counts: ${Object.entries(proof.counts)
                    .map(([target, count]) => `${target}=${count}`)
                    .join(", ")}`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error("aggregate gates contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log("aggregate gates contract passed (3 governed aggregates; no local mutation)");
