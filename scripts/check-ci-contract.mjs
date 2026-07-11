#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";

const workflowPath = ".github/workflows/ci.yml";
const workflow = readFileSync(workflowPath, "utf8");
const failures = [];
const requireText = (text, message) => {
    if (!workflow.includes(text)) failures.push(message);
};

requireText("name: Workspace CI", "workflow must be the consolidated workspace CI");
requireText('node: ["22.13.0", "24"]', "matrix must test exact Node 22.13.0 and Node 24");
for (const packageName of ["wrapper", "cli", "mcp"]) {
    requireText(`package: ${packageName}`, `matrix must cover package ${packageName}`);
}
for (const command of [
    "make sdk-codegen",
    "npm run type-check -w",
    "npm test -w",
    "npm run build -w",
    "pack-snapshot.mjs",
    "make contract-gates coverage mutation-ci",
    "npm audit --omit=dev",
]) requireText(command, `missing executable CI proof: ${command}`);

for (const line of workflow.split("\n").filter((entry) => entry.trim().startsWith("uses:"))) {
    if (!/@[0-9a-f]{40}(?:\s+#\s+v\d+)?\s*$/.test(line)) {
        failures.push(`action is not SHA pinned with a version comment: ${line.trim()}`);
    }
}
for (const removed of [".github/workflows/ci-cli.yml", ".github/workflows/ci-mcp.yml"]) {
    if (existsSync(removed)) failures.push(`duplicate package workflow still exists: ${removed}`);
}

const makefile = readFileSync("Makefile", "utf8");
for (const aggregate of ["perfect-fast", "perfect-full"]) {
    const line = makefile.split("\n").find((entry) => entry.startsWith(`${aggregate}:`)) ?? "";
    if (!line.includes("ci-contract")) failures.push(`${aggregate} must include ci-contract`);
}

if (failures.length > 0) {
    console.error("CI contract failed");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}
console.log("CI contract passed (workspace matrix, immutable actions, executable package proof)");
