#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateMutationCiContract } from "./lib/mutation-ci-workflow-contract.mjs";
import { commandsForPhase } from "./lib/verify-plan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

const failures = validateMutationCiContract({
    workflow: read(".github/workflows/mutation.yml"),
    makefile: read("Makefile"),
    wrapperStryker: read("wrapper/stryker.conf.json"),
    mcpStryker: read("mcp/stryker.conf.json"),
    cliStryker: read("cli/stryker.conf.json"),
    wrapperPackage: readJson("wrapper/package.json"),
    mcpPackage: readJson("mcp/package.json"),
    cliPackage: readJson("cli/package.json"),
    verifyFullCommands: commandsForPhase("full"),
});

if (failures.length > 0) {
    console.error("mutation CI workflow contract failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    "mutation CI workflow contract passed (dispatch-only, exact Node, immutable actions, complete history, guarded targets, retained reports)",
);
